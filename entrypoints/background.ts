import { handleDownload } from '@/lib/background/downloader';
import { handleOriginal, harvestResult, harvestTarget } from '@/lib/background/original';
import type { BackgroundRequest, DownloadResponse } from '@/lib/core/messages';

const failed = (error: unknown): DownloadResponse => ({
  completed: 0,
  errors: [{ index: 0, error: error instanceof Error ? error.message : String(error) }],
});

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundRequest, sender, sendResponse) => {
    switch (message?.type) {
      case 'download':
        handleDownload(message).then(sendResponse, (e: unknown) => sendResponse(failed(e)));
        // Ответ асинхронный: держим канал открытым
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
