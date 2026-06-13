# Changelog

## 0.1.0 — 2026-06-13

Initial release.

- Startup notification when orphan notes (or notes matching configured conditions) exceed the configured age threshold
- Configurable notification cooldown (notify at most every N days)
- **Pass 1 — triage**: swipe left to trash, swipe right to keep; arrow keys on desktop
- **Pass 2 — link**: for each kept note, type a note name (with autocomplete) and apply a configured action:
  - Replace a placeholder wikilink in the note body (e.g. swap `[[Unique Notes]]` for a real link)
  - Set a frontmatter key to the chosen wikilink
- Shortcut aliases in pass 2 (e.g. type `ref` → resolves to `[[Reference]]`)
- Condition system: flag notes that are orphans, contain specific wikilinks in frontmatter, or have flagged frontmatter keys; combine with AND / OR
- Age field: use file creation time (default), modification time, or a custom frontmatter key
- Configurable age threshold with minute / hour / day units
- Exclusions: folders (with autocomplete), notes (with autocomplete), frontmatter keys set to true, frontmatter values containing a string
- Ribbon icon and command palette entry to open triage manually
- CSS injected at load time so it works regardless of theme
