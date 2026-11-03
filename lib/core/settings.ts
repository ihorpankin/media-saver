import { storage } from 'wxt/utils/storage';
import { DEFAULT_TEMPLATE } from './filename';

export interface Settings {
  /** Path template inside Downloads, see buildFilename. */
  template: string;
  /** Ask where to save. Only for single files: "All N" would open a dozen dialogs. */
  saveAs: boolean;
  /**
   * Video quality: `best` is DASH up to 1080p and higher (often VP9),
   * `compatible` is a regular H.264 mp4 up to 720p that any player opens.
   */
  videoQuality: 'best' | 'compatible';
}

export const DEFAULT_SETTINGS: Settings = {
  template: DEFAULT_TEMPLATE,
  saveAs: false,
  videoQuality: 'best',
};

/** Stored in sync, so the settings move with the Chrome profile. */
export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Settings with defaults filled in for fields that didn't exist yet. */
export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}
