import { App, MarkdownRenderChild, TFile, setIcon } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";
import type { TrashCollectionSettings } from "./settings";
import { getCandidates, getAge } from "./candidates";
import { TriageModal } from "./TriageModal";

function parseBlockMax(source: string): number {
  const m = source.match(/maxItems:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : -1; // -1 = not set
}

export class TrashCollectionBlock extends MarkdownRenderChild {
  constructor(
    private app: App,
    private getSettings: () => TrashCollectionSettings,
    private source: string,
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext
  ) {
    super(el);
  }

  onload() {
    this.render();
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { debounceTimer = null; this.render(); }, 150);
    };
    document.addEventListener("trash-collection:settings-changed", handler);
    this.register(() => {
      document.removeEventListener("trash-collection:settings-changed", handler);
      if (debounceTimer !== null) clearTimeout(debounceTimer);
    });
  }

  private render() {
    this.containerEl.empty();
    const settings = this.getSettings();
    const candidates = getCandidates(this.app, settings);

    // Totally hidden when nothing to show
    if (candidates.length === 0) return;

    const blockMax = parseBlockMax(this.source);
    const effectiveMax = blockMax >= 0 ? blockMax : settings.blockMaxItems;
    const shown = effectiveMax > 0 ? candidates.slice(0, effectiveMax) : candidates;
    const overflow = candidates.length - shown.length;

    const root = this.containerEl.createDiv({ cls: "tc-block" });

    const header = root.createDiv({ cls: "tc-block-header" });
    header.createSpan({
      cls: "tc-block-count",
      text: `${candidates.length} note${candidates.length === 1 ? "" : "s"} to review`,
    });
    const reviewBtn = header.createEl("button", { cls: "tc-block-review-btn" });
    reviewBtn.textContent = "Review all";
    reviewBtn.addEventListener("click", () => {
      new TriageModal(this.app, candidates, settings).open();
    });

    const list = root.createDiv({ cls: "tc-block-list" });
    for (const file of shown) {
      this.renderRow(list, file, candidates, settings);
    }

    if (overflow > 0) {
      list.createDiv({
        cls: "tc-block-overflow",
        text: `+${overflow} more — click "Review all" to see everything`,
      });
    }
  }

  private renderRow(
    list: HTMLElement,
    file: TFile,
    allCandidates: TFile[],
    settings: TrashCollectionSettings
  ) {
    const row = list.createDiv({ cls: "tc-block-row" });

    const info = row.createDiv({ cls: "tc-block-row-info" });
    const title = info.createDiv({ cls: "tc-block-row-title" });
    title.textContent = file.basename;
    title.addEventListener("click", () => {
      this.app.workspace.openLinkText(file.path, "", false);
    });

    const meta = info.createDiv({ cls: "tc-block-row-meta" });
    const ageDays = Math.floor(getAge(this.app, file, settings) / 86_400_000);
    meta.createSpan({ text: ageDays < 1 ? "today" : `${ageDays}d ago` });
    if (file.parent?.name && file.parent.name !== "/" && file.parent.name !== "") {
      meta.createSpan({ cls: "tc-block-meta-sep", text: "·" });
      meta.createSpan({ text: file.parent.name });
    }

    const btns = row.createDiv({ cls: "tc-block-row-btns" });

    if (settings.pass2Enabled) {
      const categorizeBtn = btns.createEl("button", { cls: "tc-block-btn tc-block-btn-cat" });
      setIcon(categorizeBtn, "link");
      categorizeBtn.createSpan({ text: "Categorize" });
      categorizeBtn.addEventListener("click", () => {
        new TriageModal(this.app, allCandidates, settings).open();
      });
    }

    const deleteBtn = btns.createEl("button", { cls: "tc-block-btn tc-block-btn-del" });
    setIcon(deleteBtn, "trash");
    deleteBtn.addEventListener("click", async () => {
      await this.app.fileManager.trashFile(file);
      this.render();
    });
  }
}
