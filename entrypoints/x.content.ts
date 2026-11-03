import { requestDownload, watchDom } from '@/lib/content/page';
import { createPostCache } from '@/lib/content/post-cache';
import type { MediaItem, MediaPost } from '@/lib/core/media';
import {
  isPageMessage,
  type ContextDownloadRequest,
  type DownloadRequest,
} from '@/lib/core/messages';
import { originalPhotoUrl } from '@/lib/sites/x/parse';
import { createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// X (Twitter): the ⬇ button in the action row under a tweet: "reply, repost, like, views,
// bookmark, share". Downloads all photos and videos of the tweet at original size.
// Tweet data comes from the interceptor (x-page.content.ts); without it, photos straight from the DOM.

const cache = createPostCache();

/** Tweet id from the link to it: the timestamp links to `/<user>/status/<id>`. */
function tweetIdOf(article: Element): string | undefined {
  const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
  return link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
}

/** Fallback: the tweet's photos straight from the page. A quoted tweet inside is skipped. */
function postFromDom(article: Element, postId: string): MediaPost {
  const images = [...article.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com/media/"]')]
    .filter((img) => !img.closest('[role="link"]:not(article)'))
    .map((img) => img.src);
  if (images.length === 0) throw new Error('no media data — scroll the feed or reload the page');
  const author = article
    .querySelector('a[href*="/status/"] time')
    ?.closest('a')
    ?.getAttribute('href')
    ?.split('/')[1];
  const items: MediaItem[] = images.map((src, i) => {
    // `…/media/<id>?format=jpg&name=small` → `…/media/<id>.jpg` → original
    const u = new URL(src);
    const { url, ext } = originalPhotoUrl(
      `${u.origin}${u.pathname}.${u.searchParams.get('format') ?? 'jpg'}`,
    );
    return { kind: 'image', mediaId: `${postId}-${i + 1}`, index: i + 1, url, ext };
  });
  return { site: 'x', postId, author, items, itemCount: items.length };
}

async function downloadTweet(article: Element, postId: string) {
  const post = cache.get(postId) ?? postFromDom(article, postId);
  const request: DownloadRequest = { type: 'download', post };
  await requestDownload(request);
}

function hasMedia(article: Element): boolean {
  return Boolean(
    article.querySelector('img[src*="pbs.twimg.com/media/"], video, [data-testid="videoPlayer"]'),
  );
}

function scan() {
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const postId = tweetIdOf(article);
    // A tweet can have several button groups (a quote has its own); the action row is the last one
    const group = [...article.querySelectorAll('[role="group"]')].at(-1);
    if (!postId || !group || group.querySelector('media-saver-button') || !hasMedia(article)) {
      continue;
    }
    const share = group.lastElementChild;
    const wrapper = document.createElement('div');
    // The neighboring button's classes give the same spacing and alignment as the native ones
    if (share) wrapper.className = share.className;
    wrapper.append(
      createInlineButton('row', {
        title: 'Download photos and videos',
        onClick: () => downloadTweet(article, postId),
      }),
    );
    group.insertBefore(wrapper, share);
  }
}

// ---- Context menu: press ⬇ of the tweet that was clicked ----

let contextArticle: Element | undefined;

/** A tweet has one button for all media, so any menu item downloads them. */
function contextDownload() {
  const host = contextArticle?.querySelector<HTMLElement>('media-saver-button');
  if (host) triggerDownload(host);
}

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
    });
    document.addEventListener(
      'contextmenu',
      (event) => {
        contextArticle =
          (event.target instanceof Element && event.target.closest('article')) || undefined;
      },
      true,
    );
    browser.runtime.onMessage.addListener((message: ContextDownloadRequest) => {
      if (message?.type === 'context-download') contextDownload();
    });

    watchDom(scan);
  },
});
