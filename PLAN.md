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
- **Pattern `*`.** A catch-all rule that creates one group per hostname, so the user doesn't have to declare every site. It is ranked like any other rule, and every rule below it is never applied; the options page flags those rules. It cannot have a `groupTitle`: each group is titled with its hostname.
- **The `regex` rule.** A regular expression tested against the hostname only, with search semantics like `RegExp.test`. For example, `(^|\.)google\.com$` matches google.com and all its subdomains. All matching hostnames go into one group, titled with the rule's `groupTitle` or else the pattern.
  - Supported syntax: `. [ ] [^ ] ( ) (?: ) | * + ? {n,m} ^ $ \d \w` and escaped metacharacters.
  - Rejected with an explicit error: backreferences, lookarounds, other escapes and uppercase letters.
- **Priority.** Rules are evaluated in list order and the first matching rule wins; later rules are not considered, as with firewall rules.
  - The options page reorders rules with ↑ and ↓ buttons.
  - New rules are inserted just above the first `*` rule, so they are not shadowed from the start.
  - Matching stays fast. Each matcher returns its best candidate with its priority (an O(1) map for exact rules, the regex rules in order, the catch-all), and the registry keeps the lowest priority.
- **Hostname normalization.** The port, credentials and a trailing dot are ignored. IDNs stay in punycode (`xn--caf-dma.fr`), which avoids homograph look-alikes in group titles.
- **Schemes.** Only `http:` and `https:` are handled. `chrome://`, `about:`, `file:`, `data:`, extension pages and pinned tabs are ignored.
- **Extensibility.** Every rule type implements one interface and is registered in a registry. A new rule type means one new matcher file plus its tests; the engine doesn't change.
  ```ts
  interface RuleMatcher<R extends Rule> {
    compile(rules: readonly R[]): CompiledMatcher; // precompute once per rules change
  }
  // match() returns { priority, target }; registry.ts keeps the lowest priority across matchers
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
  ui/popup/                      # global on/off, rules summary, link to options
manifest.json
```

**Toolchain.** TypeScript compiled by `tsc` straight to native ES modules: MV3 supports `"type": "module"` service workers and `<script type="module">`. There is no bundler, so there is less supply-chain surface and the build output is exactly what reviewers read.

**Dev dependencies:** `typescript`, `@types/chrome`, `vitest`, `eslint`, `typescript-eslint`, `prettier`. Nothing else.

## 3. Privacy design

- **Network.** The CSP below sets `connect-src 'none'`, so even a compromised build cannot call out.
- **Rules storage.** Rules live in `chrome.storage.local`, not `sync`. They never leave the machine, not even to Google Sync. Users can move them by hand with JSON export and import.
- **Runtime state.** The `groupId → groupKey` map lives in `chrome.storage.session`. That storage is memory-only, wiped when the browser restarts, and never written to disk.
- **Logging.** Logs contain only event types and error messages, never URLs, hostnames or titles. Only warnings and errors are logged, so no debug flag is needed.
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

- Validate imports and saves against a strict schema. Reject unknown fields.
- Reading stored rules is lenient. The service worker and the pages apply the valid rules and report the invalid ones, instead of dropping everything. Otherwise a single unknown rule, for example one written by a newer version or read by a stale service worker, would disable all grouping.
- Hostname patterns: the charset `[a-z0-9.-]`, or `*`.
- Limits: at most 253 characters per pattern, 100 characters per group title, 500 rules.
- Colors are checked against the `chrome.tabGroups.Color` enum.
- **Regex patterns never reach the native `RegExp` engine.** That engine backtracks, so a pattern like `^(a+)+$` can take exponential time. It cannot be interrupted, and a service worker cannot offload it to a Worker.
  - `src/core/hostname-regex.ts` compiles the supported subset into a Thompson NFA and simulates it, which is the approach of RE2 and Go.
  - Matching time is O(states × hostname length). States are capped at 2,000, repeat counts at 63, and hostnames are at most 253 characters, so ReDoS is impossible by construction.
  - Differential tests check that it agrees with the native engine on a corpus of patterns and hostnames.

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
  - Keep `(windowId, groupKey) → groupId` in memory, mirrored to `storage.session`. Clean it up on `tabGroups.onRemoved`, and fall back to `tabGroups.query` by title on a miss.
- **Batching.** "Group all" buckets tabs by `(windowId, groupKey)` and makes one `chrome.tabs.group({ tabIds: [...] })` call per group.
- **Serialization and coalescing.** A single promise queue prevents duplicate groups when several tabs open at once. Events arriving while a pass is pending are coalesced into that pass: tab IDs are deduplicated and read in parallel, and a pending full pass absorbs individual tab events. Each pass re-reads the tabs, so it never acts on a stale event snapshot. Without coalescing, restoring 300 tabs queued 300 serial passes and grouping took about 4.9 s.
- **Parallel groups.** Within a pass, groups are created in parallel. Chrome takes about 100 ms per `tabs.group` call in headless mode, so ten groups take about 1.3 s sequentially and 0.4 s in parallel. Buckets sharing a title in the same window stay sequential, so title adoption never creates duplicate groups.
- **Budgets** (measured on an Apple Silicon laptop, headless Chrome for Testing).
  - "Group all" on 300 loaded tabs across 10 hostnames: 370-700 ms measured, of which about 400 ms is Chrome's own API time. Single runs spike above 1 s on a busy machine, so the e2e test takes the median of 3 runs and fails above 2 s. That leaves headroom for shared CI runners while still catching a regression like the 4.9 s seen without coalescing.
  - Unpacked size under 100 KB; currently 72 KB.
    - That is 49 KB of JavaScript (12 KB gzipped), 12 KB of icons and 10 KB of HTML and CSS.
    - JavaScript ships unminified on purpose, so the published code stays readable for audits.

## 6. Grouping behaviour and edge cases

| Case                                              | Behaviour                                                                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Tab navigates to a hostname with a matching rule  | Move it to the group for `(windowId, groupKey)`, creating the group if needed                                              |
| Tab navigates to a hostname with no matching rule | Ungroup it only if it sits in a group TabRules manages                                                                     |
| Groups created by hand                            | Never touched, and their tabs are left in them. Only groups in the managed map are managed                                 |
| A group already has the target title              | Adopted as managed. This recovers groups after a browser restart, since group IDs change. Unnamed groups are never adopted |
| User renames a managed group                      | It stays managed: matching tabs keep joining it. Detecting renames reliably is not possible with the tab groups API        |
| Rules changed                                     | Re-applied to all open tabs automatically                                                                                  |
| Tab or group closed during an operation           | Swallow only the "No tab/group with id" error. Report any other error                                                      |
| Managed group removed but still in the map        | `tabs.group` fails with "No group with id", so drop the entry and create a new group                                       |
| Service worker restart                            | Stateless. The managed map is reloaded from `storage.session`                                                              |
| Tab moved to another window                       | Re-evaluate it in its new window (`tabs.onAttached`)                                                                       |

## 7. Milestones

1. **Scaffold.** Repo, `tsc` build, hardened manifest, ESLint, Prettier, Vitest, CI (lint, test, build, audit, CodeQL).
2. **Core.** Rule model, validation, registry and `hostname` matcher.
   - 100% branch coverage.
   - Edge cases: IP addresses, IPv6, `localhost`, ports, punycode or IDN hostnames, invalid URLs.
3. **Engine.** Service worker, rules cache, grouper with its queue, session map.
4. **UI.** Options page (rules CRUD, JSON import and export) and popup (on/off, rules summary). There is no "Group all now" button: changing the rules or switching grouping back on already re-applies the rules to every open tab, and there is no message passing between pages and the service worker, which keeps the attack surface smaller.
5. **Hardening.** Puppeteer end-to-end tests in headless Chrome for Testing, fully offline: a local HTTP server, with `*.test` hostnames mapped to it.
   - Grouping behaviour from section 6, the options page and the popup.
   - Security: the permissions, the CSP, `fetch` blocked in the service worker and pages, `innerHTML` blocked by Trusted Types, and no API exposed to web pages. `eval` cannot be tested this way, because DevTools evaluation bypasses the CSP; MV3 rejects `unsafe-eval` anyway.
   - The 300-tab performance benchmark.
   - The icons, rendered from `assets/*.svg` with `npm run icons`.
6. **Dogfooding.** One week of daily use.
7. **Publishing.**
   - GitHub: MIT license, README, `PRIVACY.md`, `SECURITY.md`, `CHANGELOG`, tagged release with checksum and provenance.
   - Chrome Web Store: US$5 developer account and listing.
     - Store assets: a 128×128 icon and at least one 1280×800 screenshot.
     - Listing text: a single-purpose statement and a justification for each of the 3 permissions.
