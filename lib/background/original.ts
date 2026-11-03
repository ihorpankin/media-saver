import type { MediaPost } from '@/lib/core/media';
import type { DownloadResponse, OriginalRequest } from '@/lib/core/messages';
import { handleDownload } from './downloader';

/*
 * "Download original". In the feed and in the REST response photos are cut to 1080px, and the full list
 * of sizes comes only in the post page's embedded JSON. So the post is opened
 * in an inactive tab (a regular navigation, as if the user opened the link),
 * the content script there hands over the post data, and the tab is closed.
 */

const TIMEOUT_MS = 20_000;

/** Background tabs waiting for data: tab id → shortcode and handler. */
const pending = new Map<number, { postId: string; resolve: (post: MediaPost) => void }>();

/** The post shortcode, if the tab was opened for an original. */
export function harvestTarget(tabId: number | undefined): string | undefined {
  return tabId === undefined ? undefined : pending.get(tabId)?.postId;
}

/** Data from the background tab. */
export function harvestResult(tabId: number | undefined, post: MediaPost) {
  if (tabId !== undefined) pending.get(tabId)?.resolve(post);
}

async function fetchFullPost(postId: string): Promise<MediaPost> {
  const tab = await browser.tabs.create({
    url: `https://www.instagram.com/p/${postId}/`,
    active: false,
  });
  const tabId = tab.id!;
  try {
    return await new Promise<MediaPost>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('the post page did not respond in 20 seconds')),
        TIMEOUT_MS,
      );
      pending.set(tabId, {
        postId,
        resolve: (post) => {
          clearTimeout(timer);
          resolve(post);
        },
      });
    });
  } finally {
    pending.delete(tabId);
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

/** Downloads a post item at original size. */
export async function handleOriginal({ post, index }: OriginalRequest): Promise<DownloadResponse> {
  const full = await fetchFullPost(post.postId);
  const item = full.items.find((i) => i.index === index);
  if (!item) return { completed: 0, errors: [{ index, error: 'no such slide in the post' }] };
  // File name as for a regular download: the author and slide count come from the source post
  return handleDownload({
    type: 'download',
    post: { ...post, items: [item], itemCount: post.itemCount ?? post.items.length },
    indexes: [index],
  });
}
