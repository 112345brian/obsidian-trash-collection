import { App, normalizePath, PluginSettingTab, Setting, SettingDefinitionItem } from "obsidian";
import { FolderSuggest, NoteSuggest } from "./FileSuggest";
import type TrashCollectionPlugin from "./plugin";

export type Pass2ActionType = "replace-link" | "add-frontmatter";
export type ConditionMode = "all" | "any";
export type AgeField = "frontmatter" | "ctime" | "mtime";
export type AgeUnit = "minutes" | "hours" | "days";
export type FrontmatterOp = "contains" | "not-contains" | "equals" | "not-equals";

export interface Pass2Action {
  type: Pass2ActionType;
  findLink: string;
  frontmatterKey: string;
}

export interface FrontmatterCondition {
  field: string;        // "any" or a specific frontmatter key like "up"
  op: FrontmatterOp;
  value: string;
}

export interface TrashCollectionSettings {
  // Age
  orphanAge: number;
  orphanAgeUnit: AgeUnit;
  ageField: AgeField;
  ageFrontmatterKey: string;

  // Conditions
  conditionMode: ConditionMode;
  checkOrphan: boolean;
  orphanRequiresNoOutgoing: boolean;
  frontmatterConditions: FrontmatterCondition[];

  // Exclusions
  excludeFolders: string[];
  excludeNotes: string[];
  excludeFrontmatterKeys: string[];
  excludeFrontmatterValues: string[];

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
  conditionMode: "any",
  checkOrphan: true,
  orphanRequiresNoOutgoing: true,
  frontmatterConditions: [],
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

const OP_LABELS: Record<FrontmatterOp, string> = {
  "contains": "contains",
  "not-contains": "doesn't contain",
  "equals": "equals",
  "not-equals": "doesn't equal",
};

export class TrashCollectionSettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: TrashCollectionPlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (typeof value === "string") {
      const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[key];
      value = value.trim() || def;
    }
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
    this.update();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;

    return [
      // ── Detection ──────────────────────────────────────────────────────
      {
        name: "Detection",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        name: "Age field",
        desc: "Which date to use when checking if a note is old enough.",
        control: {
          type: "dropdown" as const,
          key: "ageField",
          options: { ctime: "File created (built-in)", mtime: "File modified (built-in)", frontmatter: "Frontmatter key →" },
        },
      },
      {
        name: "Frontmatter key",
        desc: "The frontmatter key to read the date from (e.g. date-created).",
        visible: () => s.ageField === "frontmatter",
        control: { type: "text" as const, key: "ageFrontmatterKey" },
      },
      {
        name: "Age threshold",
        desc: "Only include notes older than this amount.",
        render: (el: Setting): (() => void) | void => {
          el.addText((t) => {
            t.setValue(String(s.orphanAge)).onChange(async (v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) {
                this.plugin.settings.orphanAge = n;
                await this.plugin.saveSettings();
              }
            });
          }).addDropdown((d) => {
            d.addOption("minutes", "minutes")
              .addOption("hours", "hours")
              .addOption("days", "days")
              .setValue(s.orphanAgeUnit)
              .onChange(async (val) => {
                this.plugin.settings.orphanAgeUnit = val as AgeUnit;
                await this.plugin.saveSettings();
              });
          });
        },
      },
      {
        name: "Condition mode",
        desc: '"Any" flags notes matching at least one condition (OR). "All" requires every enabled condition (AND).',
        control: {
          type: "dropdown" as const,
          key: "conditionMode",
          options: { any: "Any condition (OR)", all: "All conditions (AND)" },
        },
      },
      {
        name: "Orphan check",
        desc: "Flag notes with no incoming links.",
        control: { type: "toggle" as const, key: "checkOrphan" },
      },
      {
        name: "Strict orphan",
        desc: "Also require no outgoing links (ignoring placeholder link targets from conditions below).",
        visible: () => s.checkOrphan,
        control: { type: "toggle" as const, key: "orphanRequiresNoOutgoing" },
      },

      // ── Frontmatter conditions ──────────────────────────────────────────
      {
        name: "Frontmatter conditions",
        desc: 'Flag notes based on frontmatter rules. Use "any" to match any field.',
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        emptyState: "No conditions.",
        items: s.frontmatterConditions.map((c) => ({
          name: `${c.field}  ${OP_LABELS[c.op]}  ${c.value}`,
        })),
        onDelete: (index: number) => {
          this.plugin.settings.frontmatterConditions.splice(index, 1);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add condition",
        render: (el: Setting): (() => void) | void => {
          let field = "any";
          let op: FrontmatterOp = "contains";
          let value = "";
          el.addText((t) => {
            t.setPlaceholder('field (or "any")').setValue("any")
              .onChange((v) => { field = v.trim() || "any"; });
          }).addDropdown((d) => {
            d.addOption("contains", "contains")
              .addOption("not-contains", "doesn't contain")
              .addOption("equals", "equals")
              .addOption("not-equals", "doesn't equal")
              .onChange((v) => { op = v as FrontmatterOp; });
          }).addText((t) => {
            t.setPlaceholder("[[Unique Notes]]").onChange((v) => { value = v.trim(); });
          }).addButton((b) => {
            b.setIcon("plus").onClick(async () => {
              if (!value) return;
              this.plugin.settings.frontmatterConditions.push({ field, op, value });
              await this.plugin.saveSettings();
              this.update();
            });
          });
        },
      },

      // ── Exclusions ─────────────────────────────────────────────────────
      {
        name: "Exclusions",
        render: (el: Setting) => { el.setHeading(); },
      },

      // Folders
      {
        name: "Exclude folders",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        emptyState: "No folders excluded.",
        items: s.excludeFolders.map((f) => ({ name: f })),
        onDelete: (index: number) => {
          this.plugin.settings.excludeFolders.splice(index, 1);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add folder",
        render: (el: Setting): (() => void) | void => {
          let suggest: FolderSuggest | null = null;
          el.addText((t) => {
            t.setPlaceholder("Folder path…");
            suggest = new FolderSuggest(this.app, t.inputEl);
            suggest.onSelect((folder) => {
              const normalized = (folder.path === "/" ? "/" : normalizePath(folder.path)) + "/";
              suggest!.setValue(normalized);
            });
          }).addButton((b) => {
            b.setIcon("plus").onClick(async () => {
              const raw = suggest?.getValue()?.trim() ?? "";
              if (!raw) return;
              const base = normalizePath(raw.endsWith("/") ? raw.slice(0, -1) : raw);
              const normalized = base === "/" ? "/" : base + "/";
              if (this.plugin.settings.excludeFolders.includes(normalized)) return;
              this.plugin.settings.excludeFolders.push(normalized);
              await this.plugin.saveSettings();
              this.update();
            });
          });
          return () => suggest?.close();
        },
      },

      // Notes
      {
        name: "Exclude notes",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        emptyState: "No notes excluded.",
        items: s.excludeNotes.map((n) => ({ name: n })),
        onDelete: (index: number) => {
          this.plugin.settings.excludeNotes.splice(index, 1);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add note",
        render: (el: Setting): (() => void) | void => {
          let suggest: NoteSuggest | null = null;
          el.addText((t) => {
            t.setPlaceholder("Note path…");
            suggest = new NoteSuggest(this.app, t.inputEl);
            suggest.onSelect((file) => { suggest!.setValue(file.path); });
          }).addButton((b) => {
            b.setIcon("plus").onClick(async () => {
              const val = suggest?.getValue()?.trim() ?? "";
              if (!val || this.plugin.settings.excludeNotes.includes(val)) return;
              this.plugin.settings.excludeNotes.push(val);
              await this.plugin.saveSettings();
              this.update();
            });
          });
          return () => suggest?.close();
        },
      },

      // Frontmatter key exclusions
      {
        name: "Exclude by frontmatter key",
        desc: "Skip notes where any of these keys are set to true.",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        emptyState: "No keys.",
        items: s.excludeFrontmatterKeys.map((k) => ({ name: k })),
        onDelete: (index: number) => {
          this.plugin.settings.excludeFrontmatterKeys.splice(index, 1);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add key",
        render: (el: Setting): (() => void) | void => {
          let value = "";
          el.addText((t) => {
            t.setPlaceholder("permanent").onChange((v) => { value = v.trim(); });
          }).addButton((b) => {
            b.setIcon("plus").onClick(async () => {
              if (!value || this.plugin.settings.excludeFrontmatterKeys.includes(value)) return;
              this.plugin.settings.excludeFrontmatterKeys.push(value);
              await this.plugin.saveSettings();
              this.update();
            });
          });
        },
      },

      // Frontmatter value exclusions
      {
        name: "Exclude by frontmatter value",
        desc: "Skip notes where any frontmatter value contains these strings.",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        emptyState: "No values.",
        items: s.excludeFrontmatterValues.map((v) => ({ name: v })),
        onDelete: (index: number) => {
          this.plugin.settings.excludeFrontmatterValues.splice(index, 1);
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add value",
        render: (el: Setting): (() => void) | void => {
          let value = "";
          el.addText((t) => {
            t.setPlaceholder("[[Home]]").onChange((v) => { value = v.trim(); });
          }).addButton((b) => {
            b.setIcon("plus").onClick(async () => {
              if (!value || this.plugin.settings.excludeFrontmatterValues.includes(value)) return;
              this.plugin.settings.excludeFrontmatterValues.push(value);
              await this.plugin.saveSettings();
              this.update();
            });
          });
        },
      },

      // ── Startup notification ────────────────────────────────────────────
      {
        name: "Startup notification",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        name: "Show notification on launch",
        desc: "Pop up a notice when there are notes to review. Disable if you prefer the code block widget.",
        control: { type: "toggle" as const, key: "notifyEnabled" },
      },
      {
        name: "Notify at most every (days)",
        desc: "0 = notify every launch.",
        visible: () => s.notifyEnabled,
        render: (el: Setting): (() => void) | void => {
          el.addText((t) => {
            t.setValue(String(s.notifyIntervalDays)).onChange(async (v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) {
                this.plugin.settings.notifyIntervalDays = n;
                await this.plugin.saveSettings();
              }
            });
          });
        },
      },

      // ── Widget ─────────────────────────────────────────────────────────
      {
        name: "Widget",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        name: "Max items shown",
        desc: 'How many notes to list in the code block widget. 0 = show all. Override per block with "maxItems: 3" in the block body.',
        render: (el: Setting): (() => void) | void => {
          el.addText((t) => {
            t.setValue(String(s.blockMaxItems)).onChange(async (v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n >= 0) {
                this.plugin.settings.blockMaxItems = n;
                await this.plugin.saveSettings();
              }
            });
          });
        },
      },

      // ── Review mode ────────────────────────────────────────────────────
      {
        name: "Review mode",
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        name: "Two-pass review",
        desc: "Pass 1: swipe to trash or keep. Pass 2: categorize kept notes by linking them.",
        control: { type: "toggle" as const, key: "pass2Enabled" },
      },
      {
        name: "Action",
        desc: "What to do with the chosen note for each kept file.",
        visible: () => s.pass2Enabled,
        render: (el: Setting): (() => void) | void => {
          el.addDropdown((d) => {
            d.addOption("replace-link", "Replace a link in the note body")
              .addOption("add-frontmatter", "Set a frontmatter key")
              .setValue(s.pass2Action.type)
              .onChange(async (val) => {
                this.plugin.settings.pass2Action.type = val as Pass2ActionType;
                await this.plugin.saveSettings();
                this.update();
              });
          });
        },
      },
      {
        name: "Link to replace",
        desc: "Wikilink placeholder to swap out, e.g. [[Unique Notes]]",
        visible: () => s.pass2Enabled && s.pass2Action.type === "replace-link",
        render: (el: Setting): (() => void) | void => {
          el.addText((t) => {
            t.setValue(s.pass2Action.findLink).onChange(async (v) => {
              this.plugin.settings.pass2Action.findLink = v.trim();
              await this.plugin.saveSettings();
            });
          });
        },
      },
      {
        name: "Frontmatter key",
        desc: 'Key to set to the chosen wikilink, e.g. "up".',
        visible: () => s.pass2Enabled && s.pass2Action.type === "add-frontmatter",
        render: (el: Setting): (() => void) | void => {
          el.addText((t) => {
            t.setValue(s.pass2Action.frontmatterKey).onChange(async (v) => {
              this.plugin.settings.pass2Action.frontmatterKey = v.trim();
              await this.plugin.saveSettings();
            });
          });
        },
      },

      // Shortcuts
      {
        name: "Shortcuts",
        desc: 'Short aliases for note names in pass 2. e.g. "ref" → "Reference".',
        visible: () => s.pass2Enabled,
        render: (el: Setting) => { el.setHeading(); },
      },
      {
        type: "list" as const,
        visible: () => s.pass2Enabled,
        emptyState: "No shortcuts.",
        items: Object.entries(s.shortcuts).map(([alias, target]) => ({
          name: alias,
          desc: `→ ${target}`,
        })),
        onDelete: (index: number) => {
          const alias = Object.keys(this.plugin.settings.shortcuts)[index];
          if (alias) delete this.plugin.settings.shortcuts[alias];
          this.update();
          void this.plugin.saveSettings();
        },
      },
      {
        name: "Add shortcut",
        visible: () => s.pass2Enabled,
        render: (el: Setting): (() => void) | void => {
          let alias = "";
          let target = "";
          el.addText((t) => { t.setPlaceholder("alias").onChange((v) => { alias = v.trim(); }); })
            .addText((t) => { t.setPlaceholder("note name").onChange((v) => { target = v.trim(); }); })
            .addButton((b) => {
              b.setIcon("plus").onClick(async () => {
                if (!alias || !target) return;
                this.plugin.settings.shortcuts[alias] = target;
                await this.plugin.saveSettings();
                this.update();
              });
            });
        },
      },
    ];
  }
}
