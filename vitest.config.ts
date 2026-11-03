import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Dates in file names use local time, so the zone is fixed to keep tests machine-independent
    env: { TZ: 'UTC' },
  },
});
