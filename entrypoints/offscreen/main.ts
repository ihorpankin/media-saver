import type { MuxResponse, OffscreenRequest } from '@/lib/core/messages';
import { muxVideoAudio } from '@/lib/offscreen/mux';

// Hidden extension page (offscreen document). The service worker has no URL.createObjectURL
// and a short lifetime, so track downloads and video muxing happen here.

async function download(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`track download failed: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function mux(videoUrl: string, audioUrl: string): Promise<MuxResponse> {
  try {
    const [video, audio] = await Promise.all([download(videoUrl), download(audioUrl)]);
    const result = await muxVideoAudio(video, audio);
    return { url: URL.createObjectURL(new Blob([result], { type: 'video/mp4' })) };
  } catch (error) {
    console.warn('[media-saver] muxing failed:', error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

browser.runtime.onMessage.addListener((message: OffscreenRequest, _sender, sendResponse) => {
  switch (message?.type) {
    case 'offscreen-mux':
      mux(message.videoUrl, message.audioUrl).then(sendResponse);
      return true;
    case 'offscreen-blob': {
      const bytes = Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0));
      sendResponse({
        url: URL.createObjectURL(new Blob([bytes], { type: message.mime })),
      } satisfies MuxResponse);
      return;
    }
    case 'offscreen-revoke':
      URL.revokeObjectURL(message.url);
      return;
  }
});
