import type { MediaPost, SiteId } from './media';

/**
 * Разбор данных, которые страница уже получила (способ C).
 *
 * Работает в контексте страницы (MAIN world), поэтому должен быть чистым:
 * никаких `browser.*`/`chrome.*` API и никакого состояния. Так его легко тестировать
 * на сохранённых JSON.
 */
export interface PageDataParser {
  /** Стоит ли разбирать ответ с этого URL. Вызывается на каждый XHR/fetch, поэтому должен быть дешёвым. */
  shouldParse(url: string): boolean;
  /** Найти все посты в JSON: ответе XHR/fetch или встроенном `<script type="application/json">`. */
  parse(json: unknown): MediaPost[];
}

/** Пост, найденный в DOM: сюда ставится кнопка. */
export interface DownloadTarget {
  /** Контейнер поста, к которому крепится кнопка. */
  element: HTMLElement;
  /** Ключ для поиска данных в кэше, совпадает с `MediaPost.postId`. */
  postId: string;
  /** Номер видимого слайда карусели (с 1), если его можно определить. */
  activeIndex?: number;
}

/** Всё, что ядру нужно знать о сайте. Одна реализация на сайт. */
export interface SiteExtractor {
  site: SiteId;
  /** Работает ли экстрактор на этой странице. */
  matches(url: URL): boolean;
  /** Пассивный разбор данных страницы (способ C). */
  page: PageDataParser;
  /** Найти посты на странице. Вызывается при каждом изменении DOM, должен быть быстрым. */
  findTargets(root: ParentNode, location: URL): DownloadTarget[];
  /**
   * Запасной путь, когда в кэше нет данных: точечный запрос (B), затем DOM (A).
   * Выполняется в content script, только по клику пользователя.
   */
  resolve(target: DownloadTarget): Promise<MediaPost | null>;
}
