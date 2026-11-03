import { dashResolution, parseMpd, pickDashTracks } from '@/lib/core/dash';
import type { MediaItem } from '@/lib/core/media';
import type { MuxRequest, MuxResponse, RevokeRequest } from '@/lib/core/messages';

/*
 * Видео в полном качестве. Прогрессивный mp4 у Instagram почти всегда 720p, а в DASH есть
 * 1080p и выше, но видео и звук там раздельно. Дорожки склеивает offscreen document
 * (entrypoints/offscreen), а мы скачиваем готовый файл по его blob-ссылке.
 */

let offscreenReady: Promise<void> | undefined;

/** Создаёт offscreen document один раз: Chrome разрешает только один на расширение. */
export function ensureOffscreen(): Promise<void> {
  offscreenReady ??= (async () => {
    if (await browser.offscreen.hasDocument()) return;
    await browser.offscreen.createDocument({
      url: browser.runtime.getURL('/offscreen.html'),
      reasons: [browser.offscreen.Reason.BLOBS],
      justification:
        'Muxing DASH video and audio tracks and saving files fetched by the page before download',
    });
  })().catch((error: unknown) => {
    offscreenReady = undefined;
    throw error;
  });
  return offscreenReady;
}

/** Ссылка, которую нужно скачать, и как прибраться после скачивания. */
export interface VideoSource {
  url: string;
  release?: () => void;
}

/**
 * Лучший вариант видео: DASH, если он крупнее прогрессивного mp4, иначе обычная ссылка.
 * Если со склейкой что-то не так, молча откатываемся на прогрессивный mp4 — пусть хуже, но скачается.
 */
export async function resolveVideo(item: MediaItem): Promise<VideoSource> {
  if (!item.dashManifest) return { url: item.url };
  const tracks = parseMpd(item.dashManifest);
  const progressive = Math.max(item.width ?? 0, item.height ?? 0);
  if (dashResolution(tracks) <= progressive) return { url: item.url };

  const { video, audio } = pickDashTracks(tracks);
  if (!video) return { url: item.url };
  // Видео без звука — DASH-дорожка уже готовый mp4, склеивать нечего
  if (!audio) return { url: video.url };

  try {
    await ensureOffscreen();
    const request: MuxRequest = { type: 'offscreen-mux', videoUrl: video.url, audioUrl: audio.url };
    const response: MuxResponse = await browser.runtime.sendMessage(request);
    if ('error' in response) throw new Error(response.error);
    return {
      url: response.url,
      release: () => {
        const revoke: RevokeRequest = { type: 'offscreen-revoke', url: response.url };
        void browser.runtime.sendMessage(revoke).catch(() => {});
      },
    };
  } catch (error) {
    console.warn('[media-saver] DASH failed, downloading the regular mp4:', error);
    return { url: item.url };
  }
}
