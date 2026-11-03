import type { DownloadResponse } from '@/lib/core/messages';
import { thumbnailCandidates, thumbnailPost } from '@/lib/sites/youtube/thumbnail';
import { handleDownload } from './downloader';

/** Downloads the largest thumbnail YouTube has for the video. */
export async function downloadThumbnail(
  videoId: string,
  author?: string,
): Promise<DownloadResponse> {
  for (const url of thumbnailCandidates(videoId)) {
    // Not every video has maxresdefault: i.ytimg.com answers 404 for a missing one
    const response = await fetch(url, { method: 'HEAD' }).catch(() => undefined);
    if (response?.ok) {
      return handleDownload({ type: 'download', post: thumbnailPost(videoId, url, author) });
    }
  }
  return { completed: 0, errors: [{ index: 1, error: 'no thumbnail found for this video' }] };
}
