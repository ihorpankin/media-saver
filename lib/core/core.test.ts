import { describe, expect, it } from 'vitest';
import type { SiteExtractor } from './extractor';
import { hasLargerOriginal, type MediaItem } from './media';
import { isPageMessage, PAGE_CHANNEL } from './messages';
import { createRegistry } from './registry';

const image = (extra: Partial<MediaItem> = {}): MediaItem => ({
  kind: 'image',
  mediaId: '4020867214798438633',
  index: 1,
  url: 'https://scontent.cdninstagram.com/x.jpg',
  ext: 'jpg',
  ...extra,
});

describe('hasLargerOriginal', () => {
  it('true, когда оригинал шире доступной версии', () => {
    expect(hasLargerOriginal(image({ width: 1080, originalWidth: 3000 }))).toBe(true);
  });

  it('false, когда доступен сам оригинал', () => {
    expect(hasLargerOriginal(image({ width: 3000, originalWidth: 3000 }))).toBe(false);
  });

  it('false без данных о размере и для видео', () => {
    expect(hasLargerOriginal(image())).toBe(false);
    expect(hasLargerOriginal(image({ kind: 'video', width: 720, originalWidth: 1440 }))).toBe(
      false,
    );
  });
});

describe('createRegistry', () => {
  const fake = (host: string): SiteExtractor => ({
    site: 'instagram',
    matches: (url) => url.hostname.endsWith(host),
    page: { shouldParse: () => false, parse: () => [] },
    findTargets: () => [],
    resolve: async () => null,
  });

  it('находит экстрактор по URL', () => {
    const ig = fake('instagram.com');
    const registry = createRegistry([ig]);
    expect(registry.find('https://www.instagram.com/p/abc/')).toBe(ig);
    expect(registry.find(new URL('https://example.com/'))).toBeUndefined();
  });
});

describe('isPageMessage', () => {
  it('принимает только сообщения нашего канала', () => {
    expect(isPageMessage({ channel: PAGE_CHANNEL, type: 'posts', posts: [] })).toBe(true);
    expect(isPageMessage({ channel: 'other' })).toBe(false);
    expect(isPageMessage(null)).toBe(false);
    expect(isPageMessage('posts')).toBe(false);
  });
});
