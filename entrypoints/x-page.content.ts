import { PAGE_CHANNEL, type PagePostsMessage } from '@/lib/core/messages';
import { installInterceptor } from '@/lib/page/interceptor';
import { xPageParser } from '@/lib/sites/x/parse';

// Like instagram-page.content.ts, but for X: tweets come only through XHR in GraphQL responses,
// there is no embedded data on the page. Runs in the page context from the very start of loading.
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
