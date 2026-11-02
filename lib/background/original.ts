import type { MediaPost } from '@/lib/core/media';
import type { DownloadResponse, OriginalRequest } from '@/lib/core/messages';
import { handleDownload } from './downloader';

/*
 * «Скачать оригинал». В ленте и в REST-ответе фото обрезаны до 1080px, а полный список
 * размеров приходит только во встроенном JSON страницы поста. Поэтому открываем пост
 * в неактивной вкладке — это обычная навигация, как если бы пользователь открыл ссылку, —
 * content script там отдаёт данные поста, а вкладку закрываем.
 */

const TIMEOUT_MS = 20_000;

/** Фоновые вкладки, которые ждут данные: id вкладки → шорткод и обработчик. */
const pending = new Map<number, { postId: string; resolve: (post: MediaPost) => void }>();

/** Шорткод поста, если вкладка открыта ради оригинала. */
export function harvestTarget(tabId: number | undefined): string | undefined {
  return tabId === undefined ? undefined : pending.get(tabId)?.postId;
}

/** Данные от фоновой вкладки. */
export function harvestResult(tabId: number | undefined, post: MediaPost) {
  if (tabId !== undefined) pending.get(tabId)?.resolve(post);
}

async function fetchFullPost(postId: string): Promise<MediaPost> {
  const tab = await browser.tabs.create({
    url: `https://www.instagram.com/p/${postId}/`,
    active: false,
  });
  const tabId = tab.id!;
  try {
    return await new Promise<MediaPost>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('страница поста не ответила за 20 секунд')),
        TIMEOUT_MS,
      );
      pending.set(tabId, {
        postId,
        resolve: (post) => {
          clearTimeout(timer);
          resolve(post);
        },
      });
    });
  } finally {
    pending.delete(tabId);
    await browser.tabs.remove(tabId).catch(() => {});
  }
}

/** Скачивает элемент поста в оригинальном размере. */
export async function handleOriginal({ post, index }: OriginalRequest): Promise<DownloadResponse> {
  const full = await fetchFullPost(post.postId);
  const item = full.items.find((i) => i.index === index);
  if (!item) return { completed: 0, errors: [{ index, error: 'нет такого слайда в посте' }] };
  // Имя файла как у обычного скачивания: автор и число слайдов берём из исходного поста
  return handleDownload({
    type: 'download',
    post: { ...post, items: [item], itemCount: post.itemCount ?? post.items.length },
    indexes: [index],
  });
}
