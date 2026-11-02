import type { MediaPost } from '@/lib/core/media';

/** Сколько пикселей в лучшей версии поста: по этому числу решаем, какая из копий лучше. */
function pixels(post: MediaPost): number {
  return post.items.reduce((sum, item) => sum + (item.width ?? 0) * (item.height ?? 0), 0);
}

/**
 * Кэш постов, найденных перехватчиком. Один и тот же пост приходит из разных мест
 * (лента, профиль, страница поста) с разным качеством, поэтому оставляем лучшую копию:
 * больше элементов, затем больше пикселей.
 */
export function createPostCache(limit = 2000) {
  const posts = new Map<string, MediaPost>();

  return {
    add(post: MediaPost) {
      const old = posts.get(post.postId);
      if (
        old &&
        (old.items.length > post.items.length ||
          (old.items.length === post.items.length && pixels(old) > pixels(post)))
      ) {
        return;
      }
      // Map помнит порядок вставки: обновлённый пост переносим в конец, старые вытесняем
      posts.delete(post.postId);
      posts.set(post.postId, post);
      if (posts.size > limit) posts.delete(posts.keys().next().value!);
    },
    get(postId: string): MediaPost | undefined {
      return posts.get(postId);
    },
    get size() {
      return posts.size;
    },
  };
}
