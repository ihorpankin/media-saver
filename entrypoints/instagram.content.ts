import { createPostCache } from '@/lib/content/post-cache';
import type { MediaPost } from '@/lib/core/media';
import { isPageMessage, type DownloadRequest, type DownloadResponse } from '@/lib/core/messages';
import {
  attachOverlayButton,
  createInlineButton,
  setWaiting,
  type DownloadButtonOptions,
} from '@/lib/ui/download-button';

// Данные постов приходят от перехватчика (instagram-page.content.ts) и копятся в кэше.
// Кнопка встраивается в панели действий Instagram:
//   - лента и открытый пост: строка «лайк, комментарий, репост, поделиться» → ⬇ и «Все N»;
//   - Reels: колонка справа от ролика → ⬇ перед «Ещё»;
//   - сторис: шапка → ⬇ перед паузой.
// У плиток сеток (профиль, «Ещё от автора», поиск) панели нет — там кнопка поверх превью.
// Подписи кнопок Instagram переводятся, поэтому панели ищем по структуре, а не по тексту.

const cache = createPostCache();

const POST_LINK = /\/(?:p|reels?)\/([\w-]+)/;

function shortcodeFromHref(href: string | null | undefined): string | undefined {
  return href?.match(POST_LINK)?.[1];
}

// ---- Медиа и слайды ----

function isLargeMedia(el: HTMLImageElement | HTMLVideoElement): boolean {
  return (
    el.getBoundingClientRect().height > 100 &&
    (el instanceof HTMLVideoElement || (el.complete && el.naturalWidth >= 300))
  );
}

/** Загруженные крупные фото и видео (аватарки и превью отсекаем по размеру). */
function largeMedia(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')].filter(
    isLargeMedia,
  );
}

function visibleArea(el: Element, view: DOMRect): number {
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, view.right) - Math.max(r.left, view.left);
  const h = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top);
  return Math.max(0, w) * Math.max(0, h);
}

const viewport = () => new DOMRect(0, 0, innerWidth, innerHeight);

/**
 * Самое заметное медиа поста внутри root. Превью других постов («Ещё от автора», соседние
 * сторис) лежат внутри ссылок на них — их пропускаем. Но и сам пост может быть внутри ссылки:
 * видео в ленте обёрнуто в ссылку на свой же Reels, поэтому ссылку на `ownId` не считаем чужой.
 */
function mainMedia(root: ParentNode, ownId?: string): HTMLElement | undefined {
  const view = viewport();
  return largeMedia(root)
    .filter((el) => {
      const link = el.closest('a[href]');
      return (
        !link || (ownId !== undefined && shortcodeFromHref(link.getAttribute('href')) === ownId)
      );
    })
    .sort((a, b) => visibleArea(b, view) - visibleArea(a, view))[0];
}

/**
 * Блок медиа: самый верхний предок того же размера, что и само фото или видео.
 * В нём лежит и карусель целиком, и прозрачный слой, которым Instagram накрывает медиа.
 */
function mediaBox(media: HTMLElement, stop: Element): HTMLElement {
  const target = media.getBoundingClientRect();
  let box: HTMLElement = media.parentElement ?? media;
  for (let el = media.parentElement; el && el !== stop; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - target.width) < 2 && Math.abs(r.height - target.height) < 2) box = el;
  }
  return box;
}

function translateX(el: Element): number {
  return Number(el.getAttribute('style')?.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
}

interface Slide {
  media: HTMLElement;
  /** Номер слайда, с 1. */
  index: number;
  /** Всего слайдов, если удалось определить по разметке. */
  total?: number;
}

/**
 * Видимый слайд поста. Слайды карусели — это `li` со сдвигом translateX(номер × ширина),
 * а последний служебный `li` шириной 1px стоит на позиции «всего слайдов × ширина».
 */
function visibleSlide(root: Element, ownId?: string): Slide | undefined {
  const first = mainMedia(root, ownId);
  if (!first) return undefined;
  const box = mediaBox(first, root);
  const view = box.getBoundingClientRect();
  // Под видео часто лежит картинка-обложка того же размера: при равной площади видео важнее
  const isVideo = (el: HTMLElement) => Number(el instanceof HTMLVideoElement);
  const media = largeMedia(box).sort(
    (a, b) => visibleArea(b, view) - visibleArea(a, view) || isVideo(b) - isVideo(a),
  )[0];
  if (!media) return undefined;
  const li = media.closest('li');
  if (!li || !box.contains(li)) return { media, index: 1, total: 1 };
  const width = li.getBoundingClientRect().width;
  const sentinel = [...(li.parentElement?.children ?? [])].find(
    (el) => el.getBoundingClientRect().width <= 1,
  );
  return {
    media,
    index: Math.round(translateX(li) / width) + 1,
    total: sentinel ? Math.round(translateX(sentinel) / width) : undefined,
  };
}

/** Имя файла картинки на CDN: одинаковое во всех размерах, по нему узнаём медиа в кэше. */
function cdnFileName(url: string): string | undefined {
  try {
    return new URL(url).pathname.split('/').pop();
  } catch {
    return undefined;
  }
}

/** Пост в кэше, где есть эта картинка. Нужен, когда в адресе нет id (первая сторис автора). */
function postByImage(media: HTMLElement): MediaPost | undefined {
  if (!(media instanceof HTMLImageElement)) return undefined;
  const name = cdnFileName(media.currentSrc || media.src);
  if (!name) return undefined;
  return cache.find((post) => post.items.some((item) => cdnFileName(item.url) === name));
}

function authorOf(root: Element): string | undefined {
  // Автор — первая ссылка на профиль, текст которой совпадает с ником
  return [...root.querySelectorAll('a[href]')]
    .map((a) => ({
      name: a.getAttribute('href')?.match(/^\/([\w.]+)\/$/)?.[1],
      text: a.textContent,
    }))
    .find(({ name, text }) => name && text?.trim() === name)?.name;
}

/** Запасной путь (A): видимое фото прямо из DOM. Видео так не скачать — у него blob-ссылка. */
function postFromDom(postId: string, slide: Slide, author: string | undefined): MediaPost {
  if (!(slide.media instanceof HTMLImageElement)) {
    throw new Error('нет данных о видео — обновите страницу');
  }
  return {
    site: 'instagram',
    postId,
    author,
    itemCount: slide.total,
    items: [
      {
        kind: 'image',
        mediaId: `${postId}-${slide.index}`,
        index: slide.index,
        url: slide.media.currentSrc || slide.media.src,
        ext: 'jpg',
      },
    ],
  };
}

// ---- Скачивание ----

async function send(request: DownloadRequest): Promise<void> {
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  }
  if (response.completed === 0) throw new Error('в данных поста нет этого медиа');
}

/** Как найти пост, к которому относится кнопка. */
interface PostSource {
  /** Шорткод или pk сторис, если известен. */
  postId: () => string | undefined;
  /** Элемент, внутри которого медиа поста (article, окно поста, вьюер сторис). */
  root: () => Element;
}

function resolvePost(source: PostSource, slide: Slide | undefined): MediaPost | undefined {
  const id = source.postId();
  return (id && cache.get(id)) || (slide && postByImage(slide.media));
}

async function downloadSlide(source: PostSource) {
  const root = source.root();
  const slide = visibleSlide(root, source.postId());
  if (!slide) throw new Error('не нашёл медиа в посте');
  const post = resolvePost(source, slide);
  if (post) {
    await send({ type: 'download', post, indexes: [slide.index] });
    return;
  }
  const id = source.postId();
  if (!id) throw new Error('нет данных об этой истории — обновите страницу');
  await send({ type: 'download', post: postFromDom(id, slide, authorOf(root)) });
}

async function downloadAll(source: PostSource) {
  const post = resolvePost(source, visibleSlide(source.root(), source.postId()));
  if (!post) throw new Error('нет данных поста — обновите страницу');
  await send({ type: 'download', post });
}

function buttonOptions(source: PostSource, title = 'Скачать'): DownloadButtonOptions {
  return {
    title,
    onClick: () => downloadSlide(source),
    all: {
      count: () => {
        const id = source.postId();
        return (id && cache.get(id)?.itemCount) || undefined;
      },
      onClick: () => downloadAll(source),
    },
  };
}

// ---- Поиск панелей действий ----

const SVG_BUTTON = '[role="button"]:has(svg), button:has(svg)';

/** Кнопки с иконками. Вложенные кнопки (бывают у «Сохранить») считаем одной. */
function svgButtons(el: Element): Element[] {
  const buttons = [...el.querySelectorAll(SVG_BUTTON)];
  return buttons.filter((b) => !buttons.some((outer) => outer !== b && outer.contains(b)));
}

function hasOurButton(el: Element): boolean {
  return el.querySelector('media-saver-button') !== null;
}

/**
 * Вставляет кнопку в панель. Обёртку берём с классами соседнего элемента панели,
 * чтобы отступы были такими же, как у родных кнопок.
 */
function insertButton(
  container: Element,
  before: Element | null,
  template: Element,
  host: HTMLElement,
) {
  const wrapper = document.createElement('div');
  wrapper.className = template.className;
  wrapper.append(host);
  container.insertBefore(wrapper, before);
}

/**
 * Строка действий поста: `section` из двух частей — слева лайк, комментарий, репост,
 * «поделиться», справа «сохранить».
 */
function actionRow(root: ParentNode): Element | undefined {
  for (const section of root.querySelectorAll('section')) {
    const [left, right] = section.children;
    if (section.children.length === 2 && left && right) {
      if (svgButtons(left).length >= 3 && svgButtons(right).length === 1) return left;
    }
  }
  return undefined;
}

function attachToRow(row: Element, source: PostSource) {
  if (hasOurButton(row)) return;
  const template = row.lastElementChild;
  if (!template) return;
  insertButton(row, null, template, createInlineButton('row', buttonOptions(source)));
}

// ---- Места на странице ----

/** Посты ленты. */
function scanFeed() {
  for (const article of document.querySelectorAll('article')) {
    const postId = shortcodeFromHref(
      article.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute('href'),
    );
    if (!postId) continue;
    const row = actionRow(article);
    if (row) attachToRow(row, { postId: () => postId, root: () => article });
  }
}

/**
 * Открытый пост: отдельная страница или окно поверх ленты и профиля.
 * Адрес бывает `/p/<code>/`, `/reel/<code>/` и, если пост открыт из профиля, `/<user>/p/<code>/`.
 */
function scanPostPage() {
  if (!/\/(?:p|reel)\/[\w-]+/.test(location.pathname)) return;
  const postId = () => shortcodeFromHref(location.pathname);
  const root = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) => mainMedia(d, postId())) ??
    document.querySelector('main') ??
    document.body;
  const row = actionRow(root());
  if (row) attachToRow(row, { postId, root });
}

/**
 * Reels: справа от каждого ролика колонка «лайк, комментарий, репост, поделиться,
 * сохранить, ещё». Ставим ⬇ перед «ещё».
 */
function scanReels() {
  if (!location.pathname.startsWith('/reels/')) return;
  for (const video of document.querySelectorAll('video')) {
    if (visibleArea(video, viewport()) === 0) continue;
    // Колонка — сосед одного из предков ролика
    let column: Element | undefined;
    for (let el = video.parentElement; el && !column; el = el.parentElement) {
      column = [...(el.parentElement?.children ?? [])].find(
        (sibling) =>
          sibling !== el &&
          getComputedStyle(sibling).flexDirection === 'column' &&
          [...sibling.children].filter((child) => svgButtons(child).length > 0).length >= 5,
      );
      if (el.tagName === 'MAIN') break;
    }
    if (!column || hasOurButton(column)) continue;
    const withButtons = [...column.children].filter((child) => svgButtons(child).length > 0);
    const more = withButtons.at(-1)!;
    const reelBox = column.parentElement!;
    insertButton(
      column,
      more,
      more,
      createInlineButton(
        'column',
        buttonOptions({
          // Ролик в колонке — тот, что сейчас в адресе: Instagram меняет URL при прокрутке
          postId: () => shortcodeFromHref(location.pathname),
          root: () => reelBox,
        }),
      ),
    );
  }
}

/** pk текущей истории из адреса `/stories/<user>/<pk>/`. У первой истории автора его нет. */
function storyPk(): string | undefined {
  return location.pathname.match(/^\/stories\/(?!highlights\/)[^/]+\/(\d+)/)?.[1];
}

/** Кнопка в шапке сторис, чтобы обновлять её состояние «ждём загрузку». */
let storyButton: HTMLElement | undefined;

/**
 * Готова ли история к скачиванию: медиа загрузилось и данные о нём пришли.
 * Пока нет — кнопка показывает ожидание, а не появляется внезапно.
 */
function storyReady(root: Element): boolean {
  const slide = visibleSlide(root);
  return Boolean(slide && resolvePost({ postId: storyPk, root: () => root }, slide));
}

/** Сторис: в шапке над историей «автор · время … пауза, меню». Ставим ⬇ перед паузой. */
function scanStories() {
  if (!/^\/stories\//.test(location.pathname)) return;
  // Медиа истории ищем по размеру, не дожидаясь загрузки, чтобы кнопка появилась сразу
  const view = viewport();
  const media = [...document.querySelectorAll<HTMLElement>('img, video')]
    .filter((el) => el.getBoundingClientRect().height > 300 && !el.closest('a[href]'))
    .sort((a, b) => visibleArea(b, view) - visibleArea(a, view))[0];
  if (!media) return;
  const area = media.getBoundingClientRect();
  // Ищем кнопки шапки: в верхней полосе истории, правее середины
  for (let el = media.parentElement; el; el = el.parentElement) {
    const header = svgButtons(el).filter((button) => {
      const r = button.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.top >= area.top - 10 &&
        r.bottom <= area.top + 120 &&
        r.left > area.left + area.width / 2
      );
    });
    if (header.length === 0) continue;
    let row = header[0]!.parentElement!;
    while (!header.every((button) => row.contains(button)) && row.parentElement) {
      row = row.parentElement;
    }
    const root = el;
    if (!hasOurButton(row)) {
      const first = [...row.children].find((child) => child.contains(header[0]!))!;
      // Если pk в адресе нет, пост ищется по картинке (см. resolvePost)
      storyButton = createInlineButton('row', buttonOptions({ postId: storyPk, root: () => root }));
      insertButton(row, first, first, storyButton);
    }
    if (storyButton) setWaiting(storyButton, !storyReady(root));
    return;
  }
}

/** Плитки сеток: профиль, «Ещё от автора», поиск. Панели нет — кнопка поверх превью. */
function scanGrid() {
  for (const tile of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/p/"], a[href*="/reel/"]',
  )) {
    if (tile.closest('article')) continue;
    const postId = shortcodeFromHref(tile.getAttribute('href'));
    if (!postId || largeMedia(tile).length === 0) continue;
    attachOverlayButton(tile, {
      title: 'Скачать пост',
      onClick: () => downloadAll({ postId: () => postId, root: () => tile }),
    });
  }
}

function scan() {
  scanFeed();
  scanPostPage();
  scanReels();
  scanStories();
  scanGrid();
}

function watchDom() {
  let scheduled = false;
  // Instagram — SPA: посты появляются и перерисовываются постоянно, пересканируем не чаще раза за кадр
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  // В Reels следующий ролик появляется прокруткой, а не изменением DOM
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  // Загрузка медиа и приход данных не меняют DOM, а от них зависит ожидание в сторис
  document.addEventListener('load', schedule, true);
  document.addEventListener('loadeddata', schedule, true);
  window.addEventListener('message', schedule);
  scan();
}

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  // Слушаем перехватчик с самого начала: встроенный JSON он разбирает ещё до загрузки DOM
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchDom, { once: true });
    } else {
      watchDom();
    }
  },
});
