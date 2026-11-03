import type { PageDataParser } from '@/lib/core/page-parser';
import type { MediaPost } from '@/lib/core/media';

/*
 * Passive interception of page data (method C). Runs in the MAIN world: patches
 * XMLHttpRequest and fetch, reads responses the site receives anyway, and parses
 * JSON embedded in the HTML. Makes no requests of its own.
 *
 * The main rule: whatever happens inside, the page must not break.
 * So all parsing is in try/catch and off the main response flow.
 */

type Emit = (posts: MediaPost[]) => void;

/** Facebook/Instagram responses sometimes start with the protective prefix `for (;;);`. */
function parseJsonText(text: string): unknown {
  return JSON.parse(text.replace(/^for \(;;\);/, ''));
}

function handle(parser: PageDataParser, emit: Emit, read: () => unknown) {
  // Parse after the current task so as not to delay the page's own handlers
  setTimeout(() => {
    try {
      const posts = parser.parse(read());
      if (posts.length > 0) emit(posts);
    } catch {
      // Not JSON or an unexpected structure: skip
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
      // The response can't be read (e.g. opaque): skip
    }
    return response;
  };
}

/** Parses JSON embedded in the HTML on the first page load. */
export function watchInlineData(parser: PageDataParser, emit: Emit, marker: string) {
  // Instagram appends data blocks to the end of the page even after DOMContentLoaded
  // (that's how the first batch of Explore arrives), so they are watched during the whole load
  const done = new WeakSet<Element>();
  let scheduled = false;

  const scan = () => {
    scheduled = false;
    for (const script of document.querySelectorAll('script[type="application/json"]')) {
      if (done.has(script)) continue;
      const text = script.textContent ?? '';
      // A cheap check before the expensive JSON.parse: most scripts contain no media
      if (!text.includes(marker)) continue;
      try {
        const json = parseJsonText(text);
        // Mark only successfully parsed ones: a large block may arrive incomplete
        done.add(script);
        const posts = parser.parse(json);
        if (posts.length > 0) emit(posts);
      } catch {
        // The block is still being written or isn't our format: try again on the next pass
      }
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 0);
  };

  const observer = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeName === 'SCRIPT'))) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', schedule, { once: true });
  window.addEventListener(
    'load',
    () => {
      scan();
      // After loading, embedded blocks no longer appear: further data comes via XHR
      observer.disconnect();
    },
    { once: true },
  );
  schedule();
}

export function installInterceptor(parser: PageDataParser, emit: Emit) {
  hookXhr(parser, emit);
  hookFetch(parser, emit);
}
