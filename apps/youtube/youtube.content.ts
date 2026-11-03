import { requestDownload, watchDom } from '@/lib/content/page';
import type {
  YoutubeProgressMessage,
  YoutubeThumbnailRequest,
  YoutubeVideoRequest,
} from '@/lib/core/messages';
import { videoIdFromUrl } from '@/lib/sites/youtube/thumbnail';
import { createInlineButton, setProgress } from '@/lib/ui/download-button';

// YouTube: "Video" and "Thumbnail" buttons under the video, next to Like and Share.
// Videos are downloaded by yt-dlp on the computer through the helper (native-host/), thumbnails by the extension itself.
// In feeds and Shorts the thumbnail is downloaded from the context menu (lib/background/youtube-menu.ts).

const ROW = 'ytd-watch-metadata #top-level-buttons-computed';

function currentVideoId(): string {
  const videoId = videoIdFromUrl(location.href);
  if (!videoId) throw new Error('no video id in the address');
  return videoId;
}

async function downloadThumbnail() {
  // Folder is the channel handle (@handle), same as for yt-dlp videos: under the video on its page,
  // in Shorts the "@channel/shorts" link over the video. Non-Latin handles arrive URL-encoded
  const handle = document
    .querySelector(
      'ytd-watch-metadata ytd-channel-name a[href^="/@"], yt-reel-player-overlay-view-model a[href^="/@"]',
    )
    ?.getAttribute('href')
    ?.match(/^\/(@[^/?]+)/)?.[1];
  const author = handle ? decodeURIComponent(handle) : undefined;
  const request: YoutubeThumbnailRequest = {
    type: 'youtube-thumbnail',
    videoId: currentVideoId(),
    author,
  };
  await requestDownload(request);
}

/** The video being downloaded and its button, to show the percentage on it. */
let active: { url: string; host: HTMLElement } | undefined;

async function downloadVideo(host: HTMLElement) {
  // Give yt-dlp a clean link without the playlist and timestamp
  const url = `https://www.youtube.com/watch?v=${currentVideoId()}`;
  active = { url, host };
  const request: YoutubeVideoRequest = { type: 'youtube-video', url };
  try {
    await requestDownload(request);
  } finally {
    active = undefined;
  }
}

/** YouTube-style button: a "pill" on a chip background, like Share. */
function pill(child: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;align-items:center;height:36px;margin-left:8px;padding:0 8px;border-radius:18px;' +
    'background:var(--yt-spec-badge-chip-background);color:var(--yt-spec-text-primary)';
  wrapper.append(child);
  return wrapper;
}

function createButtons(layout: 'row' | 'circle') {
  const video: HTMLElement = createInlineButton(layout, {
    title: 'Download video with yt-dlp',
    label: 'Video',
    onClick: () => downloadVideo(video),
  });
  const thumbnail = createInlineButton(layout, {
    title: 'Download thumbnail in maximum resolution',
    label: 'Thumbnail',
    onClick: downloadThumbnail,
  });
  return [video, thumbnail];
}

/** Video page: "pills" in the row under the video. */
function scanWatch() {
  const row = document.querySelector(ROW);
  if (!row || row.querySelector('media-saver-button')) return;
  row.append(...createButtons('row').map(pill));
}

/**
 * Shorts: the right column "like, comments, share, remix, sound". Buttons go before
 * "sound" and take colors from the neighboring button to match both light and dark themes.
 */
function scanShorts() {
  if (!location.pathname.startsWith('/shorts/')) return;
  const bar = document.querySelector('reel-action-bar-view-model');
  if (!bar || bar.querySelector('media-saver-button')) return;
  const native = bar.querySelector('button');
  const style = native && getComputedStyle(native);
  for (const host of createButtons('circle')) {
    if (style) {
      host.style.color = style.color;
      host.style.setProperty('--media-saver-circle', style.backgroundColor);
    }
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;justify-content:center;margin-top:16px';
    wrapper.append(host);
    const sound =
      bar.lastElementChild?.tagName === 'PIVOT-BUTTON-VIEW-MODEL' ? bar.lastElementChild : null;
    bar.insertBefore(wrapper, sound);
  }
}

function scan() {
  scanWatch();
  scanShorts();
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: YoutubeProgressMessage) => {
      if (message?.type === 'youtube-progress' && active?.url === message.url) {
        setProgress(active.host, message.percent);
      }
    });

    watchDom(scan);
  },
});
