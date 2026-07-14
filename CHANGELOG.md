# Changelog

## Unreleased

### Condition groups & presence operators

- **Condition groups** — frontmatter conditions are now organized into groups. Each group has its own match mode (**any** / **all**), and the groups are combined by the top-level **Combine groups** setting (formerly "Condition mode"). This lets a single rule mix OR and AND — e.g. flag a note when it's *uncategorized* (`instance-of` empty AND `part-of` empty) **OR** *still holds a placeholder* (`instance-of` OR `part-of` contains `[[Unique Notes]]`). Existing flat conditions migrate automatically into one group that preserves the old behavior.
- **New operators** `is filled in` and `is empty` — test whether a field has a value at all, independent of what that value is. Empty strings, empty arrays, and absent keys count as empty.

## 0.3.0 — 2026-06-18

### Condition system overhaul

- **Frontmatter conditions** replace the old "Frontmatter contains links" and "Flagged frontmatter keys" settings. Each condition is a field / operator / value rule. Field can be a specific key (e.g. `up`) or `any` to match all fields. Operators: `contains`, `doesn't contain`, `equals`, `doesn't equal`. Old settings migrate automatically on first load.
- **Condition mode default changed to OR** — notes matching any one condition are now flagged by default. Previously defaulted to AND (all conditions required). Matches the expected use case of "orphan OR has placeholder link."
- **Strict orphan mode** (on by default) — a note is only considered an orphan if it has no incoming links *and* no meaningful outgoing links. "Meaningful" means links other than the targets of your `contains` conditions (e.g. `[[Unique Notes]]` is ignored when counting outgoing links). Toggle off to revert to incoming-links-only orphan detection.

### Settings UI

- All list-based settings (exclusions, conditions, shortcuts) are now proper add/remove rows instead of comma-separated text fields.

### Widget

- Code block widget now refreshes immediately when settings change — adding an exclusion or editing a condition is reflected without reloading the note.

### Bug fixes

- Widget no longer shows stale results after settings are changed mid-session.
- Strict orphan detection now counts frontmatter wikilinks (such as `up`) as outgoing links, so categorized notes are not flagged only because their body has no links.
- Pass 2 now preserves list-shaped frontmatter fields and repairs malformed list blocks created by older versions.

## 0.2.0 — 2026-06-13

### Triage modal

- Clicking a note title opens it in the workspace (modal stays open)
- Frontmatter properties displayed in each card — shows all keys/values, arrays joined with commas
- Frontmatter and body preview factored into a shared `renderNotePreview` helper used by both passes

### Code block widget

- New `trash-collection` fenced code block: lists flagged notes inline with Delete and Categorize buttons
- Completely hidden when there are no candidates — no empty state shown
- Delete button trashes the note immediately and refreshes the widget
- Categorize button opens the full triage modal
- Configurable max items shown: global "Max items shown" setting (0 = all, default) overridable per block with `maxItems: 3` in the block body
- Overflow line shows `+N more` when capped

### Settings

- **Show notification on launch** toggle — disable if you prefer using the code block widget; when off the "notify every N days" sub-setting is hidden
- **Two-pass review** toggle (clearer rename of "Enable pass 2") — single-pass keeps only the delete/keep swipe; two-pass adds the categorize step; Categorize button in the widget only appears when enabled
- **Widget** section with "Max items shown" control

### Public API

- New `src/api.ts` exposes `TrashCollectionApi` interface, `API_VERSION` constant, and `getTrashCollectionApi(app)` safe accessor
- Consuming plugins (e.g. Continue Note) call `getTrashCollectionApi(app)?.getCandidates()` — returns null if the plugin isn't loaded or the version doesn't match

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
