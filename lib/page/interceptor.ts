import type { PageDataParser } from '@/lib/core/extractor';
import type { MediaPost } from '@/lib/core/media';

/*
 * Пассивный перехват данных страницы (способ C). Работает в MAIN world: подменяет
 * XMLHttpRequest и fetch, читает ответы, которые сайт и так получает, и разбирает
 * встроенный в HTML JSON. Своих запросов не делает.
 *
 * Главное правило: что бы ни случилось внутри, страница не должна сломаться.
 * Поэтому весь разбор — в try/catch и вне основного потока ответа.
 */

type Emit = (posts: MediaPost[]) => void;

/** Ответы Facebook/Instagram иногда начинаются с защитного префикса `for (;;);`. */
function parseJsonText(text: string): unknown {
  return JSON.parse(text.replace(/^for \(;;\);/, ''));
}

function handle(parser: PageDataParser, emit: Emit, read: () => unknown) {
  // Разбираем после текущей задачи, чтобы не задерживать обработчики самой страницы
  setTimeout(() => {
    try {
      const posts = parser.parse(read());
      if (posts.length > 0) emit(posts);
    } catch {
      // Не JSON или неожиданная структура — пропускаем
    }
  }, 0);
}

function hookXhr(parser: PageDataParser, emit: Emit) {
  const proto = XMLHttpRequest.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;
  const urls = new WeakMap<XMLHttpRequest, string>();

  proto.open = function (this: XMLHttpRequest, ...args: Parameters<typeof originalOpen>) {
    urls.set(this, String(args[1]));
    return originalOpen.apply(this, args);
  } as typeof originalOpen;

  proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = urls.get(this);
    if (url && parser.shouldParse(url)) {
      this.addEventListener('load', (event) => {
        const xhr = event.target as XMLHttpRequest;
        handle(parser, emit, () =>
          xhr.responseType === '' || xhr.responseType === 'text'
            ? parseJsonText(xhr.responseText)
            : xhr.responseType === 'json'
              ? xhr.response
              : undefined,
        );
      });
    }
    return originalSend.call(this, body);
  };
}

function hookFetch(parser: PageDataParser, emit: Emit) {
  const originalFetch = window.fetch;
  window.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>) {
    const response = await originalFetch.apply(this, args);
    try {
      const input = args[0];
      const url = input instanceof Request ? input.url : String(input);
      if (parser.shouldParse(url)) {
        const text = await response.clone().text();
        handle(parser, emit, () => parseJsonText(text));
      }
    } catch {
      // Ответ не читается (например, opaque) — пропускаем
    }
    return response;
  };
}

/** Разбирает JSON, встроенный в HTML при первой загрузке страницы. */
export function scanInlineData(parser: PageDataParser, emit: Emit, marker: string) {
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const text = script.textContent ?? '';
    // Дешёвая проверка до дорогого JSON.parse: большинство скриптов медиа не содержат
    if (!text.includes(marker)) continue;
    handle(parser, emit, () => parseJsonText(text));
  }
}

export function installInterceptor(parser: PageDataParser, emit: Emit) {
  hookXhr(parser, emit);
  hookFetch(parser, emit);
}
