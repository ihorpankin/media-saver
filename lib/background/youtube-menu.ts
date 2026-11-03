import { loadSettings, settingsItem } from '@/lib/core/settings';
import { videoIdFromUrl } from '@/lib/sites/youtube/thumbnail';
import { QUALITY, updateSettings } from './context-menu';
import { downloadThumbnail } from './youtube';

/*
 * Контекстное меню расширения для YouTube:
 *
 *   Media Saver for YouTube ▸ Скачать превью
 *                             ──────────
 *                             ◉ Видео: лучшее качество
 *                             ○ Видео: совместимое (720p, H.264)
 *
 * Превью — по правому клику на плитке в любой ленте или на странице ролика.
 */

const ROOT = 'media-saver-youtube';
const THUMBNAIL = 'youtube-thumbnail';
const CONTEXTS: Browser.contextMenus.CreateProperties['contexts'] = [
  'link',
  'image',
  'video',
  'page',
];

function create(props: Browser.contextMenus.CreateProperties) {
  browser.contextMenus.create({
    documentUrlPatterns: ['*://*.youtube.com/*'],
    contexts: CONTEXTS,
    ...props,
  });
}

async function build() {
  await browser.contextMenus.removeAll();
  const settings = await loadSettings();
  create({ id: ROOT, title: 'Media Saver for YouTube' });
  create({ id: THUMBNAIL, parentId: ROOT, title: 'Download thumbnail' });
  create({ id: 'sep-1', parentId: ROOT, type: 'separator' });
  for (const [id, value, title] of QUALITY) {
    create({ id, parentId: ROOT, title, type: 'radio', checked: settings.videoQuality === value });
  }
}

export function setupYoutubeMenu() {
  browser.runtime.onInstalled.addListener(() => void build());
  settingsItem.watch((settings) => {
    for (const [id, value] of QUALITY) {
      void browser.contextMenus.update(id, { checked: settings?.videoQuality === value });
    }
  });

  browser.contextMenus.onClicked.addListener((info) => {
    const id = String(info.menuItemId);
    if (id === THUMBNAIL) {
      // Плитка ролика — ссылка на него; если кликнули не по плитке, берём ролик со страницы
      const videoId =
        videoIdFromUrl(info.linkUrl) ?? videoIdFromUrl(info.srcUrl) ?? videoIdFromUrl(info.pageUrl);
      if (videoId) {
        void downloadThumbnail(videoId).then((r) => {
          if (r.errors.length) console.warn('[media-saver] thumbnail download failed:', r.errors);
        });
      }
      return;
    }
    const quality = QUALITY.find(([itemId]) => itemId === id);
    if (quality) void updateSettings({ videoQuality: quality[1] });
  });
}
