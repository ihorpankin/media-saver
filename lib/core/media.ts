/**
 * Общая модель медиа, одинаковая для всех сайтов.
 * Экстракторы переводят данные своего сайта в эти типы, а ядро (кнопки, скачивание,
 * имена файлов) работает только с ними.
 */

export type SiteId = 'instagram';

export type MediaKind = 'image' | 'video';

/** Один файл внутри поста: фото или видео, в том числе слайд карусели. */
export interface MediaItem {
  kind: MediaKind;
  /** id медиа на сайте. Всегда строка: id Instagram не помещаются в Number. */
  mediaId: string;
  /** Номер внутри поста, с 1. У одиночного поста всегда 1. */
  index: number;
  /** Прямая ссылка на лучший готовый файл (картинка или прогрессивный mp4). */
  url: string;
  /** Расширение файла без точки: jpg, mp4, … */
  ext: string;
  width?: number;
  height?: number;
  /**
   * DASH-манифест (MPD, XML), если сайт отдаёт видео раздельными дорожками.
   * Часто качество выше, чем у `url`, но видео и звук нужно склеивать.
   */
  dashManifest?: string;
  /** Длительность видео в секундах, если известна. */
  duration?: number;
  /** Размер оригинала, если сайт его сообщает. Нужен, чтобы предложить «Скачать оригинал». */
  originalWidth?: number;
  originalHeight?: number;
}

/** Пост целиком: одиночное медиа, карусель, Reels или элемент сторис. */
export interface MediaPost {
  site: SiteId;
  /** Ключ поста, по которому кнопка в DOM находит данные (у Instagram — shortcode или pk сторис). */
  postId: string;
  /** Имя автора, без @. */
  author?: string;
  /** Время публикации, unix-секунды. */
  takenAt?: number;
  /** Постоянная ссылка на пост. */
  permalink?: string;
  items: MediaItem[];
  /** Сколько всего медиа в посте, если в `items` только часть (например, один слайд карусели). */
  itemCount?: number;
  /**
   * Место в ленте историй: id ленты (у хайлайта — `highlight:<id>`) и номер истории в ней, с 1.
   * Нужно, чтобы найти текущую историю, когда её id нет в адресе страницы.
   */
  reel?: { id: string; index: number };
}

/** Можно ли получить версию лучше той, что лежит в `url`. */
export function hasLargerOriginal(item: MediaItem): boolean {
  if (item.kind !== 'image' || !item.originalWidth || !item.width) return false;
  return item.originalWidth > item.width;
}
