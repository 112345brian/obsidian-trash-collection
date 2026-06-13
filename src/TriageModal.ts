import { App, MarkdownRenderer, Modal, TFile, setIcon } from "obsidian";
import type { TrashCollectionSettings } from "./settings";
import { FileSuggest } from "./FileSuggest";

const FRONTMATTER_RE = /^---[\s\S]*?---\s*\n?/;
const PREVIEW_LINES = 10;

type Phase = "pass1" | "pass2" | "done";

export class TriageModal extends Modal {
  private phase: Phase = "pass1";
  private pass1Index = 0;
  private kept: TFile[] = [];
  private pass2Index = 0;

  private startX = 0;
  private currentCard: HTMLElement | null = null;

  constructor(
    app: App,
    private candidates: TFile[],
    private settings: TrashCollectionSettings
  ) {
    super(app);
  }

  onOpen() {
    this.modalEl.addClass("trash-collection-modal");
    this.render();
    this.scope.register([], "ArrowRight", () => { if (this.phase === "pass1") this.pass1Keep(); return false; });
    this.scope.register([], "ArrowLeft",  () => { if (this.phase === "pass1") this.pass1Trash(); return false; });
  }

  // ── render dispatcher ──────────────────────────────────────────────────────

  private async render() {
    if (this.phase === "pass1") await this.renderPass1();
    else if (this.phase === "pass2") await this.renderPass2();
    else this.renderDone();
  }

  // ── Pass 1 ─────────────────────────────────────────────────────────────────

  private async renderPass1() {
    const { contentEl, titleEl } = this;
    contentEl.empty();

    const file = this.candidates[this.pass1Index];
    if (!file) {
      this.phase = this.settings.pass2Enabled && this.kept.length > 0 ? "pass2" : "done";
      await this.render();
      return;
    }

    const remaining = this.candidates.length - this.pass1Index;
    titleEl.setText(`Triage (${remaining} left)`);

    const card = contentEl.createDiv({ cls: "tc-card" });
    this.currentCard = card;
    this.attachSwipe(card, () => this.pass1Keep(), () => this.pass1Trash());

    const header = card.createDiv({ cls: "tc-card-header" });
    header.createDiv({ cls: "tc-card-title", text: file.basename });
    const meta = header.createDiv({ cls: "tc-card-meta" });
    const age = Math.floor((Date.now() - file.stat.mtime) / 86_400_000);
    meta.createSpan({ text: `${age} day${age === 1 ? "" : "s"} ago` });
    if (file.parent?.name && file.parent.name !== "/") {
      meta.createSpan({ cls: "tc-meta-sep", text: "·" });
      meta.createSpan({ text: file.parent.name });
    }

    const raw = await this.app.vault.read(file);
    const body = raw.replace(FRONTMATTER_RE, "").trimStart();
    const lines = body.split("\n");
    const snippet = lines.slice(0, PREVIEW_LINES).join("\n") + (lines.length > PREVIEW_LINES ? "\n\n…" : "");
    if (snippet.trim()) {
      const preview = card.createDiv({ cls: "tc-card-preview" });
      await MarkdownRenderer.render(this.app, snippet, preview, file.path, this as unknown as import("obsidian").Component);
    }

    // Buttons
    const actions = contentEl.createDiv({ cls: "tc-actions" });

    const trashBtn = actions.createEl("button", { cls: "tc-btn tc-btn-trash" });
    setIcon(trashBtn, "trash");
    trashBtn.createSpan({ text: "Trash" });
    trashBtn.addEventListener("click", () => this.pass1Trash());

    const keepBtn = actions.createEl("button", { cls: "tc-btn tc-btn-keep" });
    setIcon(keepBtn, "check");
    keepBtn.createSpan({ text: "Keep" });
    keepBtn.addEventListener("click", () => this.pass1Keep());

    contentEl.createDiv({ cls: "tc-swipe-hint", text: "← trash · keep →  ·  arrow keys on desktop" });
  }

  private async pass1Trash() {
    const file = this.candidates[this.pass1Index];
    if (file) await this.app.vault.trash(file, true);
    this.pass1Index++;
    await this.renderPass1();
  }

  private pass1Keep() {
    const file = this.candidates[this.pass1Index];
    if (file) this.kept.push(file);
    this.pass1Index++;
    this.renderPass1();
  }

  // ── Pass 2 ─────────────────────────────────────────────────────────────────

  private async renderPass2() {
    const { contentEl, titleEl } = this;
    contentEl.empty();

    const file = this.kept[this.pass2Index];
    if (!file) { this.phase = "done"; this.renderDone(); return; }

    const remaining = this.kept.length - this.pass2Index;
    titleEl.setText(`Link notes (${remaining} left)`);

    const card = contentEl.createDiv({ cls: "tc-card" });
    card.createDiv({ cls: "tc-card-title", text: file.basename });

    const raw = await this.app.vault.read(file);
    const body = raw.replace(FRONTMATTER_RE, "").trimStart();
    const lines = body.split("\n");
    const snippet = lines.slice(0, PREVIEW_LINES).join("\n") + (lines.length > PREVIEW_LINES ? "\n\n…" : "");
    if (snippet.trim()) {
      const preview = card.createDiv({ cls: "tc-card-preview" });
      await MarkdownRenderer.render(this.app, snippet, preview, file.path, this as unknown as import("obsidian").Component);
    }

    // Action UI
    const { pass2Action, shortcuts } = this.settings;
    const actionEl = contentEl.createDiv({ cls: "tc-pass2-action" });

    const label = pass2Action.type === "replace-link"
      ? `Replace ${pass2Action.findLink} with:`
      : `Set frontmatter "${pass2Action.frontmatterKey}" to:`;
    actionEl.createDiv({ cls: "tc-pass2-label", text: label });

    const input = actionEl.createEl("input", { cls: "tc-pass2-input", type: "text" }) as HTMLInputElement;
    input.placeholder = "Type a note name…";
    new FileSuggest(this.app, input, shortcuts);

    // Buttons
    const actions = contentEl.createDiv({ cls: "tc-actions" });

    const skipBtn = actions.createEl("button", { cls: "tc-btn" });
    skipBtn.createSpan({ text: "Skip" });
    skipBtn.addEventListener("click", () => { this.pass2Index++; this.renderPass2(); });

    const applyBtn = actions.createEl("button", { cls: "tc-btn tc-btn-keep" });
    setIcon(applyBtn, "check");
    applyBtn.createSpan({ text: "Apply" });
    applyBtn.addEventListener("click", async () => {
      const selectedFile = (input as HTMLInputElement & { _selectedFile?: TFile })._selectedFile;
      const targetName = selectedFile?.basename ?? input.value.trim();
      if (!targetName) { this.pass2Index++; await this.renderPass2(); return; }
      const wikilink = `[[${selectedFile ? selectedFile.basename : targetName}]]`;
      await this.applyPass2Action(file, wikilink);
      this.pass2Index++;
      await this.renderPass2();
    });

    // Also submit on Enter
    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      applyBtn.click();
    });

    setTimeout(() => input.focus(), 50);
  }

  private async applyPass2Action(file: TFile, wikilink: string) {
    const { pass2Action } = this.settings;
    const content = await this.app.vault.read(file);

    if (pass2Action.type === "replace-link") {
      const updated = content.replaceAll(pass2Action.findLink, wikilink);
      await this.app.vault.modify(file, updated);
    } else {
      // add-frontmatter: set the key in existing frontmatter or prepend it
      const YAML_RE = /^(---\n)([\s\S]*?)(---)/;
      const match = content.match(YAML_RE);
      if (match) {
        const newYaml = match[2].replace(
          new RegExp(`^${pass2Action.frontmatterKey}:.*$`, "m"),
          `${pass2Action.frontmatterKey}: "${wikilink}"`
        );
        const hadKey = newYaml !== match[2];
        const yaml = hadKey ? newYaml : `${match[2]}${pass2Action.frontmatterKey}: "${wikilink}"\n`;
        await this.app.vault.modify(file, `${match[1]}${yaml}${match[3]}${content.slice(match[0].length)}`);
      } else {
        await this.app.vault.modify(file, `---\n${pass2Action.frontmatterKey}: "${wikilink}"\n---\n${content}`);
      }
    }
  }

  // ── Done ───────────────────────────────────────────────────────────────────

  private renderDone() {
    this.titleEl.setText("All done");
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: "Nothing left to review.", cls: "tc-empty" });
  }

  // ── Swipe ──────────────────────────────────────────────────────────────────

  private attachSwipe(el: HTMLElement, onRight: () => void, onLeft: () => void) {
    el.addEventListener("touchstart", (e) => { this.startX = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - this.startX;
      if (dx > 80) onRight();
      else if (dx < -80) onLeft();
    });
  }

  onClose() { this.contentEl.empty(); }
}
