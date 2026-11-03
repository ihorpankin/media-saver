import { describe, expect, it } from 'vitest';
import { thumbnailCandidates, videoIdFromUrl } from './thumbnail';

describe('videoIdFromUrl', () => {
  it.each([
    ['https://www.youtube.com/watch?v=jNQXAC9IVRw&t=10s', 'jNQXAC9IVRw'],
    ['https://www.youtube.com/shorts/abcDEF12345', 'abcDEF12345'],
    ['https://youtu.be/jNQXAC9IVRw?si=x', 'jNQXAC9IVRw'],
    ['https://www.youtube.com/embed/jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://m.youtube.com/live/jNQXAC9IVRw', 'jNQXAC9IVRw'],
    ['https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg?sqp=1', 'jNQXAC9IVRw'],
    ['https://i.ytimg.com/vi_webp/jNQXAC9IVRw/maxresdefault.webp', 'jNQXAC9IVRw'],
  ])('%s', (url, id) => {
    expect(videoIdFromUrl(url)).toBe(id);
  });

  it('not a video', () => {
    expect(videoIdFromUrl('https://www.youtube.com/@channel')).toBeUndefined();
    expect(videoIdFromUrl('https://www.youtube.com/')).toBeUndefined();
    expect(videoIdFromUrl(undefined)).toBeUndefined();
  });
});

describe('thumbnailCandidates', () => {
  it('from largest to smallest', () => {
    expect(thumbnailCandidates('jNQXAC9IVRw')[0]).toBe(
      'https://i.ytimg.com/vi/jNQXAC9IVRw/maxresdefault.jpg',
    );
  });
});
