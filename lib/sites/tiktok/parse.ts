import type { PageDataParser } from '@/lib/core/page-parser';
import type { MediaItem, MediaPost } from '@/lib/core/media';

/*
 * Parsing TikTok videos. The same `itemStruct` object comes both in the embedded data
 * of the video page (`__UNIVERSAL_DATA_FOR_REHYDRATION__`) and in feeds (`/api/…/item_list/`).
 * Video: `video.bitrateInfo` has several qualities, each a separate mp4 with audio.
 * Photo post: `imagePost.images[]`.
 */

interface TikTokPlayAddr {
  UrlList?: string[];
  Width?: number;
  Height?: number;
}

interface TikTokBitrate {
  Bitrate?: number;
  CodecType?: string;
  PlayAddr?: TikTokPlayAddr;
}

interface TikTokItem {
  id?: string;
  createTime?: number | string;
  author?: { uniqueId?: string } | string;
  video?: {
    playAddr?: string;
    width?: number;
    height?: number;
    duration?: number;
    bitrateInfo?: TikTokBitrate[];
  };
  imagePost?: {
    images?: Array<{
      imageURL?: { urlList?: string[] };
      imageWidth?: number;
      imageHeight?: number;
    }>;
  };
}

const API_URL = /\/api\//;

function isItem(value: object): value is TikTokItem {
  const item = value as TikTokItem;
  return (
    typeof item.id === 'string' &&
    /^\d{10,}$/.test(item.id) &&
    typeof item.video === 'object' &&
    item.video !== null &&
    (Boolean(item.video.playAddr) ||
      Array.isArray(item.video.bitrateInfo) ||
      Boolean(item.imagePost))
  );
}

const height = (b: TikTokBitrate) => Math.max(b.PlayAddr?.Width ?? 0, b.PlayAddr?.Height ?? 0);
const isH264 = (b: TikTokBitrate) => (b.CodecType ?? '').startsWith('h264');

/** The best quality: the highest resolution, then bitrate. Separately, the best in H.264. */
export function pickVideo(bitrates: TikTokBitrate[] = []) {
  const usable = bitrates.filter((b) => b.PlayAddr?.UrlList?.length);
  const order = (a: TikTokBitrate, b: TikTokBitrate) =>
    height(b) - height(a) || (b.Bitrate ?? 0) - (a.Bitrate ?? 0);
  return {
    best: [...usable].sort(order)[0],
    compatible: usable.filter(isH264).sort(order)[0],
  };
}

function videoItem(item: TikTokItem): MediaItem | undefined {
  const video = item.video!;
  const { best, compatible } = pickVideo(video.bitrateInfo);
  const url = best?.PlayAddr?.UrlList?.[0] ?? video.playAddr;
  if (!url) return undefined;
  return {
    kind: 'video',
    mediaId: item.id!,
    index: 1,
    url,
    compatibleUrl: compatible?.PlayAddr?.UrlList?.[0],
    ext: 'mp4',
    width: best?.PlayAddr?.Width ?? video.width,
    height: best?.PlayAddr?.Height ?? video.height,
    duration: video.duration,
  };
}

function photoItems(item: TikTokItem): MediaItem[] {
  return (item.imagePost?.images ?? []).flatMap((image, i) => {
    const url = image.imageURL?.urlList?.[0];
    if (!url) return [];
    const ext = url.match(/\.(jpe?g|png|webp|heic)(?:[?~]|$)/i)?.[1]?.toLowerCase() ?? 'jpg';
    return [
      {
        kind: 'image' as const,
        mediaId: `${item.id}-${i + 1}`,
        index: i + 1,
        url,
        ext: ext === 'jpeg' ? 'jpg' : ext,
        width: image.imageWidth,
        height: image.imageHeight,
      },
    ];
  });
}

function toPost(item: TikTokItem): MediaPost {
  const author = typeof item.author === 'string' ? item.author : item.author?.uniqueId;
  // Photo post: images; a regular video: the video
  const items = item.imagePost?.images?.length
    ? photoItems(item)
    : [videoItem(item)].filter((i) => i !== undefined);
  return {
    site: 'tiktok',
    postId: item.id!,
    author,
    takenAt: Number(item.createTime) || undefined,
    permalink: `https://www.tiktok.com/@${author ?? 'tiktok'}/${item.imagePost ? 'photo' : 'video'}/${item.id}`,
    items,
    itemCount: items.length,
  };
}

/** Finds all videos and photo posts in any TikTok JSON. */
export function parseTikTok(json: unknown): MediaPost[] {
  const posts: MediaPost[] = [];
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (isItem(node)) {
      const post = toPost(node);
      if (post.items.length > 0) posts.push(post);
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(json);
  return posts;
}

export const tiktokPageParser: PageDataParser = {
  shouldParse: (url) => API_URL.test(url),
  parse: parseTikTok,
};
