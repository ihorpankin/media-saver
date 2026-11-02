import { LINKEDIN_SOURCES_ATTR, LINKEDIN_SOURCES_EVENT } from '@/lib/core/messages';

interface VideoJsPlayer {
  currentSources(): Array<{ src: string; type: string }>;
}

// LinkedIn: объект плеера video.js висит на его элементе (`.player`), но виден только
// в JS страницы. По запросу linkedin.content.ts кладём ссылки на mp4 в атрибут плеера.
export default defineContentScript({
  matches: ['*://www.linkedin.com/*'],
  world: 'MAIN',
  main() {
    document.addEventListener(LINKEDIN_SOURCES_EVENT, (event) => {
      const el = event.target as HTMLElement & { player?: VideoJsPlayer };
      const urls = (el.player?.currentSources() ?? [])
        .filter((s) => s.type === 'video/mp4')
        .map((s) => s.src);
      el.setAttribute(LINKEDIN_SOURCES_ATTR, JSON.stringify(urls));
    });
  },
});
