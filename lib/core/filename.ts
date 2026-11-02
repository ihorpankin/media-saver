import type { MediaItem, MediaPost } from './media';

/**
 * Шаблон пути относительно папки «Загрузки». Подстановки:
 * `{site}`, `{author}`, `{postId}`, `{mediaId}`, `{index}`, `{date}` (ГГГГ-ММ-ДД).
 * Расширение добавляется автоматически.
 */
export const DEFAULT_TEMPLATE = '{site}/{author}/{postId}_{index}';

const MAX_SEGMENT = 120;
// Имена, которые Windows запрещает для файлов и папок
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Делает строку безопасной как имя файла или папки на Windows, macOS и Linux. */
export function sanitizeSegment(value: string): string {
  const cleaned = value
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    // chrome.downloads не принимает имена, начинающиеся или заканчивающиеся точкой
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_SEGMENT)
    .trim();
  if (!cleaned) return '_';
  return RESERVED.test(cleaned) ? `_${cleaned}` : cleaned;
}

/** Дата публикации по местному времени пользователя. */
function formatDate(unixSeconds: number | undefined): string {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Строит путь для файла, например `instagram/username/DfM_W2rE0Dp_2.jpg`. */
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
    // У одиночного поста номер не нужен: `DfM_W2rE0Dp.jpg`, а не `DfM_W2rE0Dp_1.jpg`
    index: post.items.length > 1 ? String(item.index) : '',
    date: formatDate(post.takenAt),
  };

  const segments = template
    .split('/')
    .map((segment) =>
      segment
        .replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
        // убираем разделители, оставшиеся от пустых подстановок
        .replace(/[_\-\s]+$/, '')
        .replace(/^[_\-\s]+/, ''),
    )
    .filter((segment) => segment.length > 0)
    .map(sanitizeSegment);

  const ext = sanitizeSegment(item.ext).toLowerCase();
  const last = segments.pop() ?? sanitizeSegment(item.mediaId);
  return [...segments, `${last}.${ext}`].join('/');
}
