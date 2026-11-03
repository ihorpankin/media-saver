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

// TikTok: the ⬇ button in the column to the right of the video (avatar, like, comments, favorites,
// share) in For You, on the video page and in Following. On profile tiles the button
// sits over the preview. Video data comes from the interceptor (tiktok-page.content.ts).

const cache = createPostCache();

/** Response body in base64: that's how bytes pass through extension messages. */
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
 * Videos are downloaded from here, the page: TikTok's CDN reliably serves the file only to a request with
 * the site's cookies and Referer (chrome.downloads has no Referer, so the file comes back as an error page).
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

  let lastError = 'no video link';
  for (const url of urls) {
    const response = await fetch(url, { credentials: 'include' }).catch(() => undefined);
    const type = response?.headers.get('content-type') ?? '';
    if (!response?.ok || !type.startsWith('video/')) {
      lastError = `TikTok server did not return the video (${response?.status ?? 'no response'})`;
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
  if (!post) throw new Error('no data for this video — scroll the feed or reload the page');
  const video = post.items.find((item) => item.kind === 'video');
  if (video) return downloadVideo(post, video);
  // Photo post: images from tiktokcdn download fine with a regular download too
  const request: DownloadRequest = { type: 'download', post };
  await requestDownload(request);
}

/** Video id in a feed card: the player has an id like `xgwrapper-0-<id>`. */
function videoIdOf(card: Element): string | undefined {
  return card.querySelector('[id^="xgwrapper-"]')?.id.match(/(\d{15,})$/)?.[1];
}

/** Feeds: the button after Share, styled like the neighboring buttons in the column. */
function scanFeed() {
  for (const card of document.querySelectorAll(
    'article[data-e2e="recommend-list-item-container"]',
  )) {
    const share = card.querySelector('[data-e2e="share-icon"]');
    const column = share?.closest('section');
    const postId = videoIdOf(card);
    if (!share || !column || !postId || column.querySelector('media-saver-button')) continue;

    const host = createInlineButton('circle', {
      title: 'Download video',
      label: 'Download',
      onClick: () => download(postId),
    });
    // Icon color and circle background as in Share, to match TikTok's theme
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

/** Profile, search and "Related" tiles: the button over the preview. */
function scanTiles() {
  for (const tile of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/video/"], a[href*="/photo/"]',
  )) {
    const postId = tile.getAttribute('href')?.match(/\/(?:video|photo)\/(\d+)/)?.[1];
    if (!postId || tile.getBoundingClientRect().height < 100 || !tile.querySelector('img, video')) {
      continue;
    }
    attachOverlayButton(tile, { title: 'Download', onClick: () => download(postId) });
  }
}

// ---- Context menu: press ⬇ of the video that was clicked ----

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
