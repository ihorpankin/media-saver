import { storage } from 'wxt/utils/storage';
import { DEFAULT_TEMPLATE } from './filename';

export interface Settings {
  /** Шаблон пути внутри «Загрузок», см. buildFilename. */
  template: string;
  /** Спрашивать, куда сохранить. Только для одиночных файлов: на «Все N» был бы десяток окон. */
  saveAs: boolean;
  /**
   * Качество видео: `best` — DASH до 1080p и выше (часто кодек VP9),
   * `compatible` — обычный mp4 до 720p в H.264, который откроет любой плеер.
   */
  videoQuality: 'best' | 'compatible';
}

export const DEFAULT_SETTINGS: Settings = {
  template: DEFAULT_TEMPLATE,
  saveAs: false,
  videoQuality: 'best',
};

/** Хранится в sync — настройки переезжают вместе с профилем Chrome. */
export const settingsItem = storage.defineItem<Settings>('sync:settings', {
  fallback: DEFAULT_SETTINGS,
});

/** Настройки с подставленными значениями по умолчанию для полей, которых ещё не было. */
export async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}
