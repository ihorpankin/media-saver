import { createPostCache } from '@/lib/content/post-cache';
import type { MediaPost } from '@/lib/core/media';
import { isPageMessage, type DownloadRequest, type DownloadResponse } from '@/lib/core/messages';
import { attachDownloadButton } from '@/lib/ui/download-button';

// Данные постов приходят от перехватчика (instagram-page.content.ts) и копятся в кэше.
// Кнопка пока ставится только на посты ленты; сетка профиля, Reels и сторис — задачи 1.7–1.9.
// Если поста нет в кэше, работает запасной путь через DOM (только фото).

const cache = createPostCache();

function shortcodeOf(article: Element): string | undefined {
  const link = article.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
  return link?.getAttribute('href')?.match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
}

/** Загруженные крупные фото и видео поста (аватарки и превью отсекаем по размеру). */
function postMedia(article: Element): HTMLElement[] {
  return [...article.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')].filter(
    (el) =>
      el.getBoundingClientRect().height > 100 &&
      (el instanceof HTMLVideoElement || (el.complete && el.naturalWidth >= 300)),
  );
}

/**
 * Блок, куда ставить кнопку. Прямой родитель картинки не подходит: поверх него Instagram
 * кладёт прозрачный слой-соседа, который перехватывает мышь. Берём самого верхнего предка
 * того же размера, что и медиа: он содержит и медиа, и этот слой.
 */
function mediaBox(media: HTMLElement, article: Element): HTMLElement {
  const target = media.getBoundingClientRect();
  let box: HTMLElement = media.parentElement ?? media;
  for (let el = media.parentElement; el && el !== article; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - target.width) < 2 && Math.abs(r.height - target.height) < 2) box = el;
  }
  return box;
}

function translateX(el: Element): number {
  return Number(el.getAttribute('style')?.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
}

/**
 * Видимый слайд и его номер. Слайды карусели — это `li` со сдвигом translateX(номер × ширина),
 * а последний служебный `li` шириной 1px стоит на позиции «всего слайдов × ширина».
 */
function visibleSlide(article: Element, box: HTMLElement) {
  const view = box.getBoundingClientRect();
  const overlap = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, view.right) - Math.max(r.left, view.left));
  };
  const media = postMedia(article).sort((a, b) => overlap(b) - overlap(a))[0];
  const li = media?.closest('li');
  if (!media || !li) return media && { media, index: 1, total: 1 };
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

function authorOf(article: Element): string | undefined {
  // Тега <header> в посте больше нет: автор — первая ссылка на профиль, текст которой совпадает с ником
  return [...article.querySelectorAll('a[href]')]
    .map((a) => ({
      name: a.getAttribute('href')?.match(/^\/([\w.]+)\/$/)?.[1],
      text: a.textContent,
    }))
    .find(({ name, text }) => name && text?.trim() === name)?.name;
}

/** Запасной путь (A): видимое фото прямо из DOM. Видео так не скачать — у него blob-ссылка. */
function postFromDom(
  article: Element,
  postId: string,
  slide: { media: HTMLElement; index: number; total?: number },
): MediaPost {
  if (!(slide.media instanceof HTMLImageElement)) {
    throw new Error('нет данных о видео — обновите страницу');
  }
  return {
    site: 'instagram',
    postId,
    author: authorOf(article),
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

async function downloadSlide(article: Element, box: HTMLElement, postId: string) {
  const slide = visibleSlide(article, box);
  if (!slide) throw new Error('не нашёл медиа в посте');

  const cached = cache.get(postId);
  const request: DownloadRequest = cached
    ? { type: 'download', post: cached, indexes: [slide.index] }
    : { type: 'download', post: postFromDom(article, postId, slide) };

  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  if (response.completed === 0 && response.errors.length === 0) {
    throw new Error(`нет слайда №${slide.index} в данных поста`);
  }
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  }
}

/** Кнопка каждого поста. React перерисовывает посты, поэтому проверяем, что кнопка ещё на странице. */
const buttons = new WeakMap<Element, HTMLElement>();

function scan() {
  for (const article of document.querySelectorAll('article')) {
    if (buttons.get(article)?.isConnected) continue;
    const postId = shortcodeOf(article);
    const media = postMedia(article)[0];
    if (!postId || !media) continue;
    const box = mediaBox(media, article);
    const host = attachDownloadButton(box, {
      title: 'Скачать этот слайд',
      onClick: () => downloadSlide(article, box, postId),
    });
    if (host) buttons.set(article, host);
  }
}

function watchDom() {
  let scheduled = false;
  // Instagram — SPA: посты появляются и перерисовываются постоянно, пересканируем не чаще раза за кадр
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }).observe(document.body, { childList: true, subtree: true });
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
