import { setupContextMenu } from '@/lib/background/context-menu';
import { handleDownload } from '@/lib/background/downloader';
import { handleOriginal, harvestResult, harvestTarget } from '@/lib/background/original';
import { downloadThumbnail } from '@/lib/background/youtube';
import { downloadWithYtdlp } from '@/lib/background/ytdlp';
import type {
  BackgroundRequest,
  DownloadResponse,
  YoutubeProgressMessage,
} from '@/lib/core/messages';
import { loadSettings } from '@/lib/core/settings';

const failed = (error: unknown): DownloadResponse => ({
  completed: 0,
  errors: [{ index: 0, error: error instanceof Error ? error.message : String(error) }],
});

export default defineBackground(() => {
  setupContextMenu();

  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    switch (message?.type) {
      case 'download':
        handleDownload(message).then(sendResponse, (e: unknown) => sendResponse(failed(e)));
        // Ответ асинхронный: держим канал открытым
        return true;
      case 'youtube-video': {
        const tabId = sender.tab?.id;
        loadSettings()
          .then((settings) =>
            downloadWithYtdlp(message.url, settings.videoQuality, (percent) => {
              if (tabId === undefined) return;
              const progress: YoutubeProgressMessage = {
                type: 'youtube-progress',
                url: message.url,
                percent,
              };
              void browser.tabs.sendMessage(tabId, progress).catch(() => {});
            }),
          )
          .then(
            () => sendResponse({ completed: 1, errors: [] } satisfies DownloadResponse),
            (e: unknown) => sendResponse(failed(e)),
          );
        return true;
      }
      case 'youtube-thumbnail':
        downloadThumbnail(message.videoId, message.author).then(sendResponse, (e: unknown) =>
          sendResponse(failed(e)),
        );
        return true;
      case 'download-original':
        handleOriginal(message).then(sendResponse, (e: unknown) => sendResponse(failed(e)));
        return true;
      case 'harvest-check': {
        const postId = harvestTarget(sender.tab?.id);
        sendResponse(postId ? { postId } : null);
        return;
      }
      case 'harvest-result':
        harvestResult(sender.tab?.id, message.post);
        return;
    }
  });
});
