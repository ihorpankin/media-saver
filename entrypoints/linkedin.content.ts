import type { MediaItem, MediaPost } from '@/lib/core/media';
import {
  type ContextDownloadRequest,
  type DownloadRequest,
  LINKEDIN_SOURCES_ATTR,
  LINKEDIN_SOURCES_EVENT,
} from '@/lib/core/messages';
import { requestDownload, watchDom } from '@/lib/content/page';
import { createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// LinkedIn: the ⬇ button in the post's action row (react, comment, repost, send).
// The new LinkedIn feed has neither post ids nor JSON data, so everything comes from markup:
// the post is found by its reaction button, images by media.licdn.com URLs.
// Video is a video.js player: its sources include whole mp4 files (H.264 + AAC, up to 720p)
// that download without cookies. The source list is fetched by linkedin-page.content.ts.

// Only the button itself: the "36 reactions" counter label also contains "reaction"
const REACTION = 'button[aria-label^="Reaction button"]';

/** The post is the topmost ancestor of the reaction button without reaction buttons of other posts. */
function postOf(reaction: Element): Element {
  let post = reaction;
  for (let el = reaction.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.querySelectorAll(REACTION).length > 1) break;
    post = el;
  }
  return post;
}

/** The action row is the nearest ancestor of the reaction button that also has comment, repost and send. */
function actionRowOf(reaction: Element): Element | undefined {
  for (let el = reaction.parentElement; el; el = el.parentElement) {
    if (el.querySelectorAll('button, a[href]').length >= 4) return el;
  }
  return undefined;
}

/** The largest version of the image LinkedIn gave the page (URLs are signed, the size can't be changed). */
function largestSrc(img: HTMLImageElement): string {
  const candidates = (img.getAttribute('srcset') ?? '')
    .split(',')
    .map((part) => part.trim().split(/\s+/))
    .filter(([url]) => url)
    .map(([url, size]) => ({ url: url!, width: Number.parseInt(size ?? '0', 10) || 0 }))
    .sort((a, b) => b.width - a.width);
  return candidates[0]?.url ?? (img.currentSrc || img.src);
}

/** Post photos: large images from media.licdn.com (`feedshare-…`). */
function postImages(post: Element): HTMLImageElement[] {
  return [...post.querySelectorAll<HTMLImageElement>('img')].filter((img) => {
    const src = img.currentSrc || img.src;
    return (
      src.includes('media.licdn.com/dms/image/') &&
      // avatars, logos and video covers live in the same place as photos
      !/profile-displayphoto|profile-framedphoto|company-logo|videocover/.test(src) &&
      img.getBoundingClientRect().width > 200
    );
  });
}

/** Image id in the `…/dms/image/v2/<id>/<size>/…` URL, used for the file name. */
function imageId(url: string): string {
  return url.match(/\/dms\/image\/v2\/([^/]+)\//)?.[1] ?? 'image';
}

/**
 * The post author. The first link in a post is often to whoever liked or commented on it
 * ("X likes this"), so look for the link with a connection mark "• 2nd" or "• Following": that's the author.
 */
function authorOf(post: Element): string | undefined {
  const links = [...post.querySelectorAll('a[href*="/in/"], a[href*="/company/"]')];
  const author = links.find((a) => a.textContent?.includes('•')) ?? links[0];
  return author?.getAttribute('href')?.match(/\/(?:in|company)\/([^/?#]+)/)?.[1];
}

/** The post's video player (video.js). */
function playerOf(post: Element): HTMLElement | null {
  return post.querySelector<HTMLElement>('.video-js');
}

/**
 * The best mp4 of the video. Only the player object in the page's JS has the list of variants, so
 * ask linkedin-page.content.ts: the event reaches it synchronously, and the answer is already
 * in the player attribute when dispatchEvent returns.
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
    // Video id is the same as the cover's: …/playlist/vid/v2/<id>/mp4-720p-…
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

    // Place it after the action buttons: before the first wrapper element after the reaction
    // (reaction counters come next in the row)
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

// ---- Context menu: press ⬇ of the post that was clicked ----

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
