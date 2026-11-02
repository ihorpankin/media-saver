import type { Settings } from '@/lib/core/settings';

/*
 * Видео с YouTube качает не расширение, а yt-dlp на компьютере: веб-плеер YouTube отдаёт
 * потоки по протоколу SABR с одноразовыми токенами, и из браузера это постоянно ломается.
 * Связь — Native Messaging с хелпером из native-host/ (его ставит native-host/install.ps1).
 */

const HOST = 'com.media_saver.ytdlp';

type HostMessage =
  | { type: 'progress'; percent: number }
  | { type: 'done'; file?: string }
  | { type: 'error'; message: string };

/** Понятное сообщение вместо системного, если хелпер не установлен. */
function explain(error: string | undefined): string {
  if (error?.includes('host not found')) {
    return `хелпер yt-dlp не установлен — запустите native-host\\install.ps1 (см. README). Chrome: ${error}`;
  }
  if (error?.includes('Access to the specified native messaging host is forbidden')) {
    return 'хелпер зарегистрирован для другого id расширения — запустите install.ps1 заново';
  }
  return error ?? 'хелпер yt-dlp неожиданно завершился';
}

/** Скачивает ролик через yt-dlp. Прогресс в процентах приходит в onProgress. */
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
