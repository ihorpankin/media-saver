import type { MediaPost } from './media';

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
