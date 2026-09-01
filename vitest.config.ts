import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Resolves the `@/*` path alias declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.spec.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
  },
});
