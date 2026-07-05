import { defineConfig, devices } from '@playwright/test';

import { LANGUAGE_STORAGE_STATE_PATH } from './e2e/support/language';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  globalSetup: './e2e/support/global-setup.ts',
  use: {
    baseURL,
    trace: 'on-first-retry',
    storageState: LANGUAGE_STORAGE_STATE_PATH,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
