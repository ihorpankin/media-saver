import { handleDownload } from '@/lib/background/downloader';
import type { BackgroundRequest } from '@/lib/core/messages';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: BackgroundRequest, _sender, sendResponse) => {
    if (message?.type !== 'download') return;
    handleDownload(message).then(sendResponse, (error: unknown) =>
      sendResponse({ completed: 0, errors: [{ index: 0, error: String(error) }] }),
    );
    // Ответ асинхронный: держим канал открытым
    return true;
  });
});
