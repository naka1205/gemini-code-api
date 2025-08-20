import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      bindings: {
        DB: 'TEST_DB'
      }
    }
  },
  resolve: {
    alias: {
      '~': new URL('./src', import.meta.url).pathname
    }
  }
});