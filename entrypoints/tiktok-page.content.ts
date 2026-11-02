import { PAGE_CHANNEL, type PagePostsMessage } from '@/lib/core/messages';
import { installInterceptor, watchInlineData } from '@/lib/page/interceptor';
import { tiktokPageParser } from '@/lib/sites/tiktok/parse';

// Как instagram-page.content.ts, но для TikTok: ролик страницы приходит во встроенном
// `__UNIVERSAL_DATA_FOR_REHYDRATION__`, ленты — запросами `/api/…/item_list/`.
export default defineContentScript({
  matches: ['*://www.tiktok.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const emit = (posts: PagePostsMessage['posts']) => {
      const message: PagePostsMessage = { channel: PAGE_CHANNEL, type: 'posts', posts };
      window.postMessage(message, location.origin);
    };
    installInterceptor(tiktokPageParser, emit);
    watchInlineData(tiktokPageParser, emit, 'bitrateInfo');
  },
});
