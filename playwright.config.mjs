import { defineConfig } from '@playwright/test';

// PW_PORT: run several checkouts' suites side by side. PW_CHANNEL=chromium: use Playwright's bundled
// Chromium on machines without Google Chrome installed (the default, 'chrome', is what CI and the
// published numbers use).
const PORT = Number(process.env.PW_PORT || 4180);
const CHANNEL = process.env.PW_CHANNEL === 'chromium' ? undefined : (process.env.PW_CHANNEL || 'chrome');

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/sylvan-c7/`,
    channel: CHANNEL,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chrome', use: { channel: CHANNEL }, grepInvert: /@lcp/ },
    // The throttled-4G LCP measurements (perf.spec.mjs, tagged @lcp) run last and alone: they time
    // page loads, so the other workers must not be competing for the CPU at the same moment.
    { name: 'lcp', use: { channel: CHANNEL }, grep: /@lcp/, dependencies: ['chrome'] },
  ],
  webServer: {
    command: 'node tests/serve.mjs',
    url: `http://127.0.0.1:${PORT}/sylvan-c7/`,
    env: { PORT: String(PORT), PREFIX: '/sylvan-c7' },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
