import { PAGE_CHANNEL, type PagePostsMessage } from '@/lib/core/messages';
import { installInterceptor, watchInlineData } from '@/lib/page/interceptor';
import { instagramPageParser } from '@/lib/sites/instagram/parse';

// Runs in the page context (MAIN world) from the very start of loading, to patch
// XHR/fetch before Instagram's code does. There is no extension API here:
// found posts are passed to the content script via window.postMessage.
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const emit = (posts: PagePostsMessage['posts']) => {
      const message: PagePostsMessage = { channel: PAGE_CHANNEL, type: 'posts', posts };
      window.postMessage(message, location.origin);
    };

    installInterceptor(instagramPageParser, emit);
    // No quotes: in data nested as a string the quotes are escaped
    watchInlineData(instagramPageParser, emit, 'image_versions2');
  },
});
