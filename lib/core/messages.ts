import type { MediaPost } from './media';

/*
 * The extension has three parts that talk through messages:
 *
 *   page (MAIN world) ──window.postMessage──▶ content script ──runtime.sendMessage──▶ background
 *   XHR/fetch interception                    buttons, post cache                     chrome.downloads
 */

// ---- Page → content script (window.postMessage) ----

/** The tag the content script uses to tell our messages from others. */
export const PAGE_CHANNEL = 'media-saver:page';

export interface PagePostsMessage {
  channel: typeof PAGE_CHANNEL;
  type: 'posts';
  posts: MediaPost[];
}

export type PageMessage = PagePostsMessage;

export function isPageMessage(data: unknown): data is PageMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { channel?: unknown }).channel === PAGE_CHANNEL
  );
}

/**
 * LinkedIn: the content script asks the page for the video player's sources with an event on the player
 * element, and the page answers with a JSON array of mp4 links in its attribute.
 */
export const LINKEDIN_SOURCES_EVENT = 'media-saver:linkedin-sources';
export const LINKEDIN_SOURCES_ATTR = 'data-media-saver-sources';

// ---- Content script → background (runtime.sendMessage) ----

export interface DownloadRequest {
  type: 'download';
  post: MediaPost;
  /** Which items to download (`MediaItem.index` values). Without the field, all of them. */
  indexes?: number[];
}

/**
 * Download the original. In the feed photos are cut to 1080px, and the full list of sizes is
 * only on the post page: the background opens it in a background tab and takes the data.
 */
export interface OriginalRequest {
  type: 'download-original';
  /** The post as it is in the page cache: the file name and number come from it. */
  post: MediaPost;
  index: number;
}

/** The content script asks on load: was it opened for an original? */
export interface HarvestCheckRequest {
  type: 'harvest-check';
}

/** Answer to `harvest-check`: the shortcode of the post whose data to return, or `null`. */
export type HarvestCheckResponse = { postId: string } | null;

/** The background tab hands over the full post data. */
export interface HarvestResultRequest {
  type: 'harvest-result';
  post: MediaPost;
}

/** Download a YouTube video thumbnail in maximum resolution. */
export interface YoutubeThumbnailRequest {
  type: 'youtube-thumbnail';
  videoId: string;
  /** Channel name, for the folder. */
  author?: string;
}

/** Download a YouTube video with yt-dlp. The answer is a DownloadResponse, progress a YoutubeProgressMessage. */
export interface YoutubeVideoRequest {
  type: 'youtube-video';
  url: string;
}

/** Background → tab: how many percent of the video are downloaded. */
export interface YoutubeProgressMessage {
  type: 'youtube-progress';
  url: string;
  percent: number;
}

/**
 * A file downloaded by the page itself: TikTok's CDN reliably lets video through only with the site's cookies
 * and Referer, and chrome.downloads has no Referer. Bytes are base64, the background saves them.
 */
export interface BytesDownloadRequest {
  type: 'download-bytes';
  post: MediaPost;
  index: number;
  data: string;
  mime: string;
}

export type BackgroundRequest =
  | BytesDownloadRequest
  | YoutubeVideoRequest
  | DownloadRequest
  | OriginalRequest
  | HarvestCheckRequest
  | HarvestResultRequest
  | YoutubeThumbnailRequest;

// ---- Background → content script (tabs.sendMessage) ----

export type DownloadMode = 'slide' | 'all' | 'original';

/** The "Download" context menu item: download the media that was right-clicked. */
export interface ContextDownloadRequest {
  type: 'context-download';
  /** What to download: the current slide, the whole post or the original of the current photo. */
  mode: DownloadMode;
  /** Media URL from the menu. For a video it's a blob URL that can't be downloaded, so the post is needed. */
  srcUrl?: string;
}

// ---- Background → offscreen document (runtime.sendMessage) ----

/** Download DASH tracks and mux them into one mp4. The answer is a blob URL to the result. */
export interface MuxRequest {
  type: 'offscreen-mux';
  videoUrl: string;
  audioUrl: string;
}

export type MuxResponse = { url: string } | { error: string };

/** Release a blob URL after the file has downloaded. */
export interface RevokeRequest {
  type: 'offscreen-revoke';
  url: string;
}

/** Turn bytes downloaded by the page (base64) into a blob URL for chrome.downloads. */
export interface BlobRequest {
  type: 'offscreen-blob';
  data: string;
  mime: string;
}

export type OffscreenRequest = MuxRequest | RevokeRequest | BlobRequest;

/** The answer comes when all files have downloaded or failed. */
export interface DownloadResponse {
  /** How many files were downloaded. */
  completed: number;
  /** Per-file errors; an empty array means all is well. */
  errors: Array<{ index: number; error: string }>;
}
