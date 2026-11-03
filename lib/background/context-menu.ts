import type { ContextDownloadRequest, DownloadMode } from '@/lib/core/messages';
import { loadSettings, settingsItem, type Settings } from '@/lib/core/settings';

/*
 * Right-click context menu on Instagram:
 *
 *   Media Saver ▸ Download
 *                 Download whole post
 *                 Download original (HD)
 *                 ──────────
 *                 ◉ Video: best quality
 *                 ○ Video: compatible (720p, H.264)
 *                 ☐ Ask where to save
 *                 ──────────
 *                 Settings…
 *
 * Besides 'image' and 'video' the 'page' context is needed: Instagram puts a transparent layer over photos,
 * and Chrome treats such a click as a click on the page. The content script works out what's under the cursor.
 */

const ROOT = 'media-saver';
// Sites where the "Media Saver ▸ Download…" submenu works: their content script has a handler
const PAGES = [
  '*://*.instagram.com/*',
  '*://x.com/*',
  '*://twitter.com/*',
  '*://www.tiktok.com/*',
  '*://www.linkedin.com/*',
];

const DOWNLOADS: Array<[id: string, mode: DownloadMode, title: string]> = [
  ['download-slide', 'slide', 'Download'],
  ['download-all', 'all', 'Download whole post'],
  ['download-original', 'original', 'Download original (HD)'],
];

export const QUALITY: Array<[id: string, value: Settings['videoQuality'], title: string]> = [
  ['quality-best', 'best', 'Video: best quality'],
  ['quality-compatible', 'compatible', 'Video: compatible (720p, H.264)'],
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
    title: 'Ask where to save',
    type: 'checkbox',
    checked: settings.saveAs,
    contexts: ['image', 'video', 'page'],
  });
  create({ id: 'sep-2', parentId: ROOT, type: 'separator', contexts: ['image', 'video', 'page'] });
  create({
    id: OPTIONS,
    parentId: ROOT,
    title: 'Settings…',
    contexts: ['image', 'video', 'page'],
  });
}

/** Menu checkmarks reflect the settings even if they were changed on the settings page. */
function syncChecks(settings: Settings) {
  for (const [id, value] of QUALITY) {
    void browser.contextMenus.update(id, { checked: settings.videoQuality === value });
  }
  void browser.contextMenus.update(SAVE_AS, { checked: settings.saveAs });
}

export async function updateSettings(patch: Partial<Settings>) {
  await settingsItem.setValue({ ...(await loadSettings()), ...patch });
}

export function setupContextMenu() {
  // Items survive a browser restart, but are recreated on install and update
  browser.runtime.onInstalled.addListener(() => void build());
  settingsItem.watch((settings) => settings && syncChecks({ ...settings }));

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const id = String(info.menuItemId);

    const download = DOWNLOADS.find(([itemId]) => itemId === id);
    if (download && tab?.id !== undefined) {
      // What exactly to download is known to the content script: it has the post data and the buttons
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
