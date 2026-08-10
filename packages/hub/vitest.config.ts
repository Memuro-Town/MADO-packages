import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // tsconfig.json の "paths": { "@/*": ["./*"] } と対応させる
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
