import { Notice, Plugin } from "obsidian";
import { TrashCollectionSettings, TrashCollectionSettingsTab, DEFAULT_SETTINGS } from "./settings";
import { getCandidates } from "./candidates";
import { TriageModal } from "./TriageModal";

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
`;

export default class TrashCollectionPlugin extends Plugin {
  settings: TrashCollectionSettings;

  async onload() {
    await this.loadSettings();

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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
