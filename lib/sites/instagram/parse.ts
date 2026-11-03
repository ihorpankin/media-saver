import type { PageDataParser } from '@/lib/core/page-parser';
import type { MediaItem, MediaPost } from '@/lib/core/media';

/*
 * Parsing Instagram media objects. The structure is the same in REST (`/api/v1/…`), GraphQL responses
 * (`xdt_api__v1__…`) and the page's embedded JSON, so objects are found by shape, not by path.
 * Details are in docs/instagram.md.
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
  video_duration?: number | null;
  carousel_media?: IgMedia[] | null;
}

const API_URL = /\/graphql\/query|\/api\/graphql|\/api\/v1\//;

const SHORTCODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** media pk → shortcode (base64 with its own alphabet). */
export function shortcodeFromPk(pk: string): string {
  let n = BigInt(pk);
  let code = '';
  do {
    code = SHORTCODE_ALPHABET[Number(n % 64n)] + code;
    n /= 64n;
  } while (n > 0n);
  return code;
}

/**
 * shortcode → media pk. Posts from private accounts may have a tail appended to the shortcode,
 * the pk itself is encoded in the first 11 characters.
 */
export function pkFromShortcode(code: string): string {
  let n = 0n;
  for (const char of code.slice(0, 11)) {
    const digit = SHORTCODE_ALPHABET.indexOf(char);
    if (digit < 0) throw new Error(`not a shortcode: ${code}`);
    n = n * 64n + BigInt(digit);
  }
  return n.toString();
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
 * pk from the string `id` (`<pk>_<user_id>`): a numeric `pk` above 2^53 loses digits in JSON.parse.
 */
function pkOf(media: IgMedia): string {
  return String(media.id ?? media.pk).split('_')[0]!;
}

/** Length of the `stp` parameter: the shorter it is, the less server processing and the closer to the original. */
function stpLength(url: string): number {
  try {
    return new URL(url).searchParams.get('stp')?.length ?? 0;
  } catch {
    return 0;
  }
}

/** The best candidate: the largest area, on a tie the shortest `stp`. */
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
    // In Reels and stories video_versions have no sizes, so take the first one: Instagram puts the best first
    const video = bestCandidate(media.video_versions) ?? media.video_versions[0]!;
    return {
      ...common,
      kind: 'video',
      url: video.url,
      ext: 'mp4',
      width: video.width,
      height: video.height,
      duration: media.video_duration ?? undefined,
      dashManifest: media.video_dash_manifest ?? undefined,
    };
  }

  // A video without video_versions shows up in shortened responses that only have the cover.
  // Don't hand out the cover as the video; wait for a full copy of the post
  if (media.media_type === 2) return undefined;

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
    // The story button looks up data by the pk from the `/stories/<user>/<pk>/` URL, the post button by shortcode
    postId: isStory ? pk : code,
    author,
    takenAt: media.taken_at,
    permalink,
    items,
    itemCount: items.length,
  };
}

/** Finds all posts in any Instagram JSON. */
export function parseInstagram(json: unknown): MediaPost[] {
  const posts: MediaPost[] = [];
  const walk = (node: unknown, reel?: MediaPost['reel']) => {
    // Embedded data sometimes keeps a whole API response as a string (`__bbox.result.response`
    // in Explore); such strings are unpacked if they contain media
    if (typeof node === 'string') {
      if (node.length > 100 && /^\s*[[{]/.test(node) && node.includes('image_versions2')) {
        try {
          walk(JSON.parse(node));
        } catch {
          // Not JSON, just text
        }
      }
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    if (Array.isArray(node)) {
      node.forEach((child) => walk(child));
      return;
    }
    if (isMedia(node)) {
      // Carousel slides are parsed inside toPost and aren't counted as separate posts
      const post = toPost(node);
      if (reel) post.reel = reel;
      if (post.items.length > 0) posts.push(post);
      return;
    }
    // Story reel: `{ id: "highlight:…" or the author pk, items: [story, …] }`.
    // Remember the order: a highlight URL has no id of the current story, only its number on screen
    const { id, items } = node as { id?: unknown; items?: unknown };
    for (const [key, value] of Object.entries(node)) {
      if (
        key === 'items' &&
        Array.isArray(items) &&
        (typeof id === 'string' || typeof id === 'number')
      ) {
        items.forEach((item, i) => walk(item, { id: String(id), index: i + 1 }));
      } else {
        walk(value);
      }
    }
  };
  walk(json);
  return posts;
}

export const instagramPageParser: PageDataParser = {
  shouldParse: (url) => API_URL.test(url),
  parse: parseInstagram,
};
