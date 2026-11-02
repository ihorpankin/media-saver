import { PAGE_CHANNEL, type PagePostsMessage } from '@/lib/core/messages';
import { installInterceptor } from '@/lib/page/interceptor';
import { xPageParser } from '@/lib/sites/x/parse';

// Как instagram-page.content.ts, но для X: твиты приходят только через XHR в GraphQL-ответах,
// встроенных данных на странице нет. Работает в контексте страницы с самого начала загрузки.
export default defineContentScript({
  matches: ['*://x.com/*', '*://twitter.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    installInterceptor(xPageParser, (posts) => {
      const message: PagePostsMessage = { channel: PAGE_CHANNEL, type: 'posts', posts };
      window.postMessage(message, location.origin);
    });
  },
});
