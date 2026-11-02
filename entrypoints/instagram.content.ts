import type { MediaPost } from '@/lib/core/media';
import type { DownloadRequest, DownloadResponse } from '@/lib/core/messages';
import { attachDownloadButton } from '@/lib/ui/download-button';

// ВРЕМЕННО (задача 0.4): кнопка на постах ленты, данные берутся прямо из DOM (способ A, только фото).
// Нужно, чтобы проверить кнопку и скачивание в настоящем Chrome. На этапе 1 заменим на экстрактор
// с перехватом данных страницы.

function shortcodeOf(article: Element): string | undefined {
  const link = article.querySelector<HTMLAnchorElement>('a[href*="/p/"], a[href*="/reel/"]');
  return link?.getAttribute('href')?.match(/\/(?:p|reel)\/([\w-]+)/)?.[1];
}

/** Загруженные крупные картинки поста (аватарки и превью отсекаем по размеру). */
function postImages(article: Element): HTMLImageElement[] {
  return [...article.querySelectorAll('img')].filter(
    (img) => img.complete && img.naturalWidth >= 300 && img.getBoundingClientRect().height > 100,
  );
}

/**
 * Блок, куда ставить кнопку. Прямой родитель картинки не подходит: поверх него Instagram
 * кладёт прозрачный слой-соседа, который перехватывает мышь. Берём самого верхнего предка
 * того же размера, что и картинка: он содержит и картинку, и этот слой.
 */
function mediaBox(img: HTMLImageElement, article: Element): HTMLElement {
  const target = img.getBoundingClientRect();
  let box: HTMLElement = img.parentElement ?? img;
  for (let el = img.parentElement; el && el !== article; el = el.parentElement) {
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
  const overlap = (img: HTMLImageElement) => {
    const r = img.getBoundingClientRect();
    return Math.max(0, Math.min(r.right, view.right) - Math.max(r.left, view.left));
  };
  const img = postImages(article).sort((a, b) => overlap(b) - overlap(a))[0];
  const li = img?.closest('li');
  if (!img || !li) return img && { img, index: 1, total: 1 };
  const width = li.getBoundingClientRect().width;
  const sentinel = [...(li.parentElement?.children ?? [])].find(
    (el) => el.getBoundingClientRect().width <= 1,
  );
  return {
    img,
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

function collectPost(article: Element, box: HTMLElement, postId: string): MediaPost {
  const slide = visibleSlide(article, box);
  if (!slide) throw new Error('не нашёл картинку (видео пока не поддерживается)');
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
        url: slide.img.currentSrc || slide.img.src,
        ext: 'jpg',
      },
    ],
  };
}

async function download(post: MediaPost): Promise<void> {
  const request: DownloadRequest = { type: 'download', post };
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
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
    const img = postImages(article)[0];
    if (!postId || !img) continue;
    const box = mediaBox(img, article);
    const host = attachDownloadButton(box, {
      title: 'Скачать этот слайд (временная версия, только фото)',
      onClick: () => download(collectPost(article, box, postId)),
    });
    if (host) buttons.set(article, host);
  }
}

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  main() {
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
  },
});
