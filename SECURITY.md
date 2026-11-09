# Security policy

## Supported versions

Only the latest release receives security fixes.

## Reporting a vulnerability

Please do not open a public issue. Report vulnerabilities privately through
GitHub: open the **Security** tab of this repository, then **Report a
vulnerability**.

Include the affected version, the steps to reproduce and the impact you
observed. You should receive an answer within 7 days.

## Security model

- Permissions are limited to `tabs`, `tabGroups` and `storage`. There are no
  host permissions and no content scripts.
- The content security policy blocks every network request
  (`connect-src 'none'`), inline scripts, `eval` and HTML injection (Trusted
  Types).
- Web pages and other extensions cannot message the extension
  (`externally_connectable` is empty).
- Rules are validated against a strict schema before they are saved or
  imported.
- Regular expressions run on a linear-time engine, never on the backtracking
  `RegExp` engine, so a pattern cannot freeze the extension (no ReDoS).
- The extension has no runtime dependencies. Development dependencies are
  pinned and installed without install scripts.
- Releases are built in GitHub Actions from a tagged commit, with a SHA-256
  checksum and a build provenance attestation. Anyone can rebuild them and
  compare. See the README.
