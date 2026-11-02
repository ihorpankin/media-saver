export default defineBackground(() => {
  console.log('[media-saver] background запущен', { id: browser.runtime.id });
});
