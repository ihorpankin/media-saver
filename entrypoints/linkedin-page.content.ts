import { LINKEDIN_SOURCES_ATTR, LINKEDIN_SOURCES_EVENT } from '@/lib/core/messages';

interface VideoJsPlayer {
  currentSources(): Array<{ src: string; type: string }>;
}

// LinkedIn: the video.js player object hangs on its element (`.player`) but is visible only
// to the page's JS. On request from linkedin.content.ts the mp4 links go into a player attribute.
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
