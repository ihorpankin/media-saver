import type { SiteExtractor } from './extractor';

/** Создаёт реестр экстракторов. Экстракторы сайтов регистрируются по мере появления (этап 1 и дальше). */
export function createRegistry(extractors: readonly SiteExtractor[]) {
  return {
    all: extractors,
    /** Экстрактор для страницы или `undefined`, если сайт не поддерживается. */
    find(url: string | URL): SiteExtractor | undefined {
      const parsed = typeof url === 'string' ? new URL(url) : url;
      return extractors.find((e) => e.matches(parsed));
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
