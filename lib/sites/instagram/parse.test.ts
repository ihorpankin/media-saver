import { describe, expect, it } from 'vitest';
import { bestCandidate, instagramPageParser, parseInstagram, shortcodeFromPk } from './parse';

// Структуры повторяют реальные ответы (см. docs/instagram.md), значения выдуманы
const cdn = (name: string, stp: string) =>
  `https://scontent-waw2-1.cdninstagram.com/v/t51/${name}.jpg?stp=${stp}&oh=x`;

const carouselPost = {
  pk: '4020867214798438633',
  id: '4020867214798438633_1502494553',
  code: 'DfM_W2rE0Dp',
  media_type: 8,
  taken_at: 1793544745,
  user: { username: 'patrick.ganas' },
  image_versions2: {
    candidates: [{ url: cdn('cover', 'dst-jpg_e35_tt6'), width: 1080, height: 1440 }],
  },
  carousel_media: [
    {
      pk: '4020867200000000001',
      id: '4020867200000000001_1502494553',
      media_type: 1,
      original_width: 3000,
      original_height: 4000,
      image_versions2: {
        candidates: [
          { url: cdn('s1-small', 'dst-jpg_e35_p640x640_sh2.08_tt6'), width: 640, height: 853 },
          { url: cdn('s1-big', 'dst-jpg_e35_p1080x1080_tt6'), width: 1080, height: 1440 },
        ],
      },
    },
    {
      pk: '4020867200000000002',
      id: '4020867200000000002_1502494553',
      media_type: 2,
      image_versions2: {
        candidates: [{ url: cdn('s2-poster', 'dst-jpg'), width: 720, height: 1280 }],
      },
      video_versions: [
        {
          url: 'https://scontent.cdninstagram.com/v/s2-720.mp4',
          width: 720,
          height: 1280,
          type: 101,
        },
        {
          url: 'https://scontent.cdninstagram.com/v/s2-480.mp4',
          width: 480,
          height: 854,
          type: 102,
        },
      ],
      video_dash_manifest: '<MPD></MPD>',
    },
  ],
};

const reel = {
  // eslint-disable-next-line no-loss-of-precision -- так и бывает в ответах: точность уже потеряна
  pk: 4020951276420053625,
  id: '4020951276420053625_4484906660',
  code: 'DfNSeHKK7p5',
  media_type: 2,
  product_type: 'clips',
  user: { username: 'charlie2speedy' },
  image_versions2: {
    candidates: [{ url: cdn('reel-poster', 'dst-jpg'), width: 720, height: 1280 }],
  },
  // В Reels у video_versions нет размеров
  video_versions: [
    { url: 'https://scontent.cdninstagram.com/v/reel-a.mp4', type: 101 },
    { url: 'https://scontent.cdninstagram.com/v/reel-b.mp4', type: 102 },
  ],
};

const story = {
  pk: '4021364098265521376',
  id: '4021364098265521376_6069304680',
  code: 'DfOwVddoBzgSMCYTNnz1wMGUE8FWxHuYGZKIfw0',
  media_type: 1,
  expiring_at: 1793690378,
  user: { username: 'oleh_lukianchuk' },
  image_versions2: {
    candidates: [{ url: cdn('story', 'dst-jpg_e15_tt6'), width: 1080, height: 1920 }],
  },
};

// Лента: data.xdt_api__v1__feed__timeline__connection.edges[].node.media
const feedResponse = {
  data: {
    xdt_api__v1__feed__timeline__connection: {
      edges: [{ node: { media: carouselPost } }, { node: { explore_story: { media: reel } } }],
    },
  },
};

describe('parseInstagram', () => {
  it('карусель: все слайды одним постом, лучшее качество', () => {
    const [post] = parseInstagram(feedResponse);
    expect(post).toMatchObject({
      postId: 'DfM_W2rE0Dp',
      author: 'patrick.ganas',
      takenAt: 1793544745,
      permalink: 'https://www.instagram.com/p/DfM_W2rE0Dp/',
      itemCount: 2,
    });
    expect(post!.items[0]).toMatchObject({
      kind: 'image',
      index: 1,
      mediaId: '4020867200000000001',
      url: cdn('s1-big', 'dst-jpg_e35_p1080x1080_tt6'),
      ext: 'jpg',
      width: 1080,
      originalWidth: 3000,
    });
    expect(post!.items[1]).toMatchObject({
      kind: 'video',
      index: 2,
      url: 'https://scontent.cdninstagram.com/v/s2-720.mp4',
      ext: 'mp4',
      dashManifest: '<MPD></MPD>',
    });
  });

  it('Reels: pk из строкового id, видео без размеров, ссылка /reel/', () => {
    const posts = parseInstagram(feedResponse);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toMatchObject({
      postId: 'DfNSeHKK7p5',
      permalink: 'https://www.instagram.com/reel/DfNSeHKK7p5/',
    });
    expect(posts[1]!.items[0]).toMatchObject({
      kind: 'video',
      mediaId: '4020951276420053625',
      url: 'https://scontent.cdninstagram.com/v/reel-a.mp4',
    });
  });

  it('сторис: ключ — pk, ссылка на сторис', () => {
    const [post] = parseInstagram({ items: [story] });
    expect(post).toMatchObject({
      postId: '4021364098265521376',
      permalink: 'https://www.instagram.com/stories/oleh_lukianchuk/4021364098265521376/',
    });
  });

  it('встроенный JSON со вложенными обёртками', () => {
    const inline = {
      require: [['x', 'y', null, [{ __bbox: { result: { data: { a: { items: [story] } } } } }]]],
    };
    expect(parseInstagram(inline)).toHaveLength(1);
  });

  it('JSON без медиа', () => {
    expect(parseInstagram({ data: { viewer: { id: '1' } } })).toEqual([]);
    expect(parseInstagram(null)).toEqual([]);
  });
});

describe('bestCandidate', () => {
  it('при равной площади предпочитает короткий stp', () => {
    const best = bestCandidate([
      { url: cdn('a', 'dst-jpg_e35_s1080x1080_sh2.08_tt6'), width: 1080, height: 1080 },
      { url: cdn('b', 'dst-jpg_e35_tt6'), width: 1080, height: 1080 },
    ]);
    expect(best?.url).toContain('/b.jpg');
  });
});

describe('shortcodeFromPk', () => {
  it('переводит pk в шорткод', () => {
    expect(shortcodeFromPk('4020867214798438633')).toBe('DfM_W2rE0Dp');
  });
});

describe('shouldParse', () => {
  it('только API Instagram', () => {
    expect(instagramPageParser.shouldParse('https://www.instagram.com/graphql/query')).toBe(true);
    expect(instagramPageParser.shouldParse('/api/graphql')).toBe(true);
    expect(instagramPageParser.shouldParse('/api/v1/media/1/info/')).toBe(true);
    expect(instagramPageParser.shouldParse('/ajax/bz?__a=1')).toBe(false);
  });
});
