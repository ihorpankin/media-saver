import { describe, expect, it } from 'vitest';
import { buildFilename, sanitizeSegment } from './filename';
import type { MediaItem, MediaPost } from './media';

const item = (index: number, ext = 'jpg'): MediaItem => ({
  kind: ext === 'mp4' ? 'video' : 'image',
  mediaId: `40208672147984386${index}`,
  index,
  url: 'https://scontent.cdninstagram.com/x',
  ext,
});

const post = (count: number, extra: Partial<MediaPost> = {}): MediaPost => ({
  site: 'instagram',
  postId: 'DfM_W2rE0Dp',
  author: 'patrick.ganas',
  takenAt: 1793544745,
  items: Array.from({ length: count }, (_, i) => item(i + 1)),
  ...extra,
});

describe('buildFilename', () => {
  it('carousel: slide number in the name', () => {
    const p = post(3);
    expect(buildFilename(p, p.items[1]!)).toBe('instagram/patrick.ganas/DfM_W2rE0Dp_2.jpg');
  });

  it('single post: no number', () => {
    const p = post(1);
    expect(buildFilename(p, p.items[0]!)).toBe('instagram/patrick.ganas/DfM_W2rE0Dp.jpg');
  });

  it('one slide of a carousel: the number stays', () => {
    const p = post(0, { items: [item(4)], itemCount: 6 });
    expect(buildFilename(p, p.items[0]!)).toBe('instagram/patrick.ganas/DfM_W2rE0Dp_4.jpg');
  });

  it('unknown author', () => {
    const p = post(1, { author: undefined });
    expect(buildFilename(p, item(1, 'mp4'))).toBe('instagram/unknown/DfM_W2rE0Dp.mp4');
  });

  it('custom template with date and mediaId', () => {
    const p = post(2);
    expect(buildFilename(p, p.items[0]!, '{author}/{date} {mediaId}')).toBe(
      'patrick.ganas/2026-11-01 402086721479843861.jpg',
    );
  });

  it('dangerous characters in the author do not break the path', () => {
    const p = post(1, { author: '../evil:name' });
    expect(buildFilename(p, p.items[0]!)).toBe('instagram/_evil_name/DfM_W2rE0Dp.jpg');
  });
});

describe('sanitizeSegment', () => {
  it('replaces forbidden characters', () => {
    expect(sanitizeSegment('a<b>c:d"e|f?g*h')).toBe('a_b_c_d_e_f_g_h');
  });

  it('strips dots at the ends and escapes reserved names', () => {
    expect(sanitizeSegment('..hidden.')).toBe('hidden');
    expect(sanitizeSegment('CON')).toBe('_CON');
    expect(sanitizeSegment('   ')).toBe('_');
  });
});
