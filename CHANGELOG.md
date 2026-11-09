# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-09

### Added

- Automatic tab grouping driven by user-defined rules:
  - exact hostname rules, such as `github.com`;
  - regular expression rules tested against the hostname, such as
    `(^|\.)google\.com$`;
  - a `*` rule that creates one group per hostname.
- Rule priority: rules are checked from top to bottom and the first match
  wins. Rules can be reordered from the options page.
- Group title and color per rule.
- Options page to add, edit, enable, disable, reorder, import and export rules.
- Popup with a global on/off switch.
- Groups created by hand are never modified.
- Linear-time regular expression engine, so no pattern can freeze the
  extension.
- Reproducible release package with a SHA-256 checksum and build provenance
  attestation.

### Security

- Permissions limited to `tabs`, `tabGroups` and `storage`.
- No network access, enforced by the content security policy, and no data
  collection.
- No runtime dependencies.
