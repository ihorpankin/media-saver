/**
 * The common media model, the same for all sites.
 * Parsers turn their site's data into these types, and the core (buttons, downloading,
 * file names) works only with them.
 */

export type SiteId = 'instagram' | 'youtube' | 'x' | 'tiktok' | 'linkedin';

export type MediaKind = 'image' | 'video';

/** One file inside a post: a photo or video, including a carousel slide. */
export interface MediaItem {
  kind: MediaKind;
  /** Media id on the site. Always a string: Instagram ids don't fit in a Number. */
  mediaId: string;
  /** Position inside the post, from 1. Always 1 for a single post. */
  index: number;
  /** Direct link to the best ready-made file (an image or progressive mp4). */
  url: string;
  /** File extension without the dot: jpg, mp4, … */
  ext: string;
  width?: number;
  height?: number;
  /**
   * DASH manifest (MPD, XML), if the site serves video as separate tracks.
   * Often higher quality than `url`, but video and audio need muxing.
   */
  dashManifest?: string;
  /**
   * H.264 video for the "Compatible" quality setting, if the best one in `url` uses another codec
   * (TikTok serves 1080p in H.265).
   */
  compatibleUrl?: string;
  /** Video duration in seconds, if known. */
  duration?: number;
  /** Original size, if the site reports it. Needed to offer "Download original". */
  originalWidth?: number;
  originalHeight?: number;
}

/** A whole post: a single media item, a carousel, a Reel or a story item. */
export interface MediaPost {
  site: SiteId;
  /** The post key the DOM button uses to find the data (on Instagram, the shortcode or story pk). */
  postId: string;
  /** Author name, without @. */
  author?: string;
  /** Publication time, unix seconds. */
  takenAt?: number;
  /** Permanent link to the post. */
  permalink?: string;
  items: MediaItem[];
  /** Total media in the post, if `items` holds only part of it (e.g. one carousel slide). */
  itemCount?: number;
  /**
   * Position in the story reel: the reel id (`highlight:<id>` for a highlight) and the story number in it, from 1.
   * Needed to find the current story when its id isn't in the page URL.
   */
  reel?: { id: string; index: number };
}

/** Whether a better version than the one in `url` can be obtained. */
export function hasLargerOriginal(item: MediaItem): boolean {
  if (item.kind !== 'image' || !item.originalWidth || !item.width) return false;
  return item.originalWidth > item.width;
}
