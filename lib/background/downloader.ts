import { buildFilename, DEFAULT_TEMPLATE } from '@/lib/core/filename';
import { createLimiter } from '@/lib/core/limiter';
import type {
  BlobRequest,
  BytesDownloadRequest,
  DownloadRequest,
  DownloadResponse,
  MuxResponse,
  RevokeRequest,
} from '@/lib/core/messages';
import { loadSettings } from '@/lib/core/settings';
import { ensureOffscreen, resolveVideo } from './video';

// No more than three files at once: a 20-slide carousel shouldn't hit the CDN all at once
const run = createLimiter(3);

/** Waits until the download completes or is interrupted. */
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
    // A small file may have finished before we subscribed to the events
    browser.downloads.search({ id }).then(([item]) => finish(item?.state, item?.error));
  });
}

async function downloadOne(url: string, filename: string, saveAs = false): Promise<void> {
  const id = await browser.downloads.download({
    url,
    filename,
    conflictAction: 'uniquify',
    saveAs,
  });
  await waitForDownload(id);
}

/** Saves a file downloaded by the page (see BytesDownloadRequest). */
export async function handleBytesDownload(
  request: BytesDownloadRequest,
): Promise<DownloadResponse> {
  const { post, index, data, mime } = request;
  const item = post.items.find((i) => i.index === index);
  if (!item) return { completed: 0, errors: [{ index, error: 'no such file in the post' }] };
  const settings = await loadSettings();
  await ensureOffscreen();
  const blobRequest: BlobRequest = { type: 'offscreen-blob', data, mime };
  const response: MuxResponse = await browser.runtime.sendMessage(blobRequest);
  if ('error' in response) return { completed: 0, errors: [{ index, error: response.error }] };
  try {
    await downloadOne(
      response.url,
      buildFilename(post, item, settings.template || DEFAULT_TEMPLATE),
      settings.saveAs,
    );
    return { completed: 1, errors: [] };
  } catch (error) {
    return { completed: 0, errors: [{ index, error: String(error) }] };
  } finally {
    const revoke: RevokeRequest = { type: 'offscreen-revoke', url: response.url };
    void browser.runtime.sendMessage(revoke).catch(() => {});
  }
}

/** Downloads the selected files of a post and reports how many succeeded. */
export async function handleDownload(request: DownloadRequest): Promise<DownloadResponse> {
  const { post, indexes } = request;
  const items = indexes ? post.items.filter((i) => indexes.includes(i.index)) : post.items;
  const settings = await loadSettings();
  // "Save as…" only for a single file: "All N" would open N dialogs in a row
  const saveAs = settings.saveAs && items.length === 1;

  const results = await Promise.allSettled(
    items.map((item) =>
      run(async () => {
        const filename = buildFilename(post, item, settings.template || DEFAULT_TEMPLATE);
        if (item.kind !== 'video') return downloadOne(item.url, filename, saveAs);
        const source =
          settings.videoQuality === 'compatible'
            ? { url: item.compatibleUrl ?? item.url }
            : await resolveVideo(item);
        try {
          await downloadOne(source.url, filename, saveAs);
        } finally {
          source.release?.();
        }
      }),
    ),
  );

  const errors: DownloadResponse['errors'] = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.warn('[media-saver] file download failed', items[i]!.url, error);
      errors.push({ index: items[i]!.index, error });
    }
  });
  return { completed: results.length - errors.length, errors };
}
