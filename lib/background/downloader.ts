import { buildFilename, DEFAULT_TEMPLATE } from '@/lib/core/filename';
import { createLimiter } from '@/lib/core/limiter';
import type { DownloadRequest, DownloadResponse } from '@/lib/core/messages';

// Не больше трёх файлов одновременно: карусель из 20 слайдов не должна бить по CDN разом
const run = createLimiter(3);

/** Ждёт, пока загрузка завершится или прервётся. */
function waitForDownload(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (state: string | undefined, error?: string) => {
      if (settled || (state !== 'complete' && state !== 'interrupted')) return;
      settled = true;
      browser.downloads.onChanged.removeListener(listener);
      if (state === 'complete') resolve();
      else reject(new Error(error ?? 'interrupted'));
    };
    const listener = (delta: Browser.downloads.DownloadDelta) => {
      if (delta.id === id) finish(delta.state?.current, delta.error?.current);
    };
    browser.downloads.onChanged.addListener(listener);
    // Маленький файл мог скачаться раньше, чем мы подписались на события
    browser.downloads.search({ id }).then(([item]) => finish(item?.state, item?.error));
  });
}

async function downloadOne(url: string, filename: string): Promise<void> {
  const id = await browser.downloads.download({
    url,
    filename,
    conflictAction: 'uniquify',
    saveAs: false,
  });
  await waitForDownload(id);
}

/** Скачивает выбранные файлы поста и сообщает, сколько получилось. */
export async function handleDownload(
  request: DownloadRequest,
  template: string = DEFAULT_TEMPLATE,
): Promise<DownloadResponse> {
  const { post, indexes } = request;
  const items = indexes ? post.items.filter((i) => indexes.includes(i.index)) : post.items;

  const results = await Promise.allSettled(
    items.map((item) => run(() => downloadOne(item.url, buildFilename(post, item, template)))),
  );

  const errors: DownloadResponse['errors'] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn('[media-saver] не скачался файл', items[i]!.url, error);
      errors.push({ index: items[i]!.index, error });
    }
  });
  return { completed: results.length - errors.length, errors };
}
