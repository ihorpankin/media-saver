import type { BackgroundRequest, DownloadResponse } from '@/lib/core/messages';

/**
 * Отправляет запрос на скачивание в background и ждёт, пока файлы скачаются.
 * Ошибки по файлам превращает в исключение — его кнопка покажет как ошибку.
 */
export async function requestDownload(request: BackgroundRequest): Promise<DownloadResponse> {
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  const { errors } = response;
  if (errors.length === 1) throw new Error(errors[0]!.error);
  if (errors.length > 1) throw new Error(errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  return response;
}

/**
 * Вызывает `scan` сейчас и после каждого изменения DOM, но не чаще раза за кадр: все сайты —
 * SPA с бесконечной лентой, посты постоянно добавляются и перерисовываются.
 * Скрипты на `document_start` ждут DOMContentLoaded. Возвращает функцию, которая
 * запрашивает пересканирование, — для событий, которые DOM не меняют.
 */
export function watchDom(scan: () => void): () => void {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  };
  const start = () => {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    scan();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
  return schedule;
}
