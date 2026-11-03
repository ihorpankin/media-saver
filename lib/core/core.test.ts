import { describe, expect, it } from 'vitest';
import { hasLargerOriginal, type MediaItem } from './media';
import { isPageMessage, PAGE_CHANNEL } from './messages';

const image = (extra: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'image',
  mediaId: '4020867214798438633',
  index: 1,
  url: 'https://scontent.cdninstagram.com/x.jpg',
  ext: 'jpg',
  ...extra,
});

describe('hasLargerOriginal', () => {
  it('true when the original is wider than the available version', () => {
    expect(hasLargerOriginal(image({ width: 1080, originalWidth: 3000 }))).toBe(true);
  });

  it('false when the original itself is available', () => {
    expect(hasLargerOriginal(image({ width: 3000, originalWidth: 3000 }))).toBe(false);
  });

  it('false without size data and for videos', () => {
    expect(hasLargerOriginal(image())).toBe(false);
    expect(hasLargerOriginal(image({ kind: 'video', width: 720, originalWidth: 1440 }))).toBe(
      false,
    );
  });
});

describe('isPageMessage', () => {
  it('accepts only messages of our channel', () => {
    expect(isPageMessage({ channel: PAGE_CHANNEL, type: 'posts', posts: [] })).toBe(true);
    expect(isPageMessage({ channel: 'other' })).toBe(false);
    expect(isPageMessage(null)).toBe(false);
    expect(isPageMessage('posts')).toBe(false);
  });
});
