import type { MediaPost } from '@/lib/core/media';

/*
 * YouTube video thumbnails. The images are on i.ytimg.com at predictable URLs, from largest
 * to smallest: not every video has maxresdefault (1280×720 and up), every video has hqdefault.
 */

const ID = /^[\w-]{11}$/;

/** Video id from a link: watch?v=…, /shorts/…, youtu.be/…, /embed/…, /live/… */
export function videoIdFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    const fromQuery = u.searchParams.get('v');
    if (fromQuery && ID.test(fromQuery)) return fromQuery;
    const host = u.hostname.replace(/^www\.|^m\./, '');
    const path = u.pathname.split('/').filter(Boolean);
    const id =
      host === 'youtu.be'
        ? path[0]
        : ['shorts', 'embed', 'live', 'v'].includes(path[0] ?? '')
          ? path[1]
          : host === 'i.ytimg.com' && path[0]?.startsWith('vi')
            ? path[1]
            : undefined;
    return id && ID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Thumbnail URLs from largest to smallest. */
export function thumbnailCandidates(videoId: string): string[] {
  return ['maxresdefault', 'sddefault', 'hqdefault'].map(
    (name) => `https://i.ytimg.com/vi/${videoId}/${name}.jpg`,
  );
}

/** A post for downloading the thumbnail: `youtube/<channel>/<id>.jpg`. */
export function thumbnailPost(videoId: string, url: string, author?: string): MediaPost {
  return {
    site: 'youtube',
    postId: videoId,
    author,
    permalink: `https://www.youtube.com/watch?v=${videoId}`,
    items: [{ kind: 'image', mediaId: videoId, index: 1, url, ext: 'jpg' }],
  };
}
