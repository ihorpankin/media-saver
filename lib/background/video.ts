import { dashResolution, parseMpd, pickDashTracks } from '@/lib/core/dash';
import type { MediaItem } from '@/lib/core/media';
import type { MuxRequest, MuxResponse, RevokeRequest } from '@/lib/core/messages';

/*
 * Video in full quality. Instagram's progressive mp4 is almost always 720p, while DASH has
 * 1080p and higher, but with separate video and audio. The tracks are muxed by the offscreen document
 * (entrypoints/offscreen), and we download the finished file by its blob URL.
 */

let offscreenReady: Promise<void> | undefined;

/** Creates the offscreen document once: Chrome allows only one per extension. */
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

/** The URL to download and how to clean up afterwards. */
export interface VideoSource {
  url: string;
  release?: () => void;
}

/**
 * The best video variant: DASH if it's larger than the progressive mp4, otherwise the regular URL.
 * If muxing goes wrong, quietly fall back to the progressive mp4: worse, but it downloads.
 */
export async function resolveVideo(item: MediaItem): Promise<VideoSource> {
  if (!item.dashManifest) return { url: item.url };
  const tracks = parseMpd(item.dashManifest);
  const progressive = Math.max(item.width ?? 0, item.height ?? 0);
  if (dashResolution(tracks) <= progressive) return { url: item.url };

  const { video, audio } = pickDashTracks(tracks);
  if (!video) return { url: item.url };
  // Video without audio: the DASH track is already a finished mp4, nothing to mux
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
