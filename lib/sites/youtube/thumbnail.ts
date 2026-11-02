import type { MediaPost } from '@/lib/core/media';

/*
 * Превью роликов YouTube. Картинки лежат на i.ytimg.com по предсказуемым адресам, от большей
 * к меньшей: maxresdefault (1280×720 и больше) есть не у всех роликов, hqdefault — у всех.
 */

const ID = /^[\w-]{11}$/;

/** id ролика из ссылки: watch?v=…, /shorts/…, youtu.be/…, /embed/…, /live/… */
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

/** Адреса превью от самого большого к самому маленькому. */
export function thumbnailCandidates(videoId: string): string[] {
  return ['maxresdefault', 'sddefault', 'hqdefault'].map(
    (name) => `https://i.ytimg.com/vi/${videoId}/${name}.jpg`,
  );
}

/** Пост для скачивания превью: `youtube/<канал>/<id>.jpg`. */
export function thumbnailPost(videoId: string, url: string, author?: string): MediaPost {
  return {
    site: 'youtube',
    postId: videoId,
    author,
    permalink: `https://www.youtube.com/watch?v=${videoId}`,
    items: [{ kind: 'image', mediaId: videoId, index: 1, url, ext: 'jpg' }],
  };
}
