/**
 * Разбор DASH-манифеста (MPD). Instagram отдаёт видео и звук раздельными дорожками:
 * каждая `Representation` — это целый mp4-файл по ссылке из `BaseURL`.
 * Разбираем регулярками, а не DOMParser: в service worker его нет, а так код ещё и легко тестировать.
 */

export interface DashTrack {
  url: string;
  kind: 'video' | 'audio';
  codecs: string;
  bandwidth: number;
  width?: number;
  height?: number;
}

const unescapeXml = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
}

export function parseMpd(xml: string): DashTrack[] {
  const tracks: DashTrack[] = [];
  for (const set of xml.matchAll(/<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/g)) {
    const setContentType = attr(set[1]!, 'contentType');
    for (const rep of set[2]!.matchAll(/<Representation\b([^>]*)>([\s\S]*?)<\/Representation>/g)) {
      const tag = rep[1]!;
      const url = rep[2]!.match(/<BaseURL>([^<]+)<\/BaseURL>/)?.[1];
      const mime = attr(tag, 'mimeType') ?? '';
      const kind = (setContentType ?? mime.split('/')[0]) as string;
      if (!url || (kind !== 'video' && kind !== 'audio')) continue;
      const width = Number(attr(tag, 'width')) || undefined;
      const height = Number(attr(tag, 'height')) || undefined;
      tracks.push({
        url: unescapeXml(url.trim()),
        kind,
        codecs: attr(tag, 'codecs') ?? '',
        bandwidth: Number(attr(tag, 'bandwidth')) || 0,
        width,
        height,
      });
    }
  }
  return tracks;
}

/** Высота кадра с учётом поворота: у вертикального видео большая сторона — высота. */
const size = (t: DashTrack) => Math.max(t.width ?? 0, t.height ?? 0);

/**
 * Лучшие дорожки: видео с наибольшим разрешением (при равенстве — H.264 ради совместимости
 * со старыми плеерами, потом больший битрейт) и звук с наибольшим битрейтом.
 */
export function pickDashTracks(tracks: DashTrack[]): { video?: DashTrack; audio?: DashTrack } {
  const isAvc = (t: DashTrack) => Number(t.codecs.startsWith('avc1'));
  const video = tracks
    .filter((t) => t.kind === 'video')
    .sort((a, b) => size(b) - size(a) || isAvc(b) - isAvc(a) || b.bandwidth - a.bandwidth)[0];
  const audio = tracks
    .filter((t) => t.kind === 'audio')
    .sort((a, b) => b.bandwidth - a.bandwidth)[0];
  return { video, audio };
}

/** Большая сторона кадра лучшей видеодорожки — чтобы сравнить с прогрессивным mp4. */
export function dashResolution(tracks: DashTrack[]): number {
  const { video } = pickDashTracks(tracks);
  return video ? size(video) : 0;
}
