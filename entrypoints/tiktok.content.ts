import { requestDownload, watchDom } from '@/lib/content/page';
import { createPostCache } from '@/lib/content/post-cache';
import type { MediaItem, MediaPost } from '@/lib/core/media';
import {
  isPageMessage,
  type BytesDownloadRequest,
  type ContextDownloadRequest,
  type DownloadRequest,
} from '@/lib/core/messages';
import { loadSettings } from '@/lib/core/settings';
import { attachOverlayButton, createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// TikTok: кнопка ⬇ в колонке справа от ролика (аватар, лайк, комментарии, избранное,
// поделиться) — в «Для вас», на странице ролика и в «Подписках». На плитках профиля —
// кнопка поверх превью. Данные роликов приходят от перехватчика (tiktok-page.content.ts).

const cache = createPostCache();

/** Содержимое ответа в base64 — так байты проходят через сообщения расширения. */
async function toBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/**
 * Видео качаем отсюда, со страницы: CDN TikTok стабильно отдаёт файл только запросу с cookie
 * и Referer сайта (у chrome.downloads Referer нет — файл приходит страницей ошибки).
 */
async function downloadVideo(post: MediaPost, item: MediaItem) {
  const { videoQuality } = await loadSettings();
  const urls = [
    ...new Set(
      videoQuality === 'compatible'
        ? [item.compatibleUrl, item.url]
        : [item.url, item.compatibleUrl],
    ),
  ].filter((u): u is string => Boolean(u));

  let lastError = 'нет ссылки на видео';
  for (const url of urls) {
    const response = await fetch(url, { credentials: 'include' }).catch(() => undefined);
    const type = response?.headers.get('content-type') ?? '';
    if (!response?.ok || !type.startsWith('video/')) {
      lastError = `сервер TikTok не отдал видео (${response?.status ?? 'нет ответа'})`;
      continue;
    }
    const request: BytesDownloadRequest = {
      type: 'download-bytes',
      post,
      index: item.index,
      data: await toBase64(await response.blob()),
      mime: type,
    };
    await requestDownload(request);
    return;
  }
  throw new Error(lastError);
}

async function download(postId: string) {
  const post = cache.get(postId);
  if (!post) throw new Error('нет данных о ролике — прокрутите ленту или обновите страницу');
  const video = post.items.find((item) => item.kind === 'video');
  if (video) return downloadVideo(post, video);
  // Фото-пост: картинки с tiktokcdn отдаются и обычному скачиванию
  const request: DownloadRequest = { type: 'download', post };
  await requestDownload(request);
}

/** id ролика в карточке ленты: у плеера id вида `xgwrapper-0-<id>`. */
function videoIdOf(card: Element): string | undefined {
  return card.querySelector('[id^="xgwrapper-"]')?.id.match(/(\d{15,})$/)?.[1];
}

/** Ленты: кнопка после «поделиться», в стиле соседних кнопок колонки. */
function scanFeed() {
  for (const card of document.querySelectorAll(
    'article[data-e2e="recommend-list-item-container"]',
  )) {
    const share = card.querySelector('[data-e2e="share-icon"]');
    const column = share?.closest('section');
    const postId = videoIdOf(card);
    if (!share || !column || !postId || column.querySelector('media-saver-button')) continue;

    const host = createInlineButton('circle', {
      title: 'Скачать ролик',
      label: 'Скачать',
      onClick: () => download(postId),
    });
    // Цвет иконки и фон кружка — как у «поделиться», чтобы совпасть с темой TikTok
    host.style.color = getComputedStyle(share).color;
    const circle = [...share.querySelectorAll<HTMLElement>('*')].find(
      (el) => getComputedStyle(el).borderRadius === '9999px',
    );
    if (circle)
      host.style.setProperty('--media-saver-circle', getComputedStyle(circle).backgroundColor);

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:center';
    wrapper.append(host);
    const shareItem = [...column.children].find((child) => child.contains(share));
    column.insertBefore(wrapper, shareItem?.nextElementSibling ?? null);
  }
}

/** Плитки профиля, поиска и «Похожих»: кнопка поверх превью. */
function scanTiles() {
  for (const tile of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/video/"], a[href*="/photo/"]',
  )) {
    const postId = tile.getAttribute('href')?.match(/\/(?:video|photo)\/(\d+)/)?.[1];
    if (!postId || tile.getBoundingClientRect().height < 100 || !tile.querySelector('img, video')) {
      continue;
    }
    attachOverlayButton(tile, { title: 'Скачать', onClick: () => download(postId) });
  }
}

// ---- Контекстное меню: нажимаем ⬇ ролика, на котором кликнули ----

let contextTarget: Element | undefined;

function contextDownload() {
  const scope = contextTarget?.closest('article, a[href*="/video/"], a[href*="/photo/"]');
  const host = scope?.querySelector<HTMLElement>('media-saver-button');
  if (host) triggerDownload(host);
}

export default defineContentScript({
  matches: ['*://www.tiktok.com/*'],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
    });
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

    watchDom(() => {
      scanFeed();
      scanTiles();
    });
  },
});
