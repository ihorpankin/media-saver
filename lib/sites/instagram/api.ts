import type { MediaPost } from '@/lib/core/media';
import { parseInstagram, pkFromShortcode } from './parse';

/*
 * Запасной путь (B): один запрос к REST Instagram, когда поста нет в кэше перехватчика.
 * Сам Instagram ходит в `/api/v1/media/{pk}/info/`, когда открываешь пост кликом, поэтому
 * для сайта это обычный трафик. Работает в content script: запрос с того же origin,
 * cookie сессии уходят сами.
 *
 * Бережём аккаунт: только по клику, не чаще раза в MIN_INTERVAL, а после 429 или проверки
 * на бота (`/challenge/`) — пауза на COOLDOWN, без запросов вообще.
 */

const MIN_INTERVAL = 3_000;
const COOLDOWN = 10 * 60_000;
/** Публичный id веб-клиента Instagram; на случай, если на странице его не найдём. */
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
    throw new Error('Instagram попросил притормозить — попробуйте через несколько минут');
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
    throw new Error('Instagram попросил притормозить — попробуйте через несколько минут');
  }
  if (response.url.includes('/accounts/login/') || response.status === 401) {
    throw new Error('войдите в Instagram');
  }
  if (response.status === 403 || response.status === 404) {
    throw new Error('пост недоступен: удалён или закрытый аккаунт');
  }
  if (!response.ok) throw new Error(`Instagram ответил HTTP ${response.status}`);
  return response.json();
}

/**
 * Пост по шорткоду или pk (у сторис в адресе pk). Запросы идут по одному, даже если
 * пользователь нажал несколько кнопок подряд.
 */
export function fetchPost(id: string): Promise<MediaPost> {
  const pk = /^\d+$/.test(id) ? id : pkFromShortcode(id);
  const result = queue.then(async () => {
    const posts = parseInstagram(await request(pk));
    const post = posts.find((p) => p.postId === id) ?? posts[0];
    if (!post) throw new Error('в ответе Instagram нет этого поста');
    return post;
  });
  queue = result.catch(() => {});
  return result;
}
