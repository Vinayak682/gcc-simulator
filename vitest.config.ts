import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-logic tests only: no jsdom, no Supabase, no network.
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
