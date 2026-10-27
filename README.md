# TabRules

Chrome extension that groups tabs automatically with user-defined rules.

- Permissions: `tabs`, `tabGroups`, `storage` only.
- No network access (enforced by CSP), no data collection, no runtime dependencies.

## Development

Requirements: Node.js version from `.tool-versions` (`asdf install`).

```sh
npm ci            # install dev dependencies (install scripts are disabled in .npmrc)
npm run check     # typecheck, lint, format check, tests with coverage, build
npm run build     # outputs the unpacked extension to dist/
```

Load `dist/` from `chrome://extensions` → Developer mode → **Load unpacked**.
