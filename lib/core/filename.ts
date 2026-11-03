import type { MediaItem, MediaPost } from './media';

/**
 * Path template relative to the Downloads folder. Placeholders:
 * `{site}`, `{author}`, `{postId}`, `{mediaId}`, `{index}`, `{date}` (YYYY-MM-DD).
 * The extension is added automatically.
 */
export const DEFAULT_TEMPLATE = '{site}/{author}/{postId}_{index}';

const MAX_SEGMENT = 120;
// Names Windows forbids for files and folders
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Makes a string safe as a file or folder name on Windows, macOS and Linux. */
export function sanitizeSegment(value: string): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // chrome.downloads rejects names starting or ending with a dot
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_SEGMENT)
    .trim();
  if (!cleaned) return '_';
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Publication date in the user's local time. */
function formatDate(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Builds the file path, e.g. `instagram/username/DfM_W2rE0Dp_2.jpg`. */
export function buildFilename(
  post: MediaPost,
  item: MediaItem,
  template: string = DEFAULT_TEMPLATE,
): string {
  const values: Record<string, string> = {
    site: post.site,
    author: post.author ?? 'unknown',
    postId: post.postId,
    mediaId: item.mediaId,
    // A single post needs no number: `DfM_W2rE0Dp.jpg`, not `DfM_W2rE0Dp_1.jpg`
    index: (post.itemCount ?? post.items.length) > 1 ? String(item.index) : '',
    date: formatDate(post.takenAt),
  };

  const segments = template
    .split('/')
    .map((segment) =>
      segment
        .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
        // remove separators left over from empty placeholders
        .replace(/[_\-\s]+$/, '')
        .replace(/^[_\-\s]+/, ''),
    )
    .filter((segment) => segment.length > 0)
    .map(sanitizeSegment);

  const ext = sanitizeSegment(item.ext).toLowerCase();
  const last = segments.pop() ?? sanitizeSegment(item.mediaId);
  return [...segments, `${last}.${ext}`].join('/');
}
