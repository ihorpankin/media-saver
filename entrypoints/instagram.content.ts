import { requestDownload, watchDom } from '@/lib/content/page';
import { createPostCache } from '@/lib/content/post-cache';
import { hasLargerOriginal, type MediaPost } from '@/lib/core/media';
import {
  isPageMessage,
  type ContextDownloadRequest,
  type DownloadRequest,
  type HarvestCheckResponse,
  type OriginalRequest,
} from '@/lib/core/messages';
import { fetchPost } from '@/lib/sites/instagram/api';
import {
  attachOverlayButton,
  createInlineButton,
  setWaiting,
  triggerDownload,
  type DownloadButtonOptions,
} from '@/lib/ui/download-button';

// Post data comes from the interceptor (instagram-page.content.ts) and piles up in the cache.
// The button is embedded in Instagram's action bars:
//   - feed and opened post: the "like, comment, repost, share" row → ⬇ and "All N";
//   - Reels: the column to the right of the video → ⬇ before "More";
//   - stories: the header → ⬇ before pause.
// Grid tiles (profile, "More from", search) have no bar, so the button sits over the preview.
// Instagram's button labels are translated, so bars are found by structure, not by text.

const cache = createPostCache();

const POST_LINK = /\/(?:p|reels?)\/([\w-]+)/;

function shortcodeFromHref(href: string | null | undefined): string | undefined {
  return href?.match(POST_LINK)?.[1];
}

// ---- Media and slides ----

/**
 * Large media by on-screen size: avatars and icons are smaller than 100px. The natural size
 * can't be used: Explore previews are only 240px wide but take 320px on screen.
 */
function isLargeMedia(el: HTMLImageElement | HTMLVideoElement): boolean {
  const r = el.getBoundingClientRect();
  return (
    r.height > 100 &&
    r.width > 100 &&
    (el instanceof HTMLVideoElement || (el.complete && el.naturalWidth > 0))
  );
}

/** Loaded large photos and videos (avatars and icons are filtered out by size). */
function largeMedia(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img, video')].filter(
    isLargeMedia,
  );
}

function visibleArea(el: Element, view: DOMRect): number {
  const r = el.getBoundingClientRect();
  const w = Math.min(r.right, view.right) - Math.max(r.left, view.left);
  const h = Math.min(r.bottom, view.bottom) - Math.max(r.top, view.top);
  return Math.max(0, w) * Math.max(0, h);
}

const viewport = () => new DOMRect(0, 0, innerWidth, innerHeight);

/**
 * The most prominent media of the post inside root. Previews of other posts ("More from",
 * neighboring stories) sit inside links to them and are skipped. But the post itself can be in a link:
 * a feed video is wrapped in a link to its own Reel, so a link to `ownId` doesn't count as foreign.
 */
function mainMedia(root: ParentNode, ownId?: string): HTMLElement | undefined {
  const view = viewport();
  return largeMedia(root)
    .filter((el) => {
      const link = el.closest('a[href]');
      return (
        !link || (ownId !== undefined && shortcodeFromHref(link.getAttribute('href')) === ownId)
      );
    })
    .sort((a, b) => visibleArea(b, view) - visibleArea(a, view))[0];
}

/**
 * Media block: the topmost ancestor with the same size as the photo or video itself.
 * It holds the whole carousel and the transparent layer Instagram puts over the media.
 */
function mediaBox(media: HTMLElement, stop: Element): HTMLElement {
  const target = media.getBoundingClientRect();
  let box: HTMLElement = media.parentElement ?? media;
  for (let el = media.parentElement; el && el !== stop; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (Math.abs(r.width - target.width) < 2 && Math.abs(r.height - target.height) < 2) box = el;
  }
  return box;
}

function translateX(el: Element): number {
  return Number(el.getAttribute('style')?.match(/translateX\((-?[\d.]+)px\)/)?.[1] ?? 0);
}

interface Slide {
  media: HTMLElement;
  /** Slide number, from 1. */
  index: number;
  /** Total slides, if the markup tells. */
  total?: number;
}

/**
 * The visible slide of the post. Carousel slides are `li` shifted by translateX(number × width),
 * and the last service `li`, 1px wide, sits at "total slides × width".
 */
function visibleSlide(root: Element, ownId?: string): Slide | undefined {
  const first = mainMedia(root, ownId);
  if (!first) return undefined;
  const box = mediaBox(first, root);
  const view = box.getBoundingClientRect();
  // A cover image of the same size often lies under a video: with equal area the video wins
  const isVideo = (el: HTMLElement) => Number(el instanceof HTMLVideoElement);
  const media = largeMedia(box).sort(
    (a, b) => visibleArea(b, view) - visibleArea(a, view) || isVideo(b) - isVideo(a),
  )[0];
  if (!media) return undefined;
  const li = media.closest('li');
  if (!li || !box.contains(li)) return { media, index: 1, total: 1 };
  const width = li.getBoundingClientRect().width;
  const sentinel = [...(li.parentElement?.children ?? [])].find(
    (el) => el.getBoundingClientRect().width <= 1,
  );
  return {
    media,
    index: Math.round(translateX(li) / width) + 1,
    total: sentinel ? Math.round(translateX(sentinel) / width) : undefined,
  };
}

/** Image file name on the CDN: the same in all sizes, used to find the media in the cache. */
function cdnFileName(url: string): string | undefined {
  try {
    return new URL(url).pathname.split('/').pop();
  } catch {
    return undefined;
  }
}

/** The cached post containing this image. Needed when the URL has no id (author's first story). */
function postByImage(media: HTMLElement): MediaPost | undefined {
  if (!(media instanceof HTMLImageElement)) return undefined;
  const name = cdnFileName(media.currentSrc || media.src);
  if (!name) return undefined;
  return cache.find((post) => post.items.some((item) => cdnFileName(item.url) === name));
}

function authorOf(root: Element): string | undefined {
  // The author is the first profile link whose text matches the username
  return [...root.querySelectorAll('a[href]')]
    .map((a) => ({
      name: a.getAttribute('href')?.match(/^\/([\w.]+)\/$/)?.[1],
      text: a.textContent,
    }))
    .find(({ name, text }) => name && text?.trim() === name)?.name;
}

/** Fallback (A): the visible photo straight from the DOM. Videos can't be taken this way: they have a blob URL. */
function postFromDom(
  postId: string,
  slide: Slide & { media: HTMLImageElement },
  author: string | undefined,
): MediaPost {
  return {
    site: 'instagram',
    postId,
    author,
    itemCount: slide.total,
    items: [
      {
        kind: 'image',
        mediaId: `${postId}-${slide.index}`,
        index: slide.index,
        url: slide.media.currentSrc || slide.media.src,
        ext: 'jpg',
      },
    ],
  };
}

// ---- Downloading ----

async function send(request: DownloadRequest | OriginalRequest): Promise<void> {
  const response = await requestDownload(request);
  if (response.completed === 0) throw new Error('this media is not in the post data');
}

/** How to find the post the button belongs to. */
interface PostSource {
  /** Shortcode or story pk, if known. */
  postId: () => string | undefined;
  /** Element containing the post's media (article, post dialog, story viewer). */
  root: () => Element;
  /** Last way to find the post if neither the id nor the image helped (videos in highlights). */
  fallback?: (slide: Slide) => MediaPost | undefined;
}

function resolvePost(source: PostSource, slide: Slide | undefined): MediaPost | undefined {
  const id = source.postId();
  return (
    (id && cache.get(id)) ||
    (slide && postByImage(slide.media)) ||
    (slide && source.fallback?.(slide)) ||
    undefined
  );
}

/**
 * The post from the cache, or if it isn't there, from one request to Instagram's API (fallback B).
 * Without an id (author's first story, highlights) there is nothing to request.
 */
async function loadPost(source: PostSource, slide: Slide | undefined): Promise<MediaPost> {
  const cached = resolvePost(source, slide);
  if (cached) return cached;
  const id = source.postId();
  if (!id) throw new Error('no data for this story — reload the page');
  const post = await fetchPost(id);
  cache.add(post);
  return post;
}

async function downloadSlide(source: PostSource) {
  const root = source.root();
  const slide = visibleSlide(root, source.postId());
  if (!slide) throw new Error('no photo or video found in the post');
  let post: MediaPost;
  try {
    post = await loadPost(source, slide);
  } catch (error) {
    // Last resort (A): the visible photo straight from the page
    const id = source.postId();
    const { media } = slide;
    if (!id || !(media instanceof HTMLImageElement)) throw error;
    console.warn('[media-saver] fallback request failed, taking the photo from the page:', error);
    await send({ type: 'download', post: postFromDom(id, { ...slide, media }, authorOf(root)) });
    return;
  }
  await send({ type: 'download', post, indexes: [slide.index] });
}

async function downloadAll(source: PostSource) {
  const post = await loadPost(source, visibleSlide(source.root(), source.postId()));
  await send({ type: 'download', post });
}

/** The current slide, if it has an original larger than the one in the feed. */
function largerOriginal(source: PostSource) {
  const slide = visibleSlide(source.root(), source.postId());
  const post = resolvePost(source, slide);
  const item = slide && post?.items.find((i) => i.index === slide.index);
  // Originals come from the post page, and stories don't have one; they are full size anyway
  if (!post || !item || !hasLargerOriginal(item) || post.permalink?.includes('/stories/')) {
    return undefined;
  }
  return { post, item };
}

async function downloadOriginal(source: PostSource) {
  const found = largerOriginal(source);
  if (!found) throw new Error('this slide has no larger original');
  await send({ type: 'download-original', post: found.post, index: found.item.index });
}

function buttonOptions(source: PostSource, title = 'Download'): DownloadButtonOptions {
  return {
    title,
    onClick: () => downloadSlide(source),
    all: {
      count: () => {
        const id = source.postId();
        return (id && cache.get(id)?.itemCount) || undefined;
      },
      onClick: () => downloadAll(source),
    },
    original: {
      label: () => {
        const found = largerOriginal(source);
        if (!found) return undefined;
        const { width, originalWidth } = found.item;
        return {
          text: `HD ${originalWidth}`,
          title:
            `Now ${width}px, original ${originalWidth}px. ` +
            'The post opens in a background tab for a couple of seconds',
        };
      },
      onClick: () => downloadOriginal(source),
    },
  };
}

// ---- Finding action bars ----

const SVG_BUTTON = '[role="button"]:has(svg), button:has(svg)';

/** Buttons with icons. Nested buttons (Save has them) count as one. */
function svgButtons(el: Element): Element[] {
  const buttons = [...el.querySelectorAll(SVG_BUTTON)];
  return buttons.filter((b) => !buttons.some((outer) => outer !== b && outer.contains(b)));
}

function hasOurButton(el: Element): boolean {
  return el.querySelector('media-saver-button') !== null;
}

/**
 * Inserts the button into the bar. The wrapper copies the classes of a neighboring bar element
 * so the spacing matches the native buttons.
 */
function insertButton(
  container: Element,
  before: Element | null,
  template: Element,
  host: HTMLElement,
) {
  const wrapper = document.createElement('div');
  wrapper.className = template.className;
  wrapper.append(host);
  container.insertBefore(wrapper, before);
}

/** Where in the action row to insert the button. */
interface RowSlot {
  container: Element;
  /** Element to insert before (`null` for the end). */
  before: Element | null;
  /** Neighboring element whose classes give the spacing. */
  template: Element;
}

/**
 * The post's action row: a `section` with like, comment, repost, share
 * and save. It comes in two forms:
 *   - feed and post page: two groups, actions on the left, save on the right → end of the left one;
 *   - post dialog over the feed: all buttons in a row, save last → before it.
 */
function actionRow(root: ParentNode): RowSlot | undefined {
  for (const section of root.querySelectorAll('section')) {
    const children = [...section.children];
    const [left, right] = children;
    if (children.length === 2 && left && right) {
      if (svgButtons(left).length >= 3 && svgButtons(right).length === 1 && left.lastElementChild) {
        return { container: left, before: null, template: left.lastElementChild };
      }
    }
    const save = children.at(-1);
    const share = children.at(-2);
    if (children.length >= 4 && save && share && svgButtons(section).length >= 4) {
      if (svgButtons(save).length === 1)
        return { container: section, before: save, template: share };
    }
  }
  return undefined;
}

function attachToRow(slot: RowSlot, source: PostSource) {
  if (hasOurButton(slot.container)) return;
  insertButton(
    slot.container,
    slot.before,
    slot.template,
    createInlineButton(
      'row',
      buttonOptions(source),
      slot.container.closest('section') ?? undefined,
    ),
  );
}

// ---- Places on the page ----

/** Feed posts. */
function scanFeed() {
  for (const article of document.querySelectorAll('article')) {
    const postId = shortcodeFromHref(
      article.querySelector('a[href*="/p/"], a[href*="/reel/"]')?.getAttribute('href'),
    );
    if (!postId) continue;
    const row = actionRow(article);
    if (row) attachToRow(row, { postId: () => postId, root: () => article });
  }
}

/**
 * An opened post: a separate page or a dialog over the feed and profile.
 * The URL is `/p/<code>/`, `/reel/<code>/` or, when opened from a profile, `/<user>/p/<code>/`.
 */
function scanPostPage() {
  if (!/\/(?:p|reel)\/[\w-]+/.test(location.pathname)) return;
  const postId = () => shortcodeFromHref(location.pathname);
  // The post dialog is found by its action row, not by the photo: the photo may still be loading
  const root = () =>
    [...document.querySelectorAll('[role="dialog"]')].find((d) => actionRow(d)) ??
    document.querySelector('main') ??
    document.body;
  const row = actionRow(root());
  if (row) attachToRow(row, { postId, root });
}

/**
 * Reels: to the right of each video, a column "like, comment, repost, share,
 * save, more". ⬇ goes before "more".
 */
function scanReels() {
  if (!location.pathname.startsWith('/reels/')) return;
  for (const video of document.querySelectorAll('video')) {
    if (visibleArea(video, viewport()) === 0) continue;
    // The column is a sibling of one of the video's ancestors
    let column: Element | undefined;
    for (let el = video.parentElement; el && !column; el = el.parentElement) {
      column = [...(el.parentElement?.children ?? [])].find(
        (sibling) =>
          sibling !== el &&
          getComputedStyle(sibling).flexDirection === 'column' &&
          [...sibling.children].filter((child) => svgButtons(child).length > 0).length >= 5,
      );
      if (el.tagName === 'MAIN') break;
    }
    if (!column || hasOurButton(column)) continue;
    const withButtons = [...column.children].filter((child) => svgButtons(child).length > 0);
    const more = withButtons.at(-1)!;
    const reelBox = column.parentElement!;
    insertButton(
      column,
      more,
      more,
      createInlineButton(
        'column',
        buttonOptions({
          // The video in the column is the one in the URL: Instagram changes the URL while scrolling
          postId: () => shortcodeFromHref(location.pathname),
          root: () => reelBox,
        }),
      ),
    );
  }
}

/** pk of the current story from the `/stories/<user>/<pk>/` URL. The author's first story has none. */
function storyPk(): string | undefined {
  return location.pathname.match(/^\/stories\/(?!highlights\/)[^/]+\/(\d+)/)?.[1];
}

/**
 * Current story number from the progress bars above it. The bars are a row of equal segments,
 * one per story; the current one's fill is shifted with translateX (it "moves").
 */
function storyProgressIndex(media: HTMLElement): number | undefined {
  const area = media.getBoundingClientRect();
  const moving = [...document.querySelectorAll<HTMLElement>('div[style*="translateX"]')].find(
    (el) => {
      const r = el.getBoundingClientRect();
      return (
        r.height >= 1 &&
        r.height <= 4 &&
        r.top >= area.top - 30 &&
        r.top <= area.top + 40 &&
        r.left >= area.left - 5 &&
        r.right <= area.right + 5
      );
    },
  );
  // The segment is an ancestor of the fill whose parent has several children of equal width
  for (let segment = moving; segment?.parentElement; segment = segment.parentElement) {
    const siblings = [...segment.parentElement.children];
    const width = segment.getBoundingClientRect().width;
    if (
      siblings.length >= 2 &&
      siblings.every((s) => Math.abs(s.getBoundingClientRect().width - width) < 2)
    ) {
      return siblings.indexOf(segment) + 1;
    }
  }
  return undefined;
}

/**
 * The story by its position in the reel: for videos in highlights, where the URL has no story id and
 * a video can't be found by image. The video duration is checked against the data to get the number right.
 */
function storyByPosition(slide: Slide): MediaPost | undefined {
  const index = storyProgressIndex(slide.media);
  if (!index) return undefined;
  const path = location.pathname;
  const highlight = path.match(/^\/stories\/highlights\/(\d+)/)?.[1];
  const user = highlight ? undefined : path.match(/^\/stories\/([^/]+)/)?.[1];
  const post = cache.find(
    (p) =>
      p.reel?.index === index &&
      (highlight
        ? p.reel.id === `highlight:${highlight}`
        : p.author === user && Boolean(p.permalink?.includes('/stories/'))),
  );
  const item = post?.items[0];
  if (!item) return undefined;
  if (slide.media instanceof HTMLVideoElement) {
    const duration = slide.media.duration;
    if (item.kind !== 'video') return undefined;
    if (item.duration && Number.isFinite(duration) && Math.abs(item.duration - duration) > 1.5) {
      return undefined;
    }
  }
  return post;
}

/** pk of the current story, or if there is none, its number from the progress bars. */
const storySource = (root: Element): PostSource => ({
  postId: storyPk,
  root: () => root,
  fallback: storyByPosition,
});

/** The button in the story header, to update its "waiting for load" state. */
let storyButton: HTMLElement | undefined;

/**
 * Whether the story is ready to download: the media has loaded and its data has arrived.
 * Until then the button shows waiting instead of appearing suddenly.
 */
function storyReady(root: Element): boolean {
  const slide = visibleSlide(root);
  return Boolean(slide && resolvePost(storySource(root), slide));
}

/** Stories: header above the story "author · time … pause, menu". ⬇ goes before pause. */
function scanStories() {
  if (!/^\/stories\//.test(location.pathname)) return;
  // Story media is found by size without waiting for it to load, so the button appears at once
  const view = viewport();
  const media = [...document.querySelectorAll<HTMLElement>('img, video')]
    .filter((el) => el.getBoundingClientRect().height > 300 && !el.closest('a[href]'))
    .sort((a, b) => visibleArea(b, view) - visibleArea(a, view))[0];
  if (!media) return;
  const area = media.getBoundingClientRect();
  // Header buttons: in the top strip of the story, right of the middle
  for (let el = media.parentElement; el; el = el.parentElement) {
    const header = svgButtons(el).filter((button) => {
      const r = button.getBoundingClientRect();
      return (
        r.width > 0 &&
        r.top >= area.top - 10 &&
        r.bottom <= area.top + 120 &&
        r.left > area.left + area.width / 2
      );
    });
    if (header.length === 0) continue;
    let row = header[0]!.parentElement!;
    while (!header.every((button) => row.contains(button)) && row.parentElement) {
      row = row.parentElement;
    }
    const root = el;
    if (!hasOurButton(row)) {
      const first = [...row.children].find((child) => child.contains(header[0]!))!;
      // Without a pk in the URL (highlights, first story) the post is found by image or by number
      storyButton = createInlineButton('row', buttonOptions(storySource(root)));
      insertButton(row, first, first, storyButton);
    }
    if (storyButton) setWaiting(storyButton, !storyReady(root));
    return;
  }
}

/** Grid tiles: profile, "More from", search. No bar, so the button sits over the preview. */
function scanGrid() {
  for (const tile of document.querySelectorAll<HTMLAnchorElement>(
    'a[href*="/p/"], a[href*="/reel/"]',
  )) {
    if (tile.closest('article')) continue;
    const postId = shortcodeFromHref(tile.getAttribute('href'));
    if (!postId || largeMedia(tile).length === 0) continue;
    attachOverlayButton(tile, {
      title: 'Download post',
      onClick: () => downloadAll({ postId: () => postId, root: () => tile }),
    });
  }
}

function scan() {
  scanFeed();
  scanPostPage();
  scanReels();
  scanStories();
  scanGrid();
}

function watchPage() {
  const schedule = watchDom(scan);
  // In Reels the next video appears by scrolling, not by a DOM change
  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  // Media loading and data arriving don't change the DOM, but the story waiting state depends on them
  document.addEventListener('load', schedule, true);
  document.addEventListener('loadeddata', schedule, true);
  window.addEventListener('message', schedule);
}

// ---- Context menu "Download" ----

/** Photo or video under the cursor the last time the context menu was opened. */
let contextTarget: Element | undefined;

/** Media under a point: through Instagram's transparent layers over the photo. */
function mediaAtPoint(x: number, y: number): Element | undefined {
  return document
    .elementsFromPoint(x, y)
    .find(
      (el) =>
        (el instanceof HTMLImageElement || el instanceof HTMLVideoElement) && isLargeMedia(el),
    );
}

/**
 * The menu item does the same as this post's ⬇: find our nearest button up the tree
 * from the media. This way the menu handles carousel slides, Reels, stories and grid tiles.
 * If there is no button and it's an image, find the post by file name or download the image as is.
 */
async function contextDownload(request: ContextDownloadRequest) {
  if (!contextTarget) throw new Error('no photo or video under the cursor');
  for (
    let el: Element | undefined = contextTarget;
    el && el !== document.body;
    el = el.parentElement ?? undefined
  ) {
    const host = [...el.querySelectorAll<HTMLElement>('media-saver-button')].find(
      (h) => h.isConnected,
    );
    if (host && triggerDownload(host, request.mode)) return;
  }

  const media = contextTarget instanceof HTMLImageElement ? contextTarget : undefined;
  const post = media && postByImage(media);
  const name = request.srcUrl && cdnFileName(request.srcUrl);
  const item = post?.items.find((i) => cdnFileName(i.url) === name);
  if (post && item) {
    await send({ type: 'download', post, indexes: [item.index] });
  } else if (request.srcUrl?.startsWith('http')) {
    await send({
      type: 'download',
      post: {
        site: 'instagram',
        postId: name?.replace(/\.\w+$/, '') ?? 'image',
        items: [{ kind: 'image', mediaId: 'image', index: 1, url: request.srcUrl, ext: 'jpg' }],
      },
    });
  } else {
    throw new Error('nothing to download here');
  }
}

// ---- Background tab for "Download original" ----

/** The "data ready, hand it over" check while the tab waits for the post. */
let harvest: (() => void) | undefined;

/** All post photos at full size: as many as original_width promises. */
function hasOriginals(post: MediaPost): boolean {
  return post.items.every(
    (item) =>
      item.kind !== 'image' || !item.originalWidth || (item.width ?? 0) >= item.originalWidth,
  );
}

function startHarvest(postId: string) {
  let sent = false;
  const send = () => {
    const post = cache.get(postId);
    if (sent || !post) return;
    sent = true;
    harvest = undefined;
    void browser.runtime.sendMessage({ type: 'harvest-result', post });
  };
  harvest = () => {
    const post = cache.get(postId);
    if (post && hasOriginals(post)) send();
  };
  harvest();
  // If the full list of sizes never arrived, hand over the best there is
  setTimeout(send, 5000);
}

export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  // Listen to the interceptor from the start: it parses embedded JSON before the DOM loads
  runAt: 'document_start',
  main() {
    // Instagram covers media with a transparent layer, so remember the photo or video
    // under the cursor, not the click target: from it we reach the post's button
    document.addEventListener(
      'contextmenu',
      (event) => {
        contextTarget = mediaAtPoint(event.clientX, event.clientY);
      },
      true,
    );
    browser.runtime.onMessage.addListener((message: ContextDownloadRequest) => {
      if (message?.type !== 'context-download') return;
      contextDownload(message).catch((error: unknown) =>
        console.warn('[media-saver] download from the menu failed:', error),
      );
    });

    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
      harvest?.();
    });

    // If the background opened this tab for the original, hand it the post data
    void browser.runtime
      .sendMessage({ type: 'harvest-check' })
      .then((target: HarvestCheckResponse) => target && startHarvest(target.postId));

    watchPage();
  },
});
