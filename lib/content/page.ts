import type { BackgroundRequest, DownloadResponse } from '@/lib/core/messages';

/**
 * Sends a download request to the background and waits for the files to download.
 * Per-file errors become an exception, which the button shows as an error.
 */
export async function requestDownload(request: BackgroundRequest): Promise<DownloadResponse> {
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  const { errors } = response;
  if (errors.length === 1) throw new Error(errors[0]!.error);
  if (errors.length > 1) throw new Error(errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  return response;
}

/**
 * Calls `scan` now and after every DOM change, but at most once per frame: all the sites are
 * SPAs with an infinite feed, posts keep being added and re-rendered.
 * Scripts at `document_start` wait for DOMContentLoaded. Returns a function that
 * requests a rescan, for events that don't change the DOM.
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
