import type { DownloadResponse } from '@/lib/core/messages';
import { thumbnailCandidates, thumbnailPost } from '@/lib/sites/youtube/thumbnail';
import { handleDownload } from './downloader';

/** Скачивает самое большое превью ролика, какое есть у YouTube. */
export async function downloadThumbnail(
  videoId: string,
  author?: string,
): Promise<DownloadResponse> {
  for (const url of thumbnailCandidates(videoId)) {
    // maxresdefault есть не у всех роликов: для отсутствующего i.ytimg.com отвечает 404
    const response = await fetch(url, { method: 'HEAD' }).catch(() => undefined);
    if (response?.ok) {
      return handleDownload({ type: 'download', post: thumbnailPost(videoId, url, author) });
    }
  }
  return { completed: 0, errors: [{ index: 1, error: 'у ролика не нашлось превью' }] };
}
