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

/**
 * LinkedIn: content script спрашивает у страницы источники видеоплеера событием на элементе
 * плеера, страница отвечает JSON-массивом ссылок на mp4 в его атрибуте.
 */
export const LINKEDIN_SOURCES_EVENT = 'media-saver:linkedin-sources';
export const LINKEDIN_SOURCES_ATTR = 'data-media-saver-sources';

// ---- Content script → background (runtime.sendMessage) ----

export interface DownloadRequest {
  type: 'download';
  post: MediaPost;
  /** Какие элементы скачать (значения `MediaItem.index`). Без поля — все. */
  indexes?: number[];
}

/**
 * Скачать оригинал. В ленте фото обрезаны до 1080px, а полный список размеров есть
 * только на странице поста — background открывает её в фоновой вкладке и забирает данные.
 */
export interface OriginalRequest {
  type: 'download-original';
  /** Пост, как он есть в кэше страницы: из него берутся имя файла и номер. */
  post: MediaPost;
  index: number;
}

/** Content script спрашивает при загрузке: не открыт ли он ради оригинала? */
export interface HarvestCheckRequest {
  type: 'harvest-check';
}

/** Ответ на `harvest-check`: шорткод поста, данные которого нужно вернуть, или `null`. */
export type HarvestCheckResponse = { postId: string } | null;

/** Фоновая вкладка отдаёт полные данные поста. */
export interface HarvestResultRequest {
  type: 'harvest-result';
  post: MediaPost;
}

/** Скачать превью ролика YouTube в максимальном разрешении. */
export interface YoutubeThumbnailRequest {
  type: 'youtube-thumbnail';
  videoId: string;
  /** Название канала — для папки. */
  author?: string;
}

/** Скачать ролик YouTube через yt-dlp. Ответ — DownloadResponse, прогресс — YoutubeProgressMessage. */
export interface YoutubeVideoRequest {
  type: 'youtube-video';
  url: string;
}

/** Background → вкладка: сколько процентов ролика скачано. */
export interface YoutubeProgressMessage {
  type: 'youtube-progress';
  url: string;
  percent: number;
}

/**
 * Файл, который скачала сама страница: CDN TikTok пускает к видео надёжно только с cookie
 * и Referer сайта, а у chrome.downloads Referer нет. Байты — base64, background сохраняет.
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

/** Пункт «Скачать» в контекстном меню: скачать медиа, на котором кликнули правой кнопкой. */
export interface ContextDownloadRequest {
  type: 'context-download';
  /** Что скачать: текущий слайд, весь пост или оригинал текущего фото. */
  mode: DownloadMode;
  /** Адрес медиа из меню. У видео это blob-ссылка — по ней не скачать, нужен пост. */
  srcUrl?: string;
}

// ---- Background → offscreen document (runtime.sendMessage) ----

/** Скачать дорожки DASH и склеить в один mp4. Ответ — blob-ссылка на результат. */
export interface MuxRequest {
  type: 'offscreen-mux';
  videoUrl: string;
  audioUrl: string;
}

export type MuxResponse = { url: string } | { error: string };

/** Освободить blob-ссылку после того, как файл скачался. */
export interface RevokeRequest {
  type: 'offscreen-revoke';
  url: string;
}

/** Превратить скачанные страницей байты (base64) в blob-ссылку для chrome.downloads. */
export interface BlobRequest {
  type: 'offscreen-blob';
  data: string;
  mime: string;
}

export type OffscreenRequest = MuxRequest | RevokeRequest | BlobRequest;

/** Ответ приходит, когда все файлы скачались или упали. */
export interface DownloadResponse {
  /** Сколько файлов скачано. */
  completed: number;
  /** Ошибки по файлам, пустой массив — всё хорошо. */
  errors: Array<{ index: number; error: string }>;
}
