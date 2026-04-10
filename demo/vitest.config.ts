import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    include: ['__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      vitamem: path.resolve(__dirname, '../src'),
      '@': path.resolve(__dirname, '.'),
    },
  },
});
