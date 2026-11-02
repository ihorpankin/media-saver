import type {
  DownloadResponse,
  YoutubeProgressMessage,
  YoutubeThumbnailRequest,
  YoutubeVideoRequest,
} from '@/lib/core/messages';
import { videoIdFromUrl } from '@/lib/sites/youtube/thumbnail';
import { createInlineButton, setProgress } from '@/lib/ui/download-button';

// YouTube: под роликом, рядом с лайком и «Поделиться», кнопки «Видео» и «Превью».
// Видео качает yt-dlp на компьютере через хелпер (native-host/), превью — само расширение.
// В лентах и Shorts превью скачивается через контекстное меню (lib/background/context-menu.ts).

const ROW = 'ytd-watch-metadata #top-level-buttons-computed';

function throwOnErrors(response: DownloadResponse) {
  if (response.errors.length > 0) throw new Error(response.errors.map((e) => e.error).join('; '));
}

function currentVideoId(): string {
  const videoId = videoIdFromUrl(location.href);
  if (!videoId) throw new Error('не нашёл id ролика в адресе');
  return videoId;
}

async function downloadThumbnail() {
  const author =
    document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent?.trim() ||
    undefined;
  const request: YoutubeThumbnailRequest = {
    type: 'youtube-thumbnail',
    videoId: currentVideoId(),
    author,
  };
  throwOnErrors(await browser.runtime.sendMessage(request));
}

/** Ролик, который сейчас качается, и его кнопка — чтобы показывать на ней проценты. */
let active: { url: string; host: HTMLElement } | undefined;

async function downloadVideo(host: HTMLElement) {
  // Отдаём yt-dlp чистую ссылку без плейлиста и времени
  const url = `https://www.youtube.com/watch?v=${currentVideoId()}`;
  active = { url, host };
  const request: YoutubeVideoRequest = { type: 'youtube-video', url };
  try {
    throwOnErrors(await browser.runtime.sendMessage(request));
  } finally {
    active = undefined;
  }
}

/** Кнопка в стиле YouTube: «таблетка» на фоне чипа, как у «Поделиться». */
function pill(child: HTMLElement): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.cssText =
    'display:flex;align-items:center;height:36px;margin-left:8px;padding:0 8px;border-radius:18px;' +
    'background:var(--yt-spec-badge-chip-background);color:var(--yt-spec-text-primary)';
  wrapper.append(child);
  return wrapper;
}

function scan() {
  const row = document.querySelector(ROW);
  if (!row || row.querySelector('media-saver-button')) return;
  const video: HTMLElement = createInlineButton('row', {
    title: 'Скачать видео через yt-dlp',
    label: 'Видео',
    onClick: () => downloadVideo(video),
  });
  const thumbnail = createInlineButton('row', {
    title: 'Скачать превью в максимальном разрешении',
    label: 'Превью',
    onClick: downloadThumbnail,
  });
  row.append(pill(video), pill(thumbnail));
}

export default defineContentScript({
  matches: ['*://www.youtube.com/*'],
  main() {
    browser.runtime.onMessage.addListener((message: YoutubeProgressMessage) => {
      if (message?.type === 'youtube-progress' && active?.url === message.url) {
        setProgress(active.host, message.percent);
      }
    });

    let scheduled = false;
    // YouTube — SPA: кнопки под роликом перерисовываются при переходах, пересканируем не чаще раза за кадр
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scan();
      });
    }).observe(document.body, { childList: true, subtree: true });
    scan();
  },
});
