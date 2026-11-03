import type { MediaPost } from '@/lib/core/media';
import { parseInstagram, pkFromShortcode } from './parse';

/*
 * Fallback (B): one request to Instagram's REST API when the post isn't in the interceptor cache.
 * Instagram itself calls `/api/v1/media/{pk}/info/` when you open a post with a click, so
 * for the site this is regular traffic. Runs in the content script: the request is same-origin,
 * session cookies go along by themselves.
 *
 * Protecting the account: only on click, at most once per MIN_INTERVAL, and after a 429 or a bot
 * check (`/challenge/`) a COOLDOWN pause with no requests at all.
 */

const MIN_INTERVAL = 3_000;
const COOLDOWN = 10 * 60_000;
/** Public id of Instagram's web client, in case it isn't found on the page. */
const DEFAULT_APP_ID = '936619743392459';

let queue: Promise<unknown> = Promise.resolve();
let lastRequest = 0;
let blockedUntil = 0;

function appId(): string {
  for (const script of document.querySelectorAll('script[type="application/json"]')) {
    const id = script.textContent?.match(/"APP_ID":"(\d+)"/)?.[1];
    if (id) return id;
  }
  return DEFAULT_APP_ID;
}

async function request(pk: string): Promise<unknown> {
  if (Date.now() < blockedUntil) {
    throw new Error('Instagram asked to slow down — try again in a few minutes');
  }
  const wait = lastRequest + MIN_INTERVAL - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequest = Date.now();

  const response = await fetch(`/api/v1/media/${pk}/info/`, {
    credentials: 'include',
    headers: { 'X-IG-App-ID': appId(), 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (response.status === 429 || response.url.includes('/challenge/')) {
    blockedUntil = Date.now() + COOLDOWN;
    throw new Error('Instagram asked to slow down — try again in a few minutes');
  }
  if (response.url.includes('/accounts/login/') || response.status === 401) {
    throw new Error('log in to Instagram');
  }
  if (response.status === 403 || response.status === 404) {
    throw new Error('post unavailable: deleted or private account');
  }
  if (!response.ok) throw new Error(`Instagram responded with HTTP ${response.status}`);
  return response.json();
}

/**
 * A post by shortcode or pk (stories have the pk in the URL). Requests go one at a time even if
 * the user pressed several buttons in a row.
 */
export function fetchPost(id: string): Promise<MediaPost> {
  const pk = /^\d+$/.test(id) ? id : pkFromShortcode(id);
  const result = queue.then(async () => {
    const posts = parseInstagram(await request(pk));
    const post = posts.find((p) => p.postId === id) ?? posts[0];
    if (!post) throw new Error('the post is missing from the Instagram response');
    return post;
  });
  queue = result.catch(() => {});
  return result;
}
