# TabRules

Chrome extension that groups tabs automatically with user-defined rules.

- Permissions: `tabs`, `tabGroups`, `storage` only.
- No network access (enforced by CSP), no data collection, no runtime dependencies.

## Development

Requirements: Node.js version from `.tool-versions` (`asdf install`).

```sh
npm ci                              # install dev dependencies (install scripts are disabled in .npmrc)
npx puppeteer browsers install chrome  # Chrome for Testing, needed by test:e2e and icons
npm run check                       # typecheck, lint, format check, unit tests with coverage, build
npm run test:e2e                    # build, then end-to-end tests in headless Chrome (offline)
npm run build                       # outputs the unpacked extension to dist/
npm run icons                       # renders assets/*.svg to static/icons/*.png
```

Load `dist/` from `chrome://extensions` → Developer mode → **Load unpacked**.
