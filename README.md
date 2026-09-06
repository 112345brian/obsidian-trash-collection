# Obsidian Trash Collection

A triage plugin for Obsidian that surfaces notes that have gone stale — orphans, uncategorized drafts, or anything matching your own frontmatter rules — and lets you delete or categorize them in a single pass.

## What it does

Trash Collection periodically scans your vault for notes that meet configurable conditions (no incoming links, a placeholder `up` value, a flagged frontmatter key, etc.) and shows them to you for review. You swipe or click to trash each one or keep it; kept notes can optionally go through a second pass where you link them to a parent note.

## Installation

Install via **Community Plugins** in Obsidian settings. Search for "Trash Collection."

Manual install: copy `main.js` and `manifest.json` into `.obsidian/plugins/obsidian-trash-collection/` and enable the plugin.

## Usage

### Opening the triage modal

- **Ribbon icon** (trash can) — opens the review modal
- **Command palette** → "Trash collection: Review orphan notes"
- **Startup notification** — optional notice on launch when candidates exist; click it to open triage

### Code block widget

Embed a live candidate list in any note:

````
```trash-collection
```
````

The widget lists all current candidates with Delete and Categorize buttons. It updates automatically when settings change or a note is deleted.

Override the max items per block:

````
```trash-collection
maxItems: 5
```
````

### Review modal (Pass 1)

Each card shows the note name, age, frontmatter properties, and a body preview. Swipe left / press **←** to trash, swipe right / press **→** to keep. Click the title to open the note without closing the modal.

### Categorize (Pass 2)

When **Two-pass review** is enabled, kept notes proceed to a second pass where you type a note name and the plugin either:

- **Replaces a link** in the note body — swaps a placeholder wikilink (e.g. `[[Unique Notes]]`) with the note you choose
- **Sets a frontmatter key** — writes the chosen note as the value of a key (e.g. `up`)

Type a shortcut alias (configured in settings) to quickly resolve common parent notes without typing the full name.

## Configuration

### Detection

| Setting | Description |
|---|---|
| Age field | Which date to use: file created, file modified, or a frontmatter key |
| Age threshold | Only flag notes older than this (minutes / hours / days) |
| Combine groups | **Any (OR)** — flag if any group (or the orphan check) matches. **All (AND)** — require every group and the orphan check. |
| Orphan check | Flag notes with no incoming wikilinks |
| Strict orphan | Require no outgoing links either (ignoring placeholder link targets). On by default. |
| Frontmatter conditions | One or more **condition groups** (see below) |

#### Frontmatter conditions

Conditions are organized into **groups**. Each group has its own match mode — **Match any (OR)** or **Match all (AND)** — and the groups are then combined by the top-level **Combine groups** setting. This two-level structure lets you mix OR and AND in a single rule.

Each condition inside a group has three parts:

- **Field** — a frontmatter key to check (e.g. `up`, `status`) or `any` to check all fields
- **Operator** — `contains`, `doesn't contain`, `equals`, `doesn't equal`, `is filled in`, `is empty`
- **Value** — the string to match (e.g. `[[Unique Notes]]`, `draft`, `true`). Ignored for `is filled in` / `is empty`, which only test whether the field has a value.

**Example** — treat a note as trash if it's uncategorized *or* still holds a placeholder link. Set **Combine groups: Any (OR)** and add two groups:

- **Group 1 — Match all (AND):** `instance-of is empty` · `part-of is empty`
- **Group 2 — Match any (OR):** `instance-of contains [[Unique Notes]]` · `part-of contains [[Unique Notes]]`

A note is flagged when *both* `instance-of` and `part-of` are empty, **or** when *either* one still points at `[[Unique Notes]]`.

The `contains` conditions' link targets are also used by strict orphan mode to identify "placeholder" outgoing links that don't count as real connections.

### Exclusions

| Setting | Description |
|---|---|
| Exclude folders | Skip all notes under these folder paths |
| Exclude notes | Skip specific notes by path |
| Exclude by frontmatter key | Skip notes where any of these keys is set to `true` |
| Exclude by frontmatter value | Skip notes where any frontmatter value contains these strings |

### Widget

**Max items shown** — how many notes the code block widget shows globally. 0 = show all. Override per block with `maxItems: N` in the block body.

### Review mode

**Two-pass review** — enable to add the categorize step after triage. Disable for delete-only review.

**Action** (when two-pass is on):
- **Replace a link in the note body** — specify the placeholder wikilink to swap out
- **Set a frontmatter key** — specify the key to write the chosen note into

**Shortcuts** — short aliases for common parent note names used in pass 2. For example, alias `ref` → `Reference` so typing `ref` in the pass 2 input resolves to `[[Reference]]`.

## Public API

Other plugins can read the current candidate list without opening the triage modal:

```ts
import { getTrashCollectionApi } from "obsidian-trash-collection";

const api = getTrashCollectionApi(app);
if (api) {
  const candidates: TFile[] = api.getCandidates();
}
```

`getTrashCollectionApi` returns `null` if the plugin is not loaded or the API version doesn't match. The current `API_VERSION` is exported for version-checking.

## Releasing

User-visible changes include a [Changeset](.changeset/README.md). Before a release, run `npx changeset status`, then `npx changeset version`; commit the generated version and changelog changes and create an annotated version tag.

## License

GPL-3.0. See [LICENSE](LICENSE).
