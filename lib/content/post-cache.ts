import type { MediaPost } from '@/lib/core/media';

/** Сколько пикселей в лучшей версии поста: по этому числу решаем, какая из копий лучше. */
function pixels(post: MediaPost): number {
  return post.items.reduce((sum, item) => sum + (item.width ?? 0) * (item.height ?? 0), 0);
}

function videos(post: MediaPost): number {
  return post.items.filter((item) => item.kind === 'video').length;
}

/** Положительное число, если копия `a` лучше `b`. */
function compare(a: MediaPost, b: MediaPost): number {
  return a.items.length - b.items.length || videos(a) - videos(b) || pixels(a) - pixels(b);
}

/**
 * Кэш постов, найденных перехватчиком. Один и тот же пост приходит из разных мест
 * (лента, профиль, страница поста) с разным качеством, поэтому оставляем лучшую копию:
 * больше элементов, затем больше видео (у видео часто нет размеров, а копия с одной
 * обложкой иначе победила бы по пикселям), затем больше пикселей.
 */
export function createPostCache(limit = 2000) {
  const posts = new Map<string, MediaPost>();

  return {
    add(post: MediaPost) {
      const old = posts.get(post.postId);
      if (old && compare(old, post) > 0) return;
      // Map помнит порядок вставки: обновлённый пост переносим в конец, старые вытесняем
      posts.delete(post.postId);
      posts.set(post.postId, post);
      if (posts.size > limit) posts.delete(posts.keys().next().value!);
    },
    get(postId: string): MediaPost | undefined {
      return posts.get(postId);
    },
    /** Первый пост, подходящий под условие (поиск по всему кэшу, для редких случаев). */
    find(predicate: (post: MediaPost) => boolean): MediaPost | undefined {
      for (const post of posts.values()) if (predicate(post)) return post;
      return undefined;
    },
    get size() {
      return posts.size;
    },
  };
}
