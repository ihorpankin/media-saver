import type { PageDataParser } from '@/lib/core/extractor';
import type { MediaItem, MediaPost } from '@/lib/core/media';

/*
 * Разбор твитов из GraphQL-ответов X (`/i/api/graphql/<id>/UserTweets`, `TweetDetail`, …).
 * Твит — объект с `rest_id` и `legacy.extended_entities.media`. Ищем по форме, а не по пути:
 * ответы разных запросов вложены по-разному (лента, ответы, цитаты, «твит с ограничениями»).
 */

interface XVariant {
  url: string;
  content_type?: string;
  bitrate?: number;
}

interface XMedia {
  id_str?: string;
  type?: 'photo' | 'video' | 'animated_gif';
  media_url_https?: string;
  original_info?: { width?: number; height?: number };
  video_info?: { variants?: XVariant[] };
}

interface XTweet {
  rest_id?: string;
  legacy?: {
    id_str?: string;
    created_at?: string;
    extended_entities?: { media?: XMedia[] };
  };
  core?: {
    user_results?: {
      result?: { core?: { screen_name?: string }; legacy?: { screen_name?: string } };
    };
  };
}

const API_URL = /\/graphql\//;

function isTweet(value: object): value is XTweet {
  const tweet = value as XTweet;
  return typeof tweet.rest_id === 'string' && Array.isArray(tweet.legacy?.extended_entities?.media);
}

/**
 * Фото в оригинальном размере: `…/media/<id>.jpg` → `…/media/<id>?format=jpg&name=orig`.
 * Без `name=orig` X отдаёт уменьшенную копию.
 */
export function originalPhotoUrl(url: string): { url: string; ext: string } {
  const match = url.match(/^(.*)\.(\w+)$/);
  if (!match) return { url, ext: 'jpg' };
  return { url: `${match[1]}?format=${match[2]}&name=orig`, ext: match[2]!.toLowerCase() };
}

/** Видео и GIF: mp4 с наибольшим битрейтом (кроме mp4 есть ещё HLS-плейлист m3u8). */
export function bestVariant(variants: XVariant[] = []): XVariant | undefined {
  return variants
    .filter((v) => v.content_type === 'video/mp4')
    .sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function toItem(media: XMedia, index: number): MediaItem | undefined {
  const common = {
    mediaId: media.id_str ?? String(index),
    index,
    width: media.original_info?.width,
    height: media.original_info?.height,
  };
  if (media.type === 'photo' && media.media_url_https) {
    const { url, ext } = originalPhotoUrl(media.media_url_https);
    return { ...common, kind: 'image', url, ext };
  }
  const variant = bestVariant(media.video_info?.variants);
  if (variant) return { ...common, kind: 'video', url: variant.url, ext: 'mp4' };
  return undefined;
}

function toPost(tweet: XTweet): MediaPost {
  const user = tweet.core?.user_results?.result;
  const author = user?.core?.screen_name ?? user?.legacy?.screen_name;
  const createdAt = tweet.legacy?.created_at ? Date.parse(tweet.legacy.created_at) : NaN;
  const items = (tweet.legacy?.extended_entities?.media ?? [])
    .map((media, i) => toItem(media, i + 1))
    .filter((item): item is MediaItem => item !== undefined);
  return {
    site: 'x',
    postId: tweet.rest_id!,
    author,
    takenAt: Number.isFinite(createdAt) ? createdAt / 1000 : undefined,
    permalink: `https://x.com/${author ?? 'i'}/status/${tweet.rest_id}`,
    items,
    itemCount: items.length,
  };
}

/** Находит все твиты с медиа в любом JSON X. */
export function parseX(json: unknown): MediaPost[] {
  const posts: MediaPost[] = [];
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (isTweet(node)) {
      const post = toPost(node);
      if (post.items.length > 0) posts.push(post);
      // Не выходим: внутри может быть цитируемый твит со своими медиа
    }
    Object.values(node).forEach(walk);
  };
  walk(json);
  return posts;
}

export const xPageParser: PageDataParser = {
  shouldParse: (url) => API_URL.test(url),
  parse: parseX,
};
