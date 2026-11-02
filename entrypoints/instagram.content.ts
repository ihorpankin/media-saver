// Заглушка: проверяем, что content script подключается к Instagram.
// Логика экстрактора появится в задачах этапа 1.
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  main() {
    console.log('[media-saver] content script на', location.href);
  },
});
