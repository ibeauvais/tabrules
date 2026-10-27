# TabRules — Plan

Chrome extension (Manifest V3) that groups tabs automatically based on user-defined rules.
First rule type: **full hostname**.

## 0. Non-negotiable requirements

| Area            | Requirement                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Permissions** | `tabs`, `tabGroups`, `storage` only. No host permissions, no content scripts, no `web_accessible_resources`.            |
| **Privacy**     | No network access at all. No telemetry. URLs and titles are never written to disk or logged.                            |
| **Security**    | Zero runtime dependencies. Strict CSP. No `innerHTML`. Validated inputs. Builds anyone can reproduce.                   |
| **Performance** | Purely event-driven: no polling, no alarms. Fast exit on irrelevant events. O(1) rule lookup. Batched Chrome API calls. |

## 1. Scope

- **The `hostname` rule.** `new URL(url).hostname`, lower-cased. `mail.google.com` and `docs.google.com` go into two separate groups. `www.github.com` and `github.com` are also kept separate; normalizing them can come later as a per-rule option.
- **Pattern `*`.** A catch-all rule that creates one group per hostname, so the user doesn't have to declare every site. Exact hostname rules take precedence over it. It cannot have a `groupTitle`: each group is titled with its hostname.
- **Hostname normalization.** The port, credentials and a trailing dot are ignored. IDNs stay in punycode (`xn--caf-dma.fr`), which avoids homograph look-alikes in group titles.
- **Schemes.** Only `http:` and `https:` are handled. `chrome://`, `about:`, `file:`, `data:`, extension pages and pinned tabs are ignored.
- **Extensibility.** Every rule type implements one interface and is registered in a registry. A new rule type means one new matcher file plus its tests; the engine doesn't change.
  ```ts
  interface RuleMatcher<R extends Rule> {
    readonly type: R["type"];
    compile(rules: readonly R[]): CompiledMatcher; // precompute once per rules change
  }
  interface CompiledMatcher {
    match(url: URL): GroupTarget | null; // null = no match
  }
  interface GroupTarget {
    key: string; // "rule:<id>" or "hostname:<hostname>", unique per window
    title: string;
    color?: TabGroupColor;
  }
  ```

## 2. Architecture

```
src/
  background/service-worker.ts   # registers listeners synchronously, delegates to engine
  core/                          # pure TypeScript, no chrome.* → 100% unit-testable
    rule.ts                      # Rule types + validation
    registry.ts                  # matcher registry, compiles the rule set
    matchers/hostname.ts
  engine/
    grouper.ts                   # find-or-create group, move tab, per-window queue
    rules-cache.ts               # lazy-loaded compiled rules, invalidated on storage change
  ui/options/                    # rules CRUD (vanilla TS + DOM APIs, no framework)
  ui/popup/                      # "Group all now", global on/off
manifest.json
```

**Toolchain.** TypeScript compiled by `tsc` straight to native ES modules: MV3 supports `"type": "module"` service workers and `<script type="module">`. There is no bundler, so there is less supply-chain surface and the build output is exactly what reviewers read.

**Dev dependencies:** `typescript`, `@types/chrome`, `vitest`, `eslint`, `typescript-eslint`, `prettier`. Nothing else.

## 3. Privacy design

- **Network.** The CSP below sets `connect-src 'none'`, so even a compromised build cannot call out.
- **Rules storage.** Rules live in `chrome.storage.local`, not `sync`. They never leave the machine, not even to Google Sync. Users can move them by hand with JSON export and import.
- **Runtime state.** The `groupId → groupKey` map lives in `chrome.storage.session`. That storage is memory-only, wiped when the browser restarts, and never written to disk.
- **Logging.** Logs contain only event types and error codes, never URLs, hostnames or titles. Console logging is off by default and can be turned on with a debug flag in the options.
- **Incognito.** Not enabled by default (Chrome's default). Nothing in the manifest requests it.
- **`PRIVACY.md`** in the repo, used as the store's privacy policy: "collects nothing, sends nothing".

## 4. Security design

**Manifest hardening**

```json
"content_security_policy": {
  "extension_pages": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'; require-trusted-types-for 'script'"
},
"externally_connectable": { "ids": [] }
```

- `externally_connectable` with empty `ids` stops web pages and other extensions from messaging TabRules. There is no `onMessageExternal` listener either.
- `require-trusted-types-for 'script'` makes any `innerHTML`, `eval` or similar sink throw. The UI builds the DOM only with `createElement` and `textContent`.

**Input validation** (rules come from the options UI or from a JSON import)

- Validate imports against a strict schema. Reject unknown fields.
- Hostname patterns: the charset `[a-z0-9.-]`, or `*`.
- Limits: at most 253 characters per pattern, 100 characters per group title, 500 rules.
- Colors are checked against the `chrome.tabGroups.Color` enum.
- Future `regex` rule type: ReDoS risk. Either cap pattern complexity or use only anchored literal and wildcard patterns. Decide when that type is added.

**Supply chain and CI** (GitHub Actions)

- Lockfile committed. `npm ci --ignore-scripts`. Renovate or Dependabot. `npm audit` gates the build.
- Third-party actions pinned by commit SHA. `permissions: read-all` by default and raised per job only when needed.
- CodeQL scanning.
- Release pipeline:
  - Build from a tag, so the store zip is built from public sources only.
  - Publish the zip with its SHA-256 and a build-provenance attestation (`actions/attest-build-provenance`).
  - Anyone can rebuild from the tag and compare with the store package.
- The Chrome Web Store upload credentials live in a protected GitHub Environment with a required reviewer. The developer account uses 2FA.
- `SECURITY.md` with a vulnerability disclosure contact.

## 5. Performance design

- **Synchronous top-level listener registration** in the service worker, so no event is missed when Chrome wakes the worker. Rules load lazily through a cached promise that every handler awaits. This fixes the race in existing extensions, where events arriving before the rules loaded were dropped.
- **Early exit.** `tabs.onUpdated` fires for titles, favicons and loading status. Return immediately unless `changeInfo.url` is set, the tab is not pinned and the scheme is http or https.
- **Compiled rules.** Exact hostname rules go in a `Map<hostname, Rule>`, which makes lookup O(1). The catch-all is the fallback. Rules are recompiled only on `storage.onChanged`.
- **Fewer Chrome API calls.**
  - Skip the call when the tab is already in its target group.
  - Cache `(windowId, groupKey) → groupId` in memory. Invalidate it on `tabGroups.onRemoved` and `onUpdated`, and fall back to `tabGroups.query` on a cache miss.
- **Batching.** "Group all now" buckets tabs by key and makes one `chrome.tabs.group({ tabIds: [...] })` call per group.
- **Serialization.** A per-window promise queue prevents duplicate groups when several tabs open at once.
- **Budgets.**
  - Event handling under 1 ms of our own code, Chrome API time excluded.
  - "Group all" on 300 tabs in under 500 ms.
  - Unpacked size under 50 KB.
  - Measured with a scripted benchmark that opens 300 tabs.

## 6. Grouping behaviour and edge cases

| Case                                              | Behaviour                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Tab navigates to a hostname with a matching rule  | Move it to the group for `(windowId, groupKey)`, creating the group if needed |
| Tab navigates to a hostname with no matching rule | Ungroup it only if it sits in a group TabRules manages                        |
| Groups created or edited by hand                  | Never touched. Only groups listed in the session map are managed              |
| User renames a managed group                      | Treat it as user-owned from then on and drop it from the session map          |
| Tab or group closed during an operation           | Swallow only the "No tab/group with id" error. Report any other error         |
| Service worker restart                            | Stateless. Rebuild the session map from `storage.session`                     |
| Tab moved to another window                       | Re-evaluate it in its new window (`tabs.onAttached`)                          |

## 7. Milestones

1. **Scaffold.** Repo, `tsc` build, hardened manifest, ESLint, Prettier, Vitest, CI (lint, test, build, audit, CodeQL).
2. **Core.** Rule model, validation, registry and `hostname` matcher.
   - 100% branch coverage.
   - Edge cases: IP addresses, IPv6, `localhost`, ports, punycode or IDN hostnames, invalid URLs.
3. **Engine.** Service worker, rules cache, grouper with its queue, session map.
4. **UI.** Options page (rules CRUD, JSON import and export, debug toggle) and popup ("Group all now", on/off).
5. **Hardening.**
   - Run the manual test matrix from section 6.
   - Performance benchmark.
   - Check that the CSP blocks `fetch`: a test in the options page console must fail.
6. **Dogfooding.** One week of daily use.
7. **Publishing.**
   - GitHub: MIT license, README, `PRIVACY.md`, `SECURITY.md`, `CHANGELOG`, tagged release with checksum and provenance.
   - Chrome Web Store: US$5 developer account and listing.
     - Store assets: a 128×128 icon and at least one 1280×800 screenshot.
     - Listing text: a single-purpose statement and a justification for each of the 3 permissions.
