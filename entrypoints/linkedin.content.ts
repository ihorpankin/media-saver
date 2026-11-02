import type { MediaItem, MediaPost } from '@/lib/core/media';
import type {
  ContextDownloadRequest,
  DownloadRequest,
  DownloadResponse,
} from '@/lib/core/messages';
import { createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// LinkedIn: кнопка ⬇ в строке действий поста (реакция, комментарий, репост, отправить).
// Пока только фото. В новой ленте LinkedIn нет ни id постов, ни JSON с данными — всё
// собирается из разметки: пост находим по кнопке реакции, картинки — по адресам media.licdn.com.
// Видео (HLS на dms.licdn.com) — отдельная задача.

// Только сама кнопка: у счётчика «36 reactions» в подписи тоже есть «reaction»
const REACTION = 'button[aria-label^="Reaction button"]';

/** Пост — самый верхний предок кнопки реакции, в котором нет кнопок реакции других постов. */
function postOf(reaction: Element): Element {
  let post = reaction;
  for (let el = reaction.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.querySelectorAll(REACTION).length > 1) break;
    post = el;
  }
  return post;
}

/** Строка действий — ближайший предок кнопки реакции, где есть ещё комментарий, репост, отправка. */
function actionRowOf(reaction: Element): Element | undefined {
  for (let el = reaction.parentElement; el; el = el.parentElement) {
    if (el.querySelectorAll('button, a[href]').length >= 4) return el;
  }
  return undefined;
}

/** Самая крупная версия картинки, которую LinkedIn отдал странице (адреса подписаны, размер не поменять). */
function largestSrc(img: HTMLImageElement): string {
  const candidates = (img.getAttribute('srcset') ?? '')
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter(([url]) => url)
    .map(([url, size]) => ({ url: url!, width: Number.parseInt(size ?? '0', 10) || 0 }))
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url ?? (img.currentSrc || img.src);
}

/** Фото поста: крупные картинки с media.licdn.com (`feedshare-…`). */
function postImages(post: Element): HTMLImageElement[] {
  return [...post.querySelectorAll<HTMLImageElement>('img')].filter((img) => {
    const src = img.currentSrc || img.src;
    return (
      src.includes('media.licdn.com/dms/image/') &&
      // аватарки, логотипы и обложки видео лежат там же, где фото
      !/profile-displayphoto|profile-framedphoto|company-logo|videocover/.test(src) &&
      img.getBoundingClientRect().width > 200
    );
  });
}

/** id картинки в адресе `…/dms/image/v2/<id>/<размер>/…` — из него имя файла. */
function imageId(url: string): string {
  return url.match(/\/dms\/image\/v2\/([^/]+)\//)?.[1] ?? 'image';
}

/**
 * Автор поста. Первой в посте часто идёт ссылка на того, кто его лайкнул или прокомментировал
 * («X likes this»), поэтому ищем ссылку с пометкой связи «• 2nd» или «• Following» — она у автора.
 */
function authorOf(post: Element): string | undefined {
  const links = [...post.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')];
  const author = links.find((a) => a.textContent?.includes('•')) ?? links[0];
  return author?.getAttribute('href')?.match(/\/(?:in|company)\/([^/?#]+)/)?.[1];
}

async function downloadPhotos(post: Element) {
  const urls = [...new Set(postImages(post).map(largestSrc))];
  if (urls.length === 0)
    throw new Error('в посте нет фото (видео из LinkedIn пока не поддерживаются)');
  const items: MediaItem[] = urls.map((url, i) => ({
    kind: 'image',
    mediaId: imageId(url),
    index: i + 1,
    url,
    ext: 'jpg',
  }));
  const request: DownloadRequest = {
    type: 'download',
    post: {
      site: 'linkedin',
      postId: imageId(urls[0]!),
      author: authorOf(post),
      items,
      itemCount: items.length,
    } satisfies MediaPost,
  };
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  }
}

function scan() {
  for (const reaction of document.querySelectorAll(REACTION)) {
    const post = postOf(reaction);
    const row = actionRowOf(reaction);
    if (!row || row.querySelector('media-saver-button') || postImages(post).length === 0) continue;

    // Ставим после кнопок действий: перед первым элементом-обёрткой после реакции
    // (дальше в строке идут счётчики реакций)
    const children = [...row.children];
    const before = children.slice(1).find((child) => child.tagName === 'DIV') ?? null;
    const template = before?.previousElementSibling ?? row.lastElementChild;
    const wrapper = document.createElement('div');
    if (template) wrapper.className = template.className;
    wrapper.style.display = 'flex';
    wrapper.style.alignItems = 'center';
    wrapper.append(
      createInlineButton('row', {
        title: 'Скачать фото поста',
        onClick: () => downloadPhotos(post),
      }),
    );
    row.insertBefore(wrapper, before);
  }
}

// ---- Контекстное меню: нажимаем ⬇ поста, на котором кликнули ----

let contextTarget: Element | undefined;

function contextDownload() {
  for (let el = contextTarget; el && el !== document.body; el = el.parentElement ?? undefined) {
    const host = el.querySelector<HTMLElement>('media-saver-button');
    if (host) {
      triggerDownload(host);
      return;
    }
  }
}

export default defineContentScript({
  matches: ['*://www.linkedin.com/*'],
  main() {
    document.addEventListener(
      'contextmenu',
      (event) => {
        contextTarget = event.target instanceof Element ? event.target : undefined;
      },
      true,
    );
    browser.runtime.onMessage.addListener((message: ContextDownloadRequest) => {
      if (message?.type === 'context-download') contextDownload();
    });

    let scheduled = false;
    // Лента LinkedIn подгружается и перерисовывается постоянно
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
