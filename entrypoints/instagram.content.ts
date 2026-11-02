import { createPostCache } from '@/lib/content/post-cache';
import { hasLargerOriginal, type MediaPost } from '@/lib/core/media';
import {
  isPageMessage,
  type DownloadRequest,
  type DownloadResponse,
  type HarvestCheckResponse,
  type OriginalRequest,
} from '@/lib/core/messages';
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

/**
 * Крупное медиа по размеру на экране: аватарки и иконки меньше 100px. По natural-размеру
 * судить нельзя — превью в Explore всего 240px в ширину, хотя на экране занимают 320px.
 */
function isLargeMedia(el: HTMLImageElement | HTMLVideoElement): boolean {
  const r = el.getBoundingClientRect();
  return (
    r.height > 100 &&
    r.width > 100 &&
    (el instanceof HTMLVideoElement || (el.complete && el.naturalWidth > 0))
  );
}

/** Загруженные крупные фото и видео (аватарки и иконки отсекаем по размеру). */
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

async function send(request: DownloadRequest | OriginalRequest): Promise<void> {
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
  /** Последний способ найти пост, если не помогли ни id, ни картинка (видео в хайлайтах). */
  fallback?: (slide: Slide) => MediaPost | undefined;
}

function resolvePost(source: PostSource, slide: Slide | undefined): MediaPost | undefined {
  const id = source.postId();
  return (
    (id && cache.get(id)) ||
    (slide && postByImage(slide.media)) ||
    (slide && source.fallback?.(slide)) ||
    undefined
  );
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

/** Текущий слайд, если у него есть оригинал крупнее того, что пришло в ленту. */
function largerOriginal(source: PostSource) {
  const slide = visibleSlide(source.root(), source.postId());
  const post = resolvePost(source, slide);
  const item = slide && post?.items.find((i) => i.index === slide.index);
  // Оригиналы берутся со страницы поста, а у сторис её нет — там и так полный размер
  if (!post || !item || !hasLargerOriginal(item) || post.permalink?.includes('/stories/')) {
    return undefined;
  }
  return { post, item };
}

async function downloadOriginal(source: PostSource) {
  const found = largerOriginal(source);
  if (!found) throw new Error('у этого слайда нет оригинала крупнее');
  await send({ type: 'download-original', post: found.post, index: found.item.index });
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
    original: {
      label: () => {
        const found = largerOriginal(source);
        if (!found) return undefined;
        const { width, originalWidth } = found.item;
        return {
          text: `HD ${originalWidth}`,
          title:
            `Сейчас ${width}px, оригинал ${originalWidth}px. ` +
            'Пост на пару секунд откроется в фоновой вкладке',
        };
      },
      onClick: () => downloadOriginal(source),
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

/** Куда в строке действий вставить кнопку. */
interface RowSlot {
  container: Element;
  /** Перед каким элементом вставлять (`null` — в конец). */
  before: Element | null;
  /** Соседний элемент, чьи классы берём для отступов. */
  template: Element;
}

/**
 * Строка действий поста — `section` с лайком, комментарием, репостом, «поделиться»
 * и «сохранить». Бывает в двух видах:
 *   - лента и страница поста: две группы, слева действия, справа «сохранить» → в конец левой;
 *   - окно поста поверх ленты: все кнопки подряд, «сохранить» последняя → перед ней.
 */
function actionRow(root: ParentNode): RowSlot | undefined {
  for (const section of root.querySelectorAll('section')) {
    const children = [...section.children];
    const [left, right] = children;
    if (children.length === 2 && left && right) {
      if (svgButtons(left).length >= 3 && svgButtons(right).length === 1 && left.lastElementChild) {
        return { container: left, before: null, template: left.lastElementChild };
      }
    }
    const save = children.at(-1);
    const share = children.at(-2);
    if (children.length >= 4 && save && share && svgButtons(section).length >= 4) {
      if (svgButtons(save).length === 1)
        return { container: section, before: save, template: share };
    }
  }
  return undefined;
}

function attachToRow(slot: RowSlot, source: PostSource) {
  if (hasOurButton(slot.container)) return;
  insertButton(
    slot.container,
    slot.before,
    slot.template,
    createInlineButton('row', buttonOptions(source)),
  );
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
  // Окно поста ищем по строке действий, а не по фото: фото в нём может ещё грузиться
  const root = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) => actionRow(d)) ??
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

/**
 * Номер текущей истории по полоскам прогресса над ней. Полоски — ряд одинаковых сегментов,
 * по одному на историю; у текущего заливка сдвинута через translateX (она «едет»).
 */
function storyProgressIndex(media: HTMLElement): number | undefined {
  const area = media.getBoundingClientRect();
  const moving = [...document.querySelectorAll<HTMLElement>('div[style*="translateX"]')].find(
    (el) => {
      const r = el.getBoundingClientRect();
      return (
        r.height >= 1 &&
        r.height <= 4 &&
        r.top >= area.top - 30 &&
        r.top <= area.top + 40 &&
        r.left >= area.left - 5 &&
        r.right <= area.right + 5
      );
    },
  );
  // Сегмент — предок заливки, у родителя которого несколько детей одной ширины
  for (let segment = moving; segment?.parentElement; segment = segment.parentElement) {
    const siblings = [...segment.parentElement.children];
    const width = segment.getBoundingClientRect().width;
    if (
      siblings.length >= 2 &&
      siblings.every((s) => Math.abs(s.getBoundingClientRect().width - width) < 2)
    ) {
      return siblings.indexOf(segment) + 1;
    }
  }
  return undefined;
}

/**
 * История по её месту в ленте: для видео в хайлайтах, где в адресе нет id истории, а по
 * картинке видео не найти. Длительность ролика сверяем с данными, чтобы не ошибиться номером.
 */
function storyByPosition(slide: Slide): MediaPost | undefined {
  const index = storyProgressIndex(slide.media);
  if (!index) return undefined;
  const path = location.pathname;
  const highlight = path.match(/^\/stories\/highlights\/(\d+)/)?.[1];
  const user = highlight ? undefined : path.match(/^\/stories\/([^/]+)/)?.[1];
  const post = cache.find(
    (p) =>
      p.reel?.index === index &&
      (highlight
        ? p.reel.id === `highlight:${highlight}`
        : p.author === user && Boolean(p.permalink?.includes('/stories/'))),
  );
  const item = post?.items[0];
  if (!item) return undefined;
  if (slide.media instanceof HTMLVideoElement) {
    const duration = slide.media.duration;
    if (item.kind !== 'video') return undefined;
    if (item.duration && Number.isFinite(duration) && Math.abs(item.duration - duration) > 1.5) {
      return undefined;
    }
  }
  return post;
}

/** pk текущей истории, а если его нет — номер по полоскам прогресса. */
const storySource = (root: Element): PostSource => ({
  postId: storyPk,
  root: () => root,
  fallback: storyByPosition,
});

/** Кнопка в шапке сторис, чтобы обновлять её состояние «ждём загрузку». */
let storyButton: HTMLElement | undefined;

/**
 * Готова ли история к скачиванию: медиа загрузилось и данные о нём пришли.
 * Пока нет — кнопка показывает ожидание, а не появляется внезапно.
 */
function storyReady(root: Element): boolean {
  const slide = visibleSlide(root);
  return Boolean(slide && resolvePost(storySource(root), slide));
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
      // Если pk в адресе нет (хайлайты, первая история), пост ищется по картинке или по номеру
      storyButton = createInlineButton('row', buttonOptions(storySource(root)));
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

// ---- Фоновая вкладка для «Скачать оригинал» ----

/** Проверка «данные готовы — отдаём», пока вкладка ждёт пост. */
let harvest: (() => void) | undefined;

/** Все фото поста в полном размере: столько, сколько обещает original_width. */
function hasOriginals(post: MediaPost): boolean {
  return post.items.every(
    (item) =>
      item.kind !== 'image' || !item.originalWidth || (item.width ?? 0) >= item.originalWidth,
  );
}

function startHarvest(postId: string) {
  let sent = false;
  const send = () => {
    const post = cache.get(postId);
    if (sent || !post) return;
    sent = true;
    harvest = undefined;
    void browser.runtime.sendMessage({ type: 'harvest-result', post });
  };
  harvest = () => {
    const post = cache.get(postId);
    if (post && hasOriginals(post)) send();
  };
  harvest();
  // Если полного списка размеров так и не пришло, отдаём лучшее, что есть
  setTimeout(send, 5000);
}

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  // Слушаем перехватчик с самого начала: встроенный JSON он разбирает ещё до загрузки DOM
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
      harvest?.();
    });

    // Если background открыл эту вкладку ради оригинала, отдаём ему данные поста
    void browser.runtime
      .sendMessage({ type: 'harvest-check' })
      .then((target: HarvestCheckResponse) => target && startHarvest(target.postId));

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchDom, { once: true });
    } else {
      watchDom();
    }
  },
});
