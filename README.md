# TabRules

Chrome extension that groups your tabs automatically with your own rules.

- **Exact hostname rules:** `github.com` groups every GitHub tab.
- **Regular expression rules:** `(^|\.)google\.com$` groups google.com and all
  its subdomains.
- **One group per site:** the `*` rule groups every other site by hostname.
- **Priority:** rules are checked from top to bottom, and the first match wins.
- **Title and color** per rule.
- **Your own groups are never touched.**

Private and auditable:

- Only three permissions: `tabs`, `tabGroups`, `storage`.
- No network access, enforced by the content security policy.
- No data collection.
- No runtime dependencies, and unminified code you can read.

## Install

- **Chrome Web Store:** link coming with the first publication.
- **From a release:**
  1. Download `tabrules-<version>.zip` from the
     [releases](../../releases) and unzip it.
  2. Open `chrome://extensions` and enable **Developer mode**.
  3. Click **Load unpacked** and select the unzipped folder.
- **From source:** see [Development](#development).

## Usage

Click the TabRules icon, then **Manage rules**.

| Match              | Example               | Groups                                   |
| ------------------ | --------------------- | ---------------------------------------- |
| Exact hostname     | `github.com`          | `github.com` only, not `gist.github.com` |
| Regular expression | `(^\|\.)google\.com$` | `google.com`, `mail.google.com`, …       |
| Exact hostname     | `*`                   | Every other site, one group per hostname |

- **Priority.** Rules are checked from top to bottom: the first rule that
  matches decides the group, and the following rules are skipped. Use ↑ and ↓
  to reorder them. Rules below a `*` rule are never applied, and the options
  page flags them.
- **Regular expressions** are tested against the hostname only. Supported
  syntax: `. [ ] ( ) | * + ? {n,m} ^ $ \d \w`, lowercase only. Backreferences
  and lookarounds are not supported.
- **Pause** grouping at any time with the switch in the popup.
- **Back up or share** your rules with **Export** and **Import**.

## Privacy and security

- **Data:** TabRules reads tab addresses in memory to match them against your
  rules. It stores only your rules, on your device. See
  [PRIVACY.md](PRIVACY.md).
- **Security model** and how to report a vulnerability: see
  [SECURITY.md](SECURITY.md).

## Verify a release

Releases are built by GitHub Actions from a tagged commit. Each release
publishes `tabrules-<version>.zip`, its SHA-256 checksum and a build provenance
attestation. The package is reproducible: rebuilding a tag gives the same bytes.

```sh
# 1. Check that GitHub Actions built the downloaded zip from this repository
gh attestation verify tabrules-1.0.0.zip --repo ibeauvais/tabrules

# 2. Rebuild it yourself and compare the checksums
git clone https://github.com/ibeauvais/tabrules && cd tabrules
git checkout v1.0.0
asdf install && npm ci
npm run package
cat release/tabrules-1.0.0.zip.sha256   # must match the published checksum
```

To compare with the extension installed from the Chrome Web Store, unzip the
release and diff it against the installed copy, ignoring the `_metadata`
folder that the store adds. Find the installed copy under the `Extensions`
folder of the profile path shown in `chrome://version`.

## Development

Requirements: the Node.js version from `.tool-versions` (`asdf install`).

```sh
npm ci                                 # install dev dependencies (install scripts are disabled in .npmrc)
npx puppeteer browsers install chrome  # Chrome for Testing, needed by test:e2e, icons and store assets
npm run check                          # typecheck, lint, format check, unit tests with coverage, build
npm run test:e2e                       # build, then end-to-end tests in headless Chrome (offline)
npm run build                          # unpacked extension in dist/
npm run package                        # reproducible zip and checksum in release/
npm run icons                          # render assets/*.svg to static/icons/*.png
npm run store-assets                   # render the Chrome Web Store screenshots to assets/store/ (see docs/store-listing.md)
```

Load `dist/` from `chrome://extensions` → Developer mode → **Load unpacked**.
After a rebuild, click ↻ on the extension card: until then, the service worker
keeps running the previous code.

Releasing: bump `version` in `package.json`, update `CHANGELOG.md`, commit,
then push a `v<version>` tag. The release workflow builds, attests and
publishes the package.

## License

[MIT](LICENSE)
