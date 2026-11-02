import type { PageDataParser } from '@/lib/core/extractor';
import type { MediaItem, MediaPost } from '@/lib/core/media';

/*
 * Разбор медиа-объектов Instagram. Структура одинаковая в REST (`/api/v1/…`), GraphQL-ответах
 * (`xdt_api__v1__…`) и встроенном JSON страницы, поэтому ищем объекты по форме, а не по пути.
 * Подробности — в docs/instagram.md.
 */

interface IgCandidate {
  url: string;
  width?: number;
  height?: number;
}

interface IgMedia {
  id?: string;
  pk?: string | number;
  code?: string;
  media_type?: number;
  product_type?: string;
  taken_at?: number;
  expiring_at?: number;
  original_width?: number;
  original_height?: number;
  user?: { username?: string };
  owner?: { username?: string };
  image_versions2?: { candidates?: IgCandidate[] };
  video_versions?: IgCandidate[] | null;
  video_dash_manifest?: string | null;
  carousel_media?: IgMedia[] | null;
}

const API_URL = /\/graphql\/query|\/api\/graphql|\/api\/v1\//;

const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** media pk → shortcode (base64 со своим алфавитом). */
export function shortcodeFromPk(pk: string): string {
  let n = BigInt(pk);
  let code = '';
  do {
    code = SHORTCODE_ALPHABET[Number(n % 64n)] + code;
    n /= 64n;
  } while (n > 0n);
  return code;
}

function isMedia(value: object): value is IgMedia {
  const media = value as IgMedia;
  return (
    typeof media.image_versions2 === 'object' &&
    media.image_versions2 !== null &&
    (media.id !== undefined || media.pk !== undefined)
  );
}

/**
 * pk из строкового `id` (`<pk>_<user_id>`): числовой `pk` больше 2^53 теряет цифры в JSON.parse.
 */
function pkOf(media: IgMedia): string {
  return String(media.id ?? media.pk).split('_')[0]!;
}

/** Длина параметра `stp`: чем короче, тем меньше серверной обработки и ближе к оригиналу. */
function stpLength(url: string): number {
  try {
    return new URL(url).searchParams.get('stp')?.length ?? 0;
  } catch {
    return 0;
  }
}

/** Лучший кандидат: максимальная площадь, при равенстве — самый короткий `stp`. */
export function bestCandidate(candidates: IgCandidate[]): IgCandidate | undefined {
  return [...candidates]
    .filter((c) => c.url)
    .sort(
      (a, b) =>
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0) ||
        stpLength(a.url) - stpLength(b.url),
    )[0];
}

function extOf(url: string, fallback: string): string {
  try {
    return new URL(url).pathname.match(/\.(\w{2,4})$/)?.[1]?.toLowerCase() ?? fallback;
  } catch {
    return fallback;
  }
}

function toItem(media: IgMedia, index: number): MediaItem | undefined {
  const common = {
    mediaId: pkOf(media),
    index,
    originalWidth: media.original_width,
    originalHeight: media.original_height,
  };

  if (media.video_versions?.length) {
    // В Reels и сторис у video_versions нет размеров — тогда берём первый, Instagram ставит лучший первым
    const video = bestCandidate(media.video_versions) ?? media.video_versions[0]!;
    return {
      ...common,
      kind: 'video',
      url: video.url,
      ext: 'mp4',
      width: video.width,
      height: video.height,
      dashManifest: media.video_dash_manifest ?? undefined,
    };
  }

  const image = bestCandidate(media.image_versions2?.candidates ?? []);
  if (!image) return undefined;
  return {
    ...common,
    kind: 'image',
    url: image.url,
    ext: extOf(image.url, 'jpg'),
    width: image.width,
    height: image.height,
  };
}

function toPost(media: IgMedia): MediaPost {
  const pk = pkOf(media);
  const author = media.user?.username ?? media.owner?.username;
  const isStory = Boolean(media.expiring_at);
  const code = media.code ?? shortcodeFromPk(pk);

  const children = media.carousel_media?.length ? media.carousel_media : [media];
  const items = children
    .map((child, i) => toItem(child, i + 1))
    .filter((item): item is MediaItem => item !== undefined);

  let permalink = `https://www.instagram.com/p/${code}/`;
  if (isStory) permalink = `https://www.instagram.com/stories/${author}/${pk}/`;
  else if (media.product_type === 'clips') permalink = `https://www.instagram.com/reel/${code}/`;

  return {
    site: 'instagram',
    // Кнопка сторис ищет данные по pk из URL `/stories/<user>/<pk>/`, кнопка поста — по шорткоду
    postId: isStory ? pk : code,
    author,
    takenAt: media.taken_at,
    permalink,
    items,
    itemCount: items.length,
  };
}

/** Находит все посты в любом JSON Instagram. */
export function parseInstagram(json: unknown): MediaPost[] {
  const posts: MediaPost[] = [];
  const walk = (node: unknown) => {
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (isMedia(node)) {
      // Слайды карусели разбираются внутри toPost, отдельными постами их не считаем
      const post = toPost(node);
      if (post.items.length > 0) posts.push(post);
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(json);
  return posts;
}

export const instagramPageParser: PageDataParser = {
  shouldParse: (url) => API_URL.test(url),
  parse: parseInstagram,
};
