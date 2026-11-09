# Privacy policy

_Last updated: 2026-11-09_

TabRules collects no data. It sends nothing anywhere.

## What the extension accesses

- **Tab addresses.** To decide which group a tab belongs to, TabRules reads the
  address of your tabs. Only the hostname, such as `github.com`, is used. It is
  compared with your rules in memory and is never stored, logged or sent.
- **Your rules.** The rules you create are saved with `chrome.storage.local`, on
  your device only. They are not synchronized with your Google account.
- **Groups it created.** To know which groups it manages, TabRules keeps their
  numeric identifiers in `chrome.storage.session`. That storage lives in memory
  and is erased when the browser closes.

## What the extension never does

- It makes no network requests. Its content security policy
  (`connect-src 'none'`) blocks them, even in case of a bug.
- It has no analytics, telemetry, advertising or third-party code.
- It does not read page contents. It has no content scripts and no access to
  websites.
- It does not sell, share or transfer any data, because it has none.

## Permissions

| Permission  | Why it is needed                                     |
| ----------- | ---------------------------------------------------- |
| `tabs`      | Read tab addresses to match them against your rules. |
| `tabGroups` | Create, name and color tab groups.                   |
| `storage`   | Save your rules on your device.                      |

## Contact

Questions about this policy can be asked in the project's GitHub issues.
