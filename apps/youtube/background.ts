import { downloadThumbnail } from '@/lib/background/youtube';
import { setupYoutubeMenu } from '@/lib/background/youtube-menu';
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
  setupYoutubeMenu();

  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    switch (message?.type) {
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
    }
  });
});
