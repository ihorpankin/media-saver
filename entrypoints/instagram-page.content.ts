import { PAGE_CHANNEL, type PagePostsMessage } from '@/lib/core/messages';
import { installInterceptor, watchInlineData } from '@/lib/page/interceptor';
import { instagramPageParser } from '@/lib/sites/instagram/parse';

// Работает в контексте страницы (MAIN world) с самого начала загрузки, чтобы успеть
// подменить XHR/fetch раньше кода Instagram. Здесь нет доступа к API расширения:
// найденные посты передаются content script через window.postMessage.
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
    // Без кавычек: в данных, вложенных строкой, кавычки экранированы
    watchInlineData(instagramPageParser, emit, 'image_versions2');
  },
});
