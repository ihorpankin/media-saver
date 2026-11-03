import type { Settings } from '@/lib/core/settings';

/*
 * YouTube videos are downloaded not by the extension but by yt-dlp on the computer: YouTube's web player serves
 * streams over the SABR protocol with one-time tokens, and from the browser this keeps breaking.
 * The link is Native Messaging with the helper from native-host/ (installed by native-host/install.ps1).
 */

const HOST = 'com.media_saver.ytdlp';

type HostMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; file?: string }
  | { type: 'error'; message: string };

/** A clear message instead of the system one if the helper isn't installed. */
function explain(error: string | undefined): string {
  if (error?.includes('host not found')) {
    return `yt-dlp helper is not installed — run native-host\\install.ps1 (see README). Chrome: ${error}`;
  }
  if (error?.includes('Access to the specified native messaging host is forbidden')) {
    return 'the helper is registered for another extension id — run install.ps1 again';
  }
  return error ?? 'yt-dlp helper exited unexpectedly';
}

/** Downloads a video with yt-dlp. Progress in percent arrives in onProgress. */
export function downloadWithYtdlp(
  url: string,
  quality: Settings['videoQuality'],
  onProgress: (percent: number) => void,
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const port = browser.runtime.connectNative(HOST);
    let finished = false;

    port.onMessage.addListener((message: HostMessage) => {
      if (message.type === 'progress') onProgress(message.percent);
      else if (message.type === 'done') {
        finished = true;
        resolve(message.file);
      } else if (message.type === 'error') {
        finished = true;
        reject(new Error(message.message));
      }
    });
    port.onDisconnect.addListener(() => {
      if (!finished) reject(new Error(explain(browser.runtime.lastError?.message)));
    });
    port.postMessage({ action: 'download', url, quality });
  });
}
