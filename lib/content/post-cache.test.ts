import { describe, expect, it } from 'vitest';
import type { MediaPost } from '@/lib/core/media';
import { createPostCache } from './post-cache';

const post = (postId: string, widths: number[]): MediaPost => ({
  site: 'instagram',
  postId,
  items: widths.map((width, i) => ({
    kind: 'image',
    mediaId: `${postId}-${i}`,
    index: i + 1,
    url: `https://cdn/${postId}/${i}/${width}.jpg`,
    ext: 'jpg',
    width,
    height: width,
  })),
});

describe('createPostCache', () => {
  it('keeps the best-quality copy', () => {
    const cache = createPostCache();
    cache.add(post('a', [1080]));
    cache.add(post('a', [3000]));
    cache.add(post('a', [640]));
    expect(cache.get('a')?.items[0]?.width).toBe(3000);
  });

  it('a copy with more items beats quality', () => {
    const cache = createPostCache();
    cache.add(post('a', [3000]));
    cache.add(post('a', [1080, 1080]));
    expect(cache.get('a')?.items).toHaveLength(2);
  });

  it('a copy with video beats a copy with a large cover', () => {
    const cache = createPostCache();
    const video: MediaPost = {
      site: 'instagram',
      postId: 'a',
      items: [{ kind: 'video', mediaId: 'a', index: 1, url: 'https://cdn/a.mp4', ext: 'mp4' }],
    };
    cache.add(video);
    cache.add(post('a', [1080]));
    expect(cache.get('a')?.items[0]?.kind).toBe('video');
  });

  it('evicts the oldest posts over the limit', () => {
    const cache = createPostCache(2);
    cache.add(post('a', [1]));
    cache.add(post('b', [1]));
    cache.add(post('c', [1]));
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(2);
  });
});
