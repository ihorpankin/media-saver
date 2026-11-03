import { describe, expect, it } from 'vitest';
import { parseTikTok, pickVideo } from './parse';

// Structure as in `__UNIVERSAL_DATA_FOR_REHYDRATION__` and `/api/…/item_list/`, the values are made up
const bitrate = (codec: string, w: number, h: number, bitrate: number, host: string) => ({
  Bitrate: bitrate,
  CodecType: codec,
  PlayAddr: { Width: w, Height: h, UrlList: [`https://${host}/video/${codec}-${h}.mp4`] },
});

const video = {
  id: '7702947070604332319',
  createTime: '1793600000',
  author: { uniqueId: 'tiktok' },
  video: {
    playAddr: 'https://v16-webapp-prime.tiktok.com/play.mp4',
    width: 720,
    height: 1280,
    duration: 15,
    bitrateInfo: [
      bitrate('h265_hvc1', 1080, 1920, 1346222, 'v16-webapp-prime.tiktok.com'),
      bitrate('h264', 720, 1280, 1308455, 'v16-webapp-prime.tiktok.com'),
      bitrate('h265_hvc1', 720, 1280, 647035, 'v16-webapp-prime.tiktok.com'),
    ],
  },
};

const photo = {
  id: '7700000000000000001',
  author: { uniqueId: 'artist' },
  video: { width: 0, height: 0 },
  imagePost: {
    images: [
      {
        imageURL: {
          urlList: ['https://p16-sign.tiktokcdn-us.com/a~tplv-photomode-image.jpeg?x=1'],
        },
        imageWidth: 1080,
        imageHeight: 1440,
      },
      {
        imageURL: {
          urlList: ['https://p16-sign.tiktokcdn-us.com/b~tplv-photomode-image.jpeg?x=2'],
        },
        imageWidth: 1080,
        imageHeight: 1440,
      },
    ],
  },
};

describe('parseTikTok', () => {
  it('video from the page: best quality and H.264 for compatibility', () => {
    const inline = {
      __DEFAULT_SCOPE__: { 'webapp.video-detail': { itemInfo: { itemStruct: video } } },
    };
    const [post] = parseTikTok(inline);
    expect(post).toMatchObject({
      site: 'tiktok',
      postId: '7702947070604332319',
      author: 'tiktok',
      takenAt: 1793600000,
      permalink: 'https://www.tiktok.com/@tiktok/video/7702947070604332319',
    });
    expect(post!.items[0]).toMatchObject({
      kind: 'video',
      url: 'https://v16-webapp-prime.tiktok.com/video/h265_hvc1-1920.mp4',
      compatibleUrl: 'https://v16-webapp-prime.tiktok.com/video/h264-1280.mp4',
      width: 1080,
      height: 1920,
      duration: 15,
    });
  });

  it('photo post from the feed: all images', () => {
    const [post] = parseTikTok({ itemList: [photo] });
    expect(post!.permalink).toBe('https://www.tiktok.com/@artist/photo/7700000000000000001');
    expect(post!.items.map((i) => [i.kind, i.index, i.ext])).toEqual([
      ['image', 1, 'jpg'],
      ['image', 2, 'jpg'],
    ]);
  });
});

describe('pickVideo', () => {
  it('without H.264 there is no compatible variant', () => {
    expect(pickVideo([bitrate('h265_hvc1', 720, 1280, 1, 'h')]).compatible).toBeUndefined();
  });
});
