import type { ContextDownloadRequest, DownloadMode } from '@/lib/core/messages';
import { loadSettings, settingsItem, type Settings } from '@/lib/core/settings';
import { videoIdFromUrl } from '@/lib/sites/youtube/thumbnail';
import { downloadThumbnail } from './youtube';

/*
 * Контекстное меню по правому клику в Instagram:
 *
 *   Media Saver ▸ Скачать
 *                 Скачать весь пост
 *                 Скачать оригинал (HD)
 *                 ──────────
 *                 ◉ Видео: лучшее качество
 *                 ○ Видео: совместимое (720p, H.264)
 *                 ☐ Спрашивать, куда сохранить
 *                 ──────────
 *                 Все настройки…
 *
 * Кроме 'image' и 'video' нужен контекст 'page': поверх фото Instagram кладёт прозрачный слой,
 * и Chrome считает такой клик кликом по странице. Что под курсором, разбирает content script.
 */

const ROOT = 'media-saver';
const PAGES = ['*://*.instagram.com/*'];

const DOWNLOADS: Array<[id: string, mode: DownloadMode, title: string]> = [
  ['download-slide', 'slide', 'Скачать'],
  ['download-all', 'all', 'Скачать весь пост'],
  ['download-original', 'original', 'Скачать оригинал (HD)'],
];

const QUALITY: Array<[id: string, value: Settings['videoQuality'], title: string]> = [
  ['quality-best', 'best', 'Видео: лучшее качество'],
  ['quality-compatible', 'compatible', 'Видео: совместимое (720p, H.264)'],
];

const SAVE_AS = 'save-as';
const OPTIONS = 'open-options';

function create(props: Browser.contextMenus.CreateProperties) {
  browser.contextMenus.create({ documentUrlPatterns: PAGES, ...props });
}

async function build() {
  await browser.contextMenus.removeAll();
  const settings = await loadSettings();
  create({ id: ROOT, title: 'Media Saver', contexts: ['image', 'video', 'page'] });
  for (const [id, , title] of DOWNLOADS) {
    create({ id, parentId: ROOT, title, contexts: ['image', 'video', 'page'] });
  }
  create({ id: 'sep-1', parentId: ROOT, type: 'separator', contexts: ['image', 'video', 'page'] });
  for (const [id, value, title] of QUALITY) {
    create({
      id,
      parentId: ROOT,
      title,
      type: 'radio',
      checked: settings.videoQuality === value,
      contexts: ['image', 'video', 'page'],
    });
  }
  create({
    id: SAVE_AS,
    parentId: ROOT,
    title: 'Спрашивать, куда сохранить',
    type: 'checkbox',
    checked: settings.saveAs,
    contexts: ['image', 'video', 'page'],
  });
  create({ id: 'sep-2', parentId: ROOT, type: 'separator', contexts: ['image', 'video', 'page'] });
  create({
    id: OPTIONS,
    parentId: ROOT,
    title: 'Все настройки…',
    contexts: ['image', 'video', 'page'],
  });

  // YouTube: превью ролика — по правому клику на плитке в любой ленте или на странице ролика
  browser.contextMenus.create({
    id: YT_THUMBNAIL,
    title: 'Скачать превью (Media Saver)',
    contexts: ['link', 'image', 'video', 'page'],
    documentUrlPatterns: ['*://*.youtube.com/*'],
  });
}

const YT_THUMBNAIL = 'youtube-thumbnail';

/** Отметки в меню отражают настройки, даже если их поменяли на странице настроек. */
function syncChecks(settings: Settings) {
  for (const [id, value] of QUALITY) {
    void browser.contextMenus.update(id, { checked: settings.videoQuality === value });
  }
  void browser.contextMenus.update(SAVE_AS, { checked: settings.saveAs });
}

async function updateSettings(patch: Partial<Settings>) {
  await settingsItem.setValue({ ...(await loadSettings()), ...patch });
}

export function setupContextMenu() {
  // Пункты переживают перезапуск браузера, но при установке и обновлении создаём заново
  browser.runtime.onInstalled.addListener(() => void build());
  settingsItem.watch((settings) => settings && syncChecks({ ...settings }));

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const id = String(info.menuItemId);

    if (id === YT_THUMBNAIL) {
      // Плитка ролика — ссылка на него; если кликнули не по плитке, берём ролик со страницы
      const videoId =
        videoIdFromUrl(info.linkUrl) ?? videoIdFromUrl(info.srcUrl) ?? videoIdFromUrl(info.pageUrl);
      if (videoId) {
        void downloadThumbnail(videoId).then((r) => {
          if (r.errors.length) console.warn('[media-saver] превью не скачалось:', r.errors);
        });
      }
      return;
    }

    const download = DOWNLOADS.find(([itemId]) => itemId === id);
    if (download && tab?.id !== undefined) {
      // Что именно скачивать, знает content script: у него данные постов и кнопки
      const request: ContextDownloadRequest = {
        type: 'context-download',
        mode: download[1],
        srcUrl: info.srcUrl,
      };
      void browser.tabs.sendMessage(tab.id, request, { frameId: info.frameId }).catch(() => {});
      return;
    }

    const quality = QUALITY.find(([itemId]) => itemId === id);
    if (quality) void updateSettings({ videoQuality: quality[1] });
    else if (id === SAVE_AS) void updateSettings({ saveAs: Boolean(info.checked) });
    else if (id === OPTIONS) void browser.runtime.openOptionsPage();
  });
}
