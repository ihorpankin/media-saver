import { describe, expect, it } from 'vitest';
import { bestVariant, originalPhotoUrl, parseX } from './parse';

// Structure as in the UserTweets response, the values are made up
const tweet = (id: string, media: unknown[], quoted?: unknown) => ({
  __typename: 'Tweet',
  rest_id: id,
  core: { user_results: { result: { core: { screen_name: 'NASA' } } } },
  legacy: {
    id_str: id,
    created_at: 'Mon Nov 02 12:00:00 +0000 2026',
    extended_entities: { media },
  },
  ...(quoted ? { quoted_status_result: { result: quoted } } : {}),
});

const photo = {
  id_str: '111',
  type: 'photo',
  media_url_https: 'https://pbs.twimg.com/media/HV56yHnXcAAwYJ2.jpg',
  original_info: { width: 4096, height: 2731 },
};

const video = {
  id_str: '222',
  type: 'video',
  media_url_https: 'https://pbs.twimg.com/ext_tw_video_thumb/222/pu/img/x.jpg',
  original_info: { width: 1920, height: 1080 },
  video_info: {
    variants: [
      { content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/x.m3u8' },
      { content_type: 'video/mp4', bitrate: 832000, url: 'https://video.twimg.com/640.mp4' },
      { content_type: 'video/mp4', bitrate: 2176000, url: 'https://video.twimg.com/1280.mp4' },
    ],
  },
};

const response = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                entries: [
                  {
                    content: {
                      itemContent: { tweet_results: { result: tweet('1', [photo, video]) } },
                    },
                  },
                  {
                    content: {
                      itemContent: {
                        tweet_results: { result: tweet('2', [], tweet('3', [photo])) },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    },
  },
};

describe('parseX', () => {
  it('tweet with a photo and a video: original photo, best mp4', () => {
    const [post] = parseX(response);
    expect(post).toMatchObject({
      site: 'x',
      postId: '1',
      author: 'NASA',
      permalink: 'https://x.com/NASA/status/1',
      itemCount: 2,
    });
    expect(post!.items[0]).toMatchObject({
      kind: 'image',
      url: 'https://pbs.twimg.com/media/HV56yHnXcAAwYJ2?format=jpg&name=orig',
      ext: 'jpg',
      width: 4096,
    });
    expect(post!.items[1]).toMatchObject({
      kind: 'video',
      url: 'https://video.twimg.com/1280.mp4',
      ext: 'mp4',
    });
  });

  it('a quote with media is a separate post, a tweet without media is skipped', () => {
    expect(parseX(response).map((p) => p.postId)).toEqual(['1', '3']);
  });
});

describe('helpers', () => {
  it('originalPhotoUrl', () => {
    expect(originalPhotoUrl('https://pbs.twimg.com/media/abc.png')).toEqual({
      url: 'https://pbs.twimg.com/media/abc?format=png&name=orig',
      ext: 'png',
    });
  });

  it('bestVariant without mp4', () => {
    expect(bestVariant([{ content_type: 'application/x-mpegURL', url: 'x' }])).toBeUndefined();
  });
});
