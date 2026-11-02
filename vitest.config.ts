import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    // Даты в именах файлов считаются по местному времени — фиксируем пояс, чтобы тесты не зависели от машины
    env: { TZ: 'UTC' },
  },
});
