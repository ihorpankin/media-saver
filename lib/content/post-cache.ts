import type { MediaPost } from '@/lib/core/media';

/** Pixels in the best version of the post: this number decides which copy is better. */
function pixels(post: MediaPost): number {
  return post.items.reduce((sum, item) => sum + (item.width ?? 0) * (item.height ?? 0), 0);
}

function videos(post: MediaPost): number {
  return post.items.filter((item) => item.kind === 'video').length;
}

/** A positive number if copy `a` is better than `b`. */
function compare(a: MediaPost, b: MediaPost): number {
  return a.items.length - b.items.length || videos(a) - videos(b) || pixels(a) - pixels(b);
}

/**
 * Cache of posts found by the interceptor. The same post comes from different places
 * (feed, profile, post page) in different quality, so the best copy is kept:
 * more items, then more videos (videos often have no sizes, and a copy with a single
 * cover would otherwise win on pixels), then more pixels.
 */
export function createPostCache(limit = 2000) {
  const posts = new Map<string, MediaPost>();

  return {
    add(post: MediaPost) {
      const old = posts.get(post.postId);
      if (old && compare(old, post) > 0) return;
      // Map remembers insertion order: an updated post moves to the end, old ones get evicted
      posts.delete(post.postId);
      posts.set(post.postId, post);
      if (posts.size > limit) posts.delete(posts.keys().next().value!);
    },
    get(postId: string): MediaPost | undefined {
      return posts.get(postId);
    },
    /** The first post matching the condition (searches the whole cache, for rare cases). */
    find(predicate: (post: MediaPost) => boolean): MediaPost | undefined {
      for (const post of posts.values()) if (predicate(post)) return post;
      return undefined;
    },
    get size() {
      return posts.size;
    },
  };
}
