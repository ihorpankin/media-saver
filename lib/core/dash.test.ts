import { describe, expect, it } from 'vitest';
import { dashResolution, parseMpd, pickDashTracks } from './dash';

// A shortened Instagram manifest: the structure is real, the URLs are made up
const rep = (id: string, codecs: string, w: number | null, h: number | null, bw: number) =>
  `<Representation id="${id}" bandwidth="${bw}" codecs="${codecs}" mimeType="${w ? 'video' : 'audio'}/mp4"` +
  (w ? ` width="${w}" height="${h}"` : '') +
  `><BaseURL>https://scontent.cdninstagram.com/o1/v/${id}.mp4?a=1&amp;b=2</BaseURL>` +
  `<SegmentBase indexRange="818-921"><Initialization range="0-817"/></SegmentBase></Representation>`;

const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"><Period id="0">
<AdaptationSet id="0" contentType="video" par="9:16">
${rep('v540', 'vp09.00.30.08', 540, 960, 206345)}
${rep('v720', 'vp09.00.30.08', 720, 1280, 1532000)}
${rep('v1080', 'vp09.00.40.08', 1080, 1920, 2438000)}
</AdaptationSet>
<AdaptationSet id="1" contentType="audio">
${rep('a1', 'mp4a.40.5', null, null, 56000)}
</AdaptationSet></Period></MPD>`;

describe('parseMpd', () => {
  it('finds video and audio tracks with URLs', () => {
    const tracks = parseMpd(mpd);
    expect(tracks).toHaveLength(4);
    expect(tracks[2]).toMatchObject({
      kind: 'video',
      codecs: 'vp09.00.40.08',
      width: 1080,
      height: 1920,
      url: 'https://scontent.cdninstagram.com/o1/v/v1080.mp4?a=1&b=2',
    });
    expect(tracks[3]).toMatchObject({ kind: 'audio', codecs: 'mp4a.40.5', width: undefined });
  });
});

describe('pickDashTracks', () => {
  it('takes the largest video and audio', () => {
    const { video, audio } = pickDashTracks(parseMpd(mpd));
    expect(video?.height).toBe(1920);
    expect(audio?.codecs).toBe('mp4a.40.5');
    expect(dashResolution(parseMpd(mpd))).toBe(1920);
  });

  it('prefers H.264 at equal size', () => {
    const tracks = parseMpd(
      `<AdaptationSet contentType="video">${rep('vp9', 'vp09.00', 1080, 1920, 3000000)}${rep('avc', 'avc1.64001f', 1080, 1920, 2000000)}</AdaptationSet>`,
    );
    expect(pickDashTracks(tracks).video?.codecs).toBe('avc1.64001f');
  });

  it('without audio', () => {
    expect(
      pickDashTracks(
        parseMpd(
          `<AdaptationSet contentType="video">${rep('v', 'avc1', 720, 1280, 1)}</AdaptationSet>`,
        ),
      ).audio,
    ).toBeUndefined();
  });
});
