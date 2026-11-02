import type { MuxResponse, OffscreenRequest } from '@/lib/core/messages';
import { muxVideoAudio } from '@/lib/offscreen/mux';

// Скрытая страница расширения (offscreen document). У service worker нет URL.createObjectURL
// и мало времени жизни, поэтому скачивание дорожек и склейка видео идут здесь.

async function download(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`дорожка не скачалась: HTTP ${response.status}`);
  return response.arrayBuffer();
}

async function mux(videoUrl: string, audioUrl: string): Promise<MuxResponse> {
  try {
    const [video, audio] = await Promise.all([download(videoUrl), download(audioUrl)]);
    const result = await muxVideoAudio(video, audio);
    return { url: URL.createObjectURL(new Blob([result], { type: 'video/mp4' })) };
  } catch (error) {
    console.warn('[media-saver] склейка не удалась:', error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

browser.runtime.onMessage.addListener((message: OffscreenRequest, _sender, sendResponse) => {
  switch (message?.type) {
    case 'offscreen-mux':
      mux(message.videoUrl, message.audioUrl).then(sendResponse);
      return true;
    case 'offscreen-revoke':
      URL.revokeObjectURL(message.url);
      return;
  }
});
