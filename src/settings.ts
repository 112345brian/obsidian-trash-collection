import { App, PluginSettingTab, Setting } from "obsidian";
import { FolderSuggest, NoteSuggest } from "./FileSuggest";
import type TrashCollectionPlugin from "./plugin";

export type Pass2ActionType = "replace-link" | "add-frontmatter";
export type ConditionMode = "all" | "any";
export type AgeField = "frontmatter" | "ctime" | "mtime";
export type AgeUnit = "minutes" | "hours" | "days";

export interface Pass2Action {
  type: Pass2ActionType;
  findLink: string;
  frontmatterKey: string;
}

export interface TrashCollectionSettings {
  // Age
  orphanAge: number;
  orphanAgeUnit: AgeUnit;
  ageField: AgeField;
  ageFrontmatterKey: string;

  // Conditions
  conditionMode: ConditionMode;          // "all" = AND, "any" = OR
  checkOrphan: boolean;
  frontmatterContainsLinks: string[];    // flag if any frontmatter value contains these wikilinks
  flaggedFrontmatterKeys: string[];      // flag if these keys are set to true

  // Exclusions
  excludeFolders: string[];          // path prefixes to skip, e.g. "Templates/, ARCHIVE/"
  excludeNotes: string[];            // exact note paths to skip
  excludeFrontmatterKeys: string[];  // skip if note has any of these keys set to true
  excludeFrontmatterValues: string[];// skip if any frontmatter value contains these strings

  // Notification
  notifyEnabled: boolean;
  lastNotified: number;
  notifyIntervalDays: number;

  // Widget
  blockMaxItems: number;

  // Pass 2
  pass2Enabled: boolean;
  pass2Action: Pass2Action;
  shortcuts: Record<string, string>;
}

export const DEFAULT_SETTINGS: TrashCollectionSettings = {
  orphanAge: 7,
  orphanAgeUnit: "days",
  ageField: "ctime",
  ageFrontmatterKey: "date-created",
  conditionMode: "all",
  checkOrphan: true,
  frontmatterContainsLinks: [],
  flaggedFrontmatterKeys: [],
  excludeFolders: [],
  excludeNotes: [],
  excludeFrontmatterKeys: [],
  excludeFrontmatterValues: [],
  notifyEnabled: true,
  lastNotified: 0,
  blockMaxItems: 0,
  notifyIntervalDays: 1,
  pass2Enabled: true,
  pass2Action: {
    type: "replace-link",
    findLink: "[[Unique Notes]]",
    frontmatterKey: "up",
  },
  shortcuts: {},
};

export class TrashCollectionSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: TrashCollectionPlugin) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h3", { text: "Detection" });

    new Setting(containerEl)
      .setName("Age field")
      .setDesc("Which date to use when checking if a note is old enough.")
      .addDropdown((d) =>
        d
          .addOption("ctime", "File created (built-in)")
          .addOption("mtime", "File modified (built-in)")
          .addOption("frontmatter", "Frontmatter key →")
          .setValue(this.plugin.settings.ageField)
          .onChange(async (val) => {
            this.plugin.settings.ageField = val as AgeField;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.ageField === "frontmatter") {
      new Setting(containerEl)
        .setName("Frontmatter key")
        .setDesc("The frontmatter key to read the date from (e.g. date-created, created-at).")
        .addText((t) =>
          t.setValue(this.plugin.settings.ageFrontmatterKey).onChange(async (v) => {
            this.plugin.settings.ageFrontmatterKey = v.trim();
            await this.plugin.saveSettings();
          })
        );
    }

    new Setting(containerEl)
      .setName("Age threshold")
      .setDesc("Only include notes older than this amount.")
      .addText((t) =>
        t.setValue(String(this.plugin.settings.orphanAge)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) { this.plugin.settings.orphanAge = n; await this.plugin.saveSettings(); }
        })
      )
      .addDropdown((d) =>
        d
          .addOption("minutes", "minutes")
          .addOption("hours", "hours")
          .addOption("days", "days")
          .setValue(this.plugin.settings.orphanAgeUnit)
          .onChange(async (val) => {
            this.plugin.settings.orphanAgeUnit = val as AgeUnit;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Condition mode")
      .setDesc('"Any" flags notes matching at least one condition (OR). "All" requires every enabled condition (AND).')
      .addDropdown((d) =>
        d
          .addOption("any", "Any condition (OR)")
          .addOption("all", "All conditions (AND)")
          .setValue(this.plugin.settings.conditionMode)
          .onChange(async (val) => {
            this.plugin.settings.conditionMode = val as ConditionMode;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Orphan check")
      .setDesc("Include notes with no incoming links.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.checkOrphan).onChange(async (val) => {
          this.plugin.settings.checkOrphan = val;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Frontmatter contains links")
      .setDesc('Comma-separated wikilinks. Flag notes where any frontmatter value contains one of these (e.g. "[[Unique Notes]]").')
      .addText((t) =>
        t
          .setValue(this.plugin.settings.frontmatterContainsLinks.join(", "))
          .onChange(async (v) => {
            this.plugin.settings.frontmatterContainsLinks = v.split(",").map((s) => s.trim()).filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Flagged frontmatter keys")
      .setDesc('Comma-separated keys. Flag notes where any of these keys are set to true (e.g. "draft, stale").')
      .addText((t) =>
        t.setValue(this.plugin.settings.flaggedFrontmatterKeys.join(", ")).onChange(async (v) => {
          this.plugin.settings.flaggedFrontmatterKeys = v.split(",").map((s) => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Exclusions" });

    // Exclude folders
    containerEl.createEl("h4", { text: "Exclude folders" });
    for (const folder of this.plugin.settings.excludeFolders) {
      new Setting(containerEl).setName(folder).addButton((b) =>
        b.setIcon("x").onClick(async () => {
          this.plugin.settings.excludeFolders = this.plugin.settings.excludeFolders.filter((f) => f !== folder);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    let selectedFolderPath = "";
    let folderSuggest: FolderSuggest | null = null;
    new Setting(containerEl)
      .setName("Add folder")
      .addText((text) => {
        text.setPlaceholder("Folder path…");
        folderSuggest = new FolderSuggest(this.app, text.inputEl);
        folderSuggest.onSelect((folder) => {
          const path = folder.path === "/" ? "/" : folder.path + "/";
          selectedFolderPath = path;
          folderSuggest!.setValue(path);
        });
      })
      .addButton((b) =>
        b.setIcon("plus").onClick(async () => {
          const raw = selectedFolderPath || folderSuggest?.getValue()?.trim() || "";
          selectedFolderPath = "";
          if (!raw) return;
          const val = raw.endsWith("/") ? raw : raw + "/";
          if (this.plugin.settings.excludeFolders.includes(val)) return;
          this.plugin.settings.excludeFolders.push(val);
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // Exclude notes
    containerEl.createEl("h4", { text: "Exclude notes" });
    for (const note of this.plugin.settings.excludeNotes) {
      new Setting(containerEl).setName(note).addButton((b) =>
        b.setIcon("x").onClick(async () => {
          this.plugin.settings.excludeNotes = this.plugin.settings.excludeNotes.filter((n) => n !== note);
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
    let selectedNotePath = "";
    let noteSuggest: NoteSuggest | null = null;
    new Setting(containerEl)
      .setName("Add note")
      .addText((text) => {
        text.setPlaceholder("Note path…");
        noteSuggest = new NoteSuggest(this.app, text.inputEl);
        noteSuggest.onSelect((file) => {
          selectedNotePath = file.path;
          noteSuggest!.setValue(file.path);
        });
      })
      .addButton((b) =>
        b.setIcon("plus").onClick(async () => {
          const val = selectedNotePath || noteSuggest?.getValue()?.trim() || "";
          selectedNotePath = "";
          if (!val || this.plugin.settings.excludeNotes.includes(val)) return;
          this.plugin.settings.excludeNotes.push(val);
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName("Exclude by frontmatter key")
      .setDesc("Skip notes where any of these keys are set to true (e.g. permanent, keep).")
      .addText((t) =>
        t.setValue(this.plugin.settings.excludeFrontmatterKeys.join(", ")).onChange(async (v) => {
          this.plugin.settings.excludeFrontmatterKeys = v.split(",").map((s) => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Exclude by frontmatter value")
      .setDesc("Skip notes where any frontmatter value contains these strings (e.g. [[Home]], [[MOC]]).")
      .addText((t) =>
        t.setValue(this.plugin.settings.excludeFrontmatterValues.join(", ")).onChange(async (v) => {
          this.plugin.settings.excludeFrontmatterValues = v.split(",").map((s) => s.trim()).filter(Boolean);
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Startup notification" });

    new Setting(containerEl)
      .setName("Show notification on launch")
      .setDesc("Pop up a notice when there are notes to review. Disable if you prefer to use the code block widget instead.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.notifyEnabled).onChange(async (val) => {
          this.plugin.settings.notifyEnabled = val;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.notifyEnabled) {
      new Setting(containerEl)
        .setName("Notify at most every (days)")
        .setDesc("0 = notify every launch.")
        .addText((t) =>
          t.setValue(String(this.plugin.settings.notifyIntervalDays)).onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) { this.plugin.settings.notifyIntervalDays = n; await this.plugin.saveSettings(); }
          })
        );
    }

    containerEl.createEl("h3", { text: "Widget" });

    new Setting(containerEl)
      .setName("Max items shown")
      .setDesc('How many notes to list in the code block widget. 0 = show all. Override per block with "maxItems: 3" in the block body.')
      .addText((t) =>
        t.setValue(String(this.plugin.settings.blockMaxItems)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n >= 0) { this.plugin.settings.blockMaxItems = n; await this.plugin.saveSettings(); }
        })
      );

    containerEl.createEl("h3", { text: "Review mode" });

    new Setting(containerEl)
      .setName("Two-pass review")
      .setDesc("Pass 1: swipe to trash or keep. Pass 2: categorize kept notes by linking them. Disable for single-pass delete-only review.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.pass2Enabled).onChange(async (val) => {
          this.plugin.settings.pass2Enabled = val;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    if (this.plugin.settings.pass2Enabled) {
      new Setting(containerEl)
        .setName("Action")
        .setDesc("What to do with the chosen note for each kept file.")
        .addDropdown((d) =>
          d
            .addOption("replace-link", "Replace a link in the note body")
            .addOption("add-frontmatter", "Set a frontmatter key")
            .setValue(this.plugin.settings.pass2Action.type)
            .onChange(async (val) => {
              this.plugin.settings.pass2Action.type = val as Pass2ActionType;
              await this.plugin.saveSettings();
              this.display();
            })
        );

      if (this.plugin.settings.pass2Action.type === "replace-link") {
        new Setting(containerEl)
          .setName("Link to replace")
          .setDesc('Wikilink placeholder to swap out, e.g. [[Unique Notes]]')
          .addText((t) =>
            t.setValue(this.plugin.settings.pass2Action.findLink).onChange(async (v) => {
              this.plugin.settings.pass2Action.findLink = v.trim();
              await this.plugin.saveSettings();
            })
          );
      } else {
        new Setting(containerEl)
          .setName("Frontmatter key")
          .setDesc('Key to set to the chosen wikilink, e.g. "up".')
          .addText((t) =>
            t.setValue(this.plugin.settings.pass2Action.frontmatterKey).onChange(async (v) => {
              this.plugin.settings.pass2Action.frontmatterKey = v.trim();
              await this.plugin.saveSettings();
            })
          );
      }

      containerEl.createEl("h4", { text: "Shortcuts" });
      containerEl.createEl("p", {
        text: 'Short aliases for note names in pass 2. e.g. "ref" → "Reference".',
        cls: "setting-item-description",
      });

      for (const [alias, target] of Object.entries(this.plugin.settings.shortcuts)) {
        new Setting(containerEl)
          .setName(alias)
          .setDesc(`→ ${target}`)
          .addButton((b) =>
            b.setIcon("trash").setWarning().onClick(async () => {
              delete this.plugin.settings.shortcuts[alias];
              await this.plugin.saveSettings();
              this.display();
            })
          );
      }

      let newAlias = "";
      let newTarget = "";
      const addSetting = new Setting(containerEl).setName("Add shortcut");
      addSetting.addText((t) => t.setPlaceholder("alias").onChange((v) => { newAlias = v.trim(); }));
      addSetting.addText((t) => t.setPlaceholder("note name").onChange((v) => { newTarget = v.trim(); }));
      addSetting.addButton((b) =>
        b.setIcon("plus").onClick(async () => {
          if (!newAlias || !newTarget) return;
          this.plugin.settings.shortcuts[newAlias] = newTarget;
          await this.plugin.saveSettings();
          this.display();
        })
      );
    }
  }
}
