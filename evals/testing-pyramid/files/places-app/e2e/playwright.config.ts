import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  retries: 2,
  workers: 1,
  use: { baseURL: 'http://localhost:4321' },
  webServer: { command: 'npm run dev', url: 'http://localhost:4321' },
});
