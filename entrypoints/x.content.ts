import { createPostCache } from '@/lib/content/post-cache';
import type { MediaItem, MediaPost } from '@/lib/core/media';
import {
  isPageMessage,
  type ContextDownloadRequest,
  type DownloadRequest,
  type DownloadResponse,
} from '@/lib/core/messages';
import { originalPhotoUrl } from '@/lib/sites/x/parse';
import { createInlineButton, triggerDownload } from '@/lib/ui/download-button';

// X (Twitter): кнопка ⬇ в строке действий под твитом — «ответить, репост, лайк, просмотры,
// закладка, поделиться». Скачивает все фото и видео твита в оригинальном размере.
// Данные твитов приходят от перехватчика (x-page.content.ts); без них — фото прямо из DOM.

const cache = createPostCache();

/** id твита из ссылки на него: у времени публикации она ведёт на `/<user>/status/<id>`. */
function tweetIdOf(article: Element): string | undefined {
  const link = article.querySelector('a[href*="/status/"] time')?.closest('a');
  return link?.getAttribute('href')?.match(/\/status\/(\d+)/)?.[1];
}

/** Запасной путь: фото твита прямо со страницы. Цитируемый твит внутри пропускаем. */
function postFromDom(article: Element, postId: string): MediaPost {
  const images = [...article.querySelectorAll<HTMLImageElement>('img[src*="pbs.twimg.com/media/"]')]
    .filter((img) => !img.closest('[role="link"]:not(article)'))
    .map((img) => img.src);
  if (images.length === 0)
    throw new Error('нет данных о медиа — прокрутите ленту или обновите страницу');
  const author = article
    .querySelector('a[href*="/status/"] time')
    ?.closest('a')
    ?.getAttribute('href')
    ?.split('/')[1];
  const items: MediaItem[] = images.map((src, i) => {
    // `…/media/<id>?format=jpg&name=small` → `…/media/<id>.jpg` → оригинал
    const u = new URL(src);
    const { url, ext } = originalPhotoUrl(
      `${u.origin}${u.pathname}.${u.searchParams.get('format') ?? 'jpg'}`,
    );
    return { kind: 'image', mediaId: `${postId}-${i + 1}`, index: i + 1, url, ext };
  });
  return { site: 'x', postId, author, items, itemCount: items.length };
}

async function downloadTweet(article: Element, postId: string) {
  const post = cache.get(postId) ?? postFromDom(article, postId);
  const request: DownloadRequest = { type: 'download', post };
  const response: DownloadResponse = await browser.runtime.sendMessage(request);
  if (response.errors.length > 0) {
    throw new Error(response.errors.map((e) => `#${e.index}: ${e.error}`).join('; '));
  }
}

function hasMedia(article: Element): boolean {
  return Boolean(
    article.querySelector('img[src*="pbs.twimg.com/media/"], video, [data-testid="videoPlayer"]'),
  );
}

function scan() {
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const postId = tweetIdOf(article);
    // У твита может быть несколько групп кнопок (у цитаты своя) — строка действий последняя
    const group = [...article.querySelectorAll('[role="group"]')].at(-1);
    if (!postId || !group || group.querySelector('media-saver-button') || !hasMedia(article)) {
      continue;
    }
    const share = group.lastElementChild;
    const wrapper = document.createElement('div');
    // Классы соседней кнопки — те же отступы и выравнивание, что у родных
    if (share) wrapper.className = share.className;
    wrapper.append(
      createInlineButton('row', {
        title: 'Скачать фото и видео твита',
        onClick: () => downloadTweet(article, postId),
      }),
    );
    group.insertBefore(wrapper, share);
  }
}

// ---- Контекстное меню: нажимаем ⬇ того твита, на котором кликнули ----

let contextArticle: Element | undefined;

/** У твита одна кнопка — все медиа, поэтому любой пункт меню скачивает их. */
function contextDownload() {
  const host = contextArticle?.querySelector<HTMLElement>('media-saver-button');
  if (host) triggerDownload(host);
}

export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  runAt: 'document_start',
  main() {
    window.addEventListener('message', (event) => {
      if (event.source !== window || !isPageMessage(event.data)) return;
      for (const post of event.data.posts) cache.add(post);
    });
    document.addEventListener(
      'contextmenu',
      (event) => {
        contextArticle =
          (event.target instanceof Element && event.target.closest('article')) || undefined;
      },
      true,
    );
    browser.runtime.onMessage.addListener((message: ContextDownloadRequest) => {
      if (message?.type === 'context-download') contextDownload();
    });

    const start = () => {
      let scheduled = false;
      // X — SPA с бесконечной лентой: твиты постоянно добавляются и перерисовываются
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          scan();
        });
      }).observe(document.body, { childList: true, subtree: true });
      scan();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  },
});
