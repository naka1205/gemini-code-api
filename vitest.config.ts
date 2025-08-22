import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@/types': path.resolve(__dirname, 'src/types'),
      '@/adapters': path.resolve(__dirname, 'src/adapters'),
      '@/middleware': path.resolve(__dirname, 'src/middleware'),
      '@/services': path.resolve(__dirname, 'src/services'),
      '@/routes': path.resolve(__dirname, 'src/routes'),
      '@/database': path.resolve(__dirname, 'src/database'),
      '@/utils': path.resolve(__dirname, 'src/utils'),
    },
  },
});