import type { MediaItem, MediaPost } from '@/lib/core/media';
import {
  type ContextDownloadRequest,
  type DownloadRequest,
  LINKEDIN_SOURCES_ATTR,
  LINKEDIN_SOURCES_EVENT,
} from '@/lib/core/messages';
import { requestDownload, watchDom } from '@/lib/content/page';
import { createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// LinkedIn: кнопка ⬇ в строке действий поста (реакция, комментарий, репост, отправить).
// В новой ленте LinkedIn нет ни id постов, ни JSON с данными — всё собирается из разметки:
// пост находим по кнопке реакции, картинки — по адресам media.licdn.com.
// Видео — плеер video.js: среди его источников есть целые mp4 (H.264 + AAC, до 720p),
// они качаются без cookie. Список источников достаёт linkedin-page.content.ts.

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

/** Видеоплеер поста (video.js). */
function playerOf(post: Element): HTMLElement | null {
  return post.querySelector<HTMLElement>('.video-js');
}

/**
 * Лучший mp4 ролика. Список вариантов есть только у объекта плеера в JS страницы, поэтому
 * спрашиваем linkedin-page.content.ts: событие доходит до него синхронно, и ответ уже лежит
 * в атрибуте плеера, когда dispatchEvent вернулся.
 */
function bestMp4(player: HTMLElement): string | undefined {
  player.dispatchEvent(new CustomEvent(LINKEDIN_SOURCES_EVENT, { bubbles: true }));
  const sources: string[] = JSON.parse(player.getAttribute(LINKEDIN_SOURCES_ATTR) ?? '[]');
  const height = (url: string) => Number(url.match(/\/mp4-(\d+)p/)?.[1] ?? 0);
  return sources.sort((a, b) => height(b) - height(a))[0];
}

async function downloadPost(post: Element) {
  const author = authorOf(post);
  const player = playerOf(post);
  let postId: string;
  let items: MediaItem[];
  if (player) {
    const url = bestMp4(player);
    if (!url) throw new Error('no mp4 for this video (player not loaded yet?)');
    // id ролика — тот же, что у обложки: …/playlist/vid/v2/<id>/mp4-720p-…
    postId = url.match(/\/playlist\/vid\/v2\/([^/]+)\//)?.[1] ?? 'video';
    items = [{ kind: 'video', mediaId: postId, index: 1, url, ext: 'mp4' }];
  } else {
    const urls = [...new Set(postImages(post).map(largestSrc))];
    if (urls.length === 0) throw new Error('the post has no photos or videos');
    postId = imageId(urls[0]!);
    items = urls.map((url, i) => ({
      kind: 'image',
      mediaId: imageId(url),
      index: i + 1,
      url,
      ext: 'jpg',
    }));
  }
  const request: DownloadRequest = {
    type: 'download',
    post: { site: 'linkedin', postId, author, items, itemCount: items.length } satisfies MediaPost,
  };
  await requestDownload(request);
}

function scan() {
  for (const reaction of document.querySelectorAll(REACTION)) {
    const post = postOf(reaction);
    const row = actionRowOf(reaction);
    if (!row || row.querySelector('media-saver-button')) continue;
    const video = playerOf(post) !== null;
    if (!video && postImages(post).length === 0) continue;

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
        title: video ? 'Download video' : 'Download photos',
        onClick: () => downloadPost(post),
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

    watchDom(scan);
  },
});
