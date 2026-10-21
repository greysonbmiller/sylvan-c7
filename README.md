# Sylvan C7

The website at https://greysonbmiller.github.io/sylvan-c7/: plain HTML, CSS and JavaScript with no
framework. GitHub Pages publishes the `main` branch as it is.

## Development

You need Node.js 18 or newer. Commands work the same on Linux, macOS and Windows.

```sh
npm ci                                  # install the test tools
npx playwright install chromium         # the browser the tests use (add --with-deps on a fresh Linux box)
npm test                                # run every test (starts its own local server)
```

- **View the site locally:** `npm run serve`, then open http://127.0.0.1:4180/sylvan-c7/. It caches
  like GitHub Pages (10 minutes), so hard-reload (Ctrl/Cmd+Shift+R) after editing a file.
- **CSS:** edit the sources (`css/site.css`, `css/page-*.css`, `css/fx/*.css`), then run
  `npm run build:css` to rebuild the `.min.css` files and `css/fx.css`. Never edit those by hand;
  `npm run check:css` and the tests fail if they are out of date.
- **Inline scripts:** every page carries a Content-Security-Policy that lists the hash of each inline
  `<script>`. After adding or editing one, run `node scripts/csp.mjs` to rewrite the policies;
  `npm run check:csp` and `tests/security.spec.mjs` fail until you do.
- **Before pushing:** `npm run ci` runs the CSS and CSP checks and the whole suite, exactly as CI does.
- **Run part of the suite:** `npx playwright test tests/seo.spec.mjs`, or `npm run test:lcp` to
  re-measure only the throttled-4G load times.
- **Options** (environment variables): `PW_PORT` sets the test server's port (default 4180);
  `PW_CHANNEL=chrome` tests your installed Google Chrome instead of Playwright's Chromium.

## CI

`.github/workflows/test.yml` runs `npm run ci` on Linux, macOS and Windows for every push and pull
request. When a run fails, its Playwright HTML report is attached to the run as an artifact. Any
other CI service can run the same three commands: `npm ci`,
`npx playwright install --with-deps chromium`, `npm run ci`.
