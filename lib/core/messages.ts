import type { MediaPost } from './media';

/*
 * Расширение состоит из трёх частей, которые общаются сообщениями:
 *
 *   страница (MAIN world) ──window.postMessage──▶ content script ──runtime.sendMessage──▶ background
 *   перехват XHR/fetch                            кнопки, кэш постов                       chrome.downloads
 */

// ---- Страница → content script (window.postMessage) ----

/** Метка, по которой content script отличает наши сообщения от чужих. */
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

// ---- Content script → background (runtime.sendMessage) ----

export interface DownloadRequest {
  type: 'download';
  post: MediaPost;
  /** Какие элементы скачать (значения `MediaItem.index`). Без поля — все. */
  indexes?: number[];
}

export type BackgroundRequest = DownloadRequest;

export type DownloadResponse = { ok: true; started: number } | { ok: false; error: string };
