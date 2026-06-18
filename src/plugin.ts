import { Notice, Plugin } from "obsidian";
import { TrashCollectionSettings, TrashCollectionSettingsTab, DEFAULT_SETTINGS } from "./settings";
import { getCandidates } from "./candidates";
import { TriageModal } from "./TriageModal";
import { TrashCollectionBlock } from "./TrashCollectionBlock";
import { type TrashCollectionApi, API_VERSION } from "./api";

const STYLES = `
.trash-collection-modal {
  width: min(520px, 95vw);
}
.tc-card {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-l);
  padding: 14px 16px;
  background: var(--background-secondary);
  margin-bottom: 16px;
  touch-action: pan-y;
  user-select: none;
}
.tc-card-header {
  margin-bottom: 10px;
}
.tc-card-title {
  font-size: 1.1em;
  font-weight: 700;
  color: var(--text-normal);
  margin-bottom: 3px;
}
.tc-card-title--link {
  cursor: pointer;
}
.tc-card-title--link:hover {
  color: var(--text-accent);
  text-decoration: underline;
}
.tc-card-fm {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-bottom: 10px;
  padding: 6px 8px;
  background: var(--background-primary-alt);
  border-radius: var(--radius-s);
  border: 1px solid var(--background-modifier-border);
}
.tc-fm-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 0.78em;
  min-width: 0;
}
.tc-fm-key {
  color: var(--text-faint);
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}
.tc-fm-key::after {
  content: ":";
}
.tc-fm-val {
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}
.tc-card-meta {
  font-size: 0.78em;
  color: var(--text-faint);
}
.tc-meta-sep {
  margin: 0 4px;
}
.tc-card-preview {
  overflow: hidden;
  border-left: 2px solid var(--background-modifier-border);
  padding-left: 10px;
}
.tc-card-preview > *:first-child { margin-top: 0 !important; }
.tc-card-preview > *:last-child { margin-bottom: 0 !important; }
.tc-card-preview p, .tc-card-preview li, .tc-card-preview span {
  font-size: 0.83em;
  color: var(--text-muted);
  line-height: 1.6;
}
.tc-actions {
  display: flex;
  gap: 8px;
  justify-content: stretch;
}
.tc-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: var(--radius-m);
  border: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85em;
  font-family: inherit;
  font-weight: 500;
  transition: background 0.1s, color 0.1s;
}
.tc-btn-trash:hover { background: var(--background-modifier-error); color: var(--text-error); border-color: var(--text-error); }
.tc-btn-keep:hover  { background: var(--background-modifier-success, #1a3a1a); color: var(--color-green); border-color: var(--color-green); }
.tc-btn-open:hover  { background: var(--background-modifier-hover); color: var(--text-normal); }
.tc-pass2-action {
  margin-bottom: 14px;
}
.tc-pass2-label {
  font-size: 0.82em;
  color: var(--text-muted);
  margin-bottom: 6px;
}
.tc-pass2-input {
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-m);
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.9em;
  font-family: inherit;
}
.tc-pass2-input:focus {
  outline: none;
  border-color: var(--text-accent);
}
.tc-settings-input {
  flex: 1;
  padding: 4px 8px;
  border-radius: var(--radius-s);
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  font-size: 0.9em;
  font-family: inherit;
  min-width: 0;
}
.tc-settings-input:focus {
  outline: none;
  border-color: var(--text-accent);
}
.tc-suggest-path {
  color: var(--text-faint);
  font-size: 0.85em;
}
.tc-swipe-hint {
  text-align: center;
  font-size: 0.72em;
  color: var(--text-faint);
  margin-top: 12px;
}
.tc-empty {
  color: var(--text-muted);
  font-style: italic;
}

/* ── inline code block widget ───────────────────────────────────────────── */
.tc-block {
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-l);
  overflow: hidden;
}
.tc-block-empty {
  padding: 12px 14px;
  font-size: 0.85em;
  color: var(--text-faint);
  font-style: italic;
}
.tc-block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--background-modifier-border);
}
.tc-block-count {
  font-size: 0.82em;
  color: var(--text-muted);
  font-weight: 600;
}
.tc-block-review-btn {
  font-size: 0.78em;
  padding: 3px 10px;
  border-radius: var(--radius-m);
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
  cursor: pointer;
  font-family: inherit;
}
.tc-block-review-btn:hover {
  background: var(--background-modifier-hover);
}
.tc-block-list {}
.tc-block-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--background-modifier-border);
}
.tc-block-row:last-child {
  border-bottom: none;
}
.tc-block-row-info {
  flex: 1;
  min-width: 0;
}
.tc-block-row-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-normal);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tc-block-row-title:hover {
  color: var(--text-accent);
  text-decoration: underline;
}
.tc-block-row-meta {
  font-size: 0.75em;
  color: var(--text-faint);
}
.tc-block-meta-sep {
  margin: 0 3px;
}
.tc-block-row-btns {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}
.tc-block-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--radius-s);
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.78em;
  font-family: inherit;
}
.tc-block-btn svg { width: 12px; height: 12px; }
.tc-block-btn-cat:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}
.tc-block-btn-del:hover {
  background: var(--background-modifier-error);
  color: var(--text-error);
  border-color: var(--text-error);
}
.tc-block-overflow {
  padding: 6px 14px;
  font-size: 0.75em;
  color: var(--text-faint);
  font-style: italic;
  border-top: 1px solid var(--background-modifier-border);
}
`;

export default class TrashCollectionPlugin extends Plugin {
  settings: TrashCollectionSettings;
  api: TrashCollectionApi;

  async onload() {
    await this.loadSettings();

    this.api = {
      version: API_VERSION,
      getCandidates: () => getCandidates(this.app, this.settings),
      openTriage: () => this.openTriage(),
    };

    const styleEl = document.createElement("style");
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);
    this.register(() => styleEl.remove());

    this.addSettingTab(new TrashCollectionSettingsTab(this.app, this));

    this.addRibbonIcon("trash", "Trash collection", () => this.openTriage());

    this.addCommand({
      id: "open-triage",
      name: "Review orphan notes",
      callback: () => this.openTriage(),
    });

    this.registerMarkdownCodeBlockProcessor("trash-collection", (source, el, ctx) => {
      const block = new TrashCollectionBlock(this.app, () => this.settings, source, el, ctx);
      ctx.addChild(block);
    });

    // Check on startup whether to notify
    this.app.workspace.onLayoutReady(() => this.maybeNotify());
  }

  async openTriage() {
    const candidates = getCandidates(this.app, this.settings);
    if (candidates.length === 0) {
      new Notice("No orphan notes to review.");
      return;
    }
    new TriageModal(this.app, candidates, this.settings).open();
  }

  async maybeNotify() {
    if (!this.settings.notifyEnabled) return;
    const { lastNotified, notifyIntervalDays, orphanAge, orphanAgeUnit } = this.settings;
    const intervalMs = notifyIntervalDays * 86_400_000;
    if (Date.now() - lastNotified < intervalMs) return;

    const candidates = getCandidates(this.app, this.settings);
    if (candidates.length === 0) return;

    this.settings.lastNotified = Date.now();
    await this.saveSettings();

    new Notice(
      `${candidates.length} orphan note${candidates.length === 1 ? "" : "s"} older than ${orphanAge} ${orphanAgeUnit} — tap to review.`,
      8000
    ).noticeEl.addEventListener("click", () => this.openTriage());
  }

  async loadSettings() {
    const data = await this.loadData() ?? {};

    // migrate frontmatterContainsLinks: string[] → frontmatterConditions
    // Reset conditionMode to "any": the old check was OR-combined into one boolean, so
    // expanding it into N conditions must use "any" to preserve the original semantics.
    if (Array.isArray(data.frontmatterContainsLinks) && !data.frontmatterConditions) {
      data.frontmatterConditions = data.frontmatterContainsLinks.map((link: string) => ({ field: "any", op: "contains", value: link }));
      delete data.frontmatterContainsLinks;
      data.conditionMode = "any";
    }

    // migrate frontmatterLinkRules: {field, link, negate}[] → frontmatterConditions
    if (Array.isArray(data.frontmatterLinkRules)) {
      const existing: unknown[] = data.frontmatterConditions ?? [];
      data.frontmatterConditions = [
        ...existing,
        ...data.frontmatterLinkRules.map((r: { field: string; link: string; negate: boolean }) => ({
          field: r.field,
          op: r.negate ? "not-contains" : "contains",
          value: r.link,
        })),
      ];
      delete data.frontmatterLinkRules;
    }

    // migrate flaggedFrontmatterKeys: string[] → frontmatterConditions
    if (Array.isArray(data.flaggedFrontmatterKeys) && data.flaggedFrontmatterKeys.length > 0) {
      const existing: unknown[] = data.frontmatterConditions ?? [];
      data.frontmatterConditions = [
        ...existing,
        ...data.flaggedFrontmatterKeys.map((key: string) => ({ field: key, op: "equals", value: "true" })),
      ];
      delete data.flaggedFrontmatterKeys;
    }

    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings() {
    await this.saveData(this.settings);
    document.dispatchEvent(new CustomEvent("trash-collection:settings-changed"));
  }
}
