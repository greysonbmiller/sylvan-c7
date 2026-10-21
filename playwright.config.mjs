import { defineConfig } from '@playwright/test';

// Settings come from environment variables, so the same config runs anywhere (any OS, any CI host):
// PW_PORT     the test server's port (default 4180); lets several checkouts run their suites side by side.
// PW_CHANNEL  which browser (default 'chromium'). 'chromium' is Playwright's own Chromium build: its
//             version is pinned by @playwright/test in package.json and `npx playwright install chromium`
//             fetches that same build on Linux, macOS and Windows, so every machine tests one browser.
//             It runs in Chrome's real (new) headless mode, not the stripped-down headless shell that
//             Playwright uses when no channel is set: on Linux the shell lays text out with whole-pixel
//             glyph widths, so lines wrap differently from any real Chrome (tests/fonts-cls.spec.mjs).
//             PW_CHANNEL=chrome tests the locally installed Google Chrome instead (msedge works too).
// CI          set by every CI provider: no reusing a stray local server, no test.only, an HTML report.
const PORT = Number(process.env.PW_PORT || 4180);
const CHANNEL = process.env.PW_CHANNEL || 'chromium';
const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.mjs$/,
  timeout: 60_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: CI,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
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
    reuseExistingServer: !CI,
    timeout: 20_000,
  },
});
