/**
 * DASH manifest (MPD) parsing. Instagram serves video and audio as separate tracks:
 * each `Representation` is a whole mp4 file at the `BaseURL` link.
 * Parsed with regexes, not DOMParser: the service worker doesn't have it, and this way the code is easy to test.
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

/** Frame height with rotation: for a vertical video the long side is the height. */
const size = (t: DashTrack) => Math.max(t.width ?? 0, t.height ?? 0);

/**
 * The best tracks: video with the highest resolution (on a tie, H.264 for compatibility
 * with old players, then higher bitrate) and audio with the highest bitrate.
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

/** The long side of the best video track's frame, to compare with the progressive mp4. */
export function dashResolution(tracks: DashTrack[]): number {
  const { video } = pickDashTracks(tracks);
  return video ? size(video) : 0;
}
