import { defineConfig } from '@playwright/test';

const PORT = 4180;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}/sylvan-c7/`,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' }, grepInvert: /@lcp/ },
    // The throttled-4G LCP measurements (perf.spec.mjs, tagged @lcp) run last and alone: they time
    // page loads, so the other workers must not be competing for the CPU at the same moment.
    { name: 'lcp', use: { channel: 'chrome' }, grep: /@lcp/, dependencies: ['chrome'] },
  ],
  webServer: {
    command: 'node tests/serve.mjs',
    url: `http://127.0.0.1:${PORT}/sylvan-c7/`,
    env: { PORT: String(PORT), PREFIX: '/sylvan-c7' },
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
