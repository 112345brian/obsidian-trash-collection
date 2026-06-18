import { App, MarkdownRenderer, Modal, TFile, setIcon } from "obsidian";
import type { TrashCollectionSettings } from "./settings";
import { FileSuggest } from "./FileSuggest";
import { getAge } from "./candidates";
import { updateFrontmatterField } from "./frontmatter";

const FRONTMATTER_RE = /^---[\s\S]*?---\s*\n?/;
const PREVIEW_LINES = 10;

type Phase = "pass1" | "pass2" | "done";

export class TriageModal extends Modal {
  private phase: Phase = "pass1";
  private pass1Index = 0;
  private kept: TFile[] = [];
  private pass2Index = 0;

  private startX = 0;

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

  // ── shared card helper ─────────────────────────────────────────────────────

  private async renderNotePreview(container: HTMLElement, file: TFile): Promise<void> {
    // Frontmatter
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm) {
      const fmEl = container.createDiv({ cls: "tc-card-fm" });
      for (const [key, val] of Object.entries(fm)) {
        if (key === "position") continue;
        const row = fmEl.createDiv({ cls: "tc-fm-row" });
        row.createSpan({ cls: "tc-fm-key", text: key });
        const display = Array.isArray(val)
          ? val.join(", ")
          : (val !== null && typeof val === "object" ? JSON.stringify(val) : String(val ?? ""));
        row.createSpan({ cls: "tc-fm-val", text: display });
      }
    }

    // Body snippet
    const raw = await this.app.vault.read(file);
    const body = raw.replace(FRONTMATTER_RE, "").trimStart();
    const lines = body.split("\n");
    const snippet = lines.slice(0, PREVIEW_LINES).join("\n") + (lines.length > PREVIEW_LINES ? "\n\n…" : "");
    if (snippet.trim()) {
      const preview = container.createDiv({ cls: "tc-card-preview" });
      await MarkdownRenderer.render(this.app, snippet, preview, file.path, this as unknown as import("obsidian").Component);
    }
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
    this.attachSwipe(card, () => this.pass1Keep(), () => this.pass1Trash());

    const header = card.createDiv({ cls: "tc-card-header" });

    const titleEl2 = header.createDiv({ cls: "tc-card-title tc-card-title--link", text: file.basename });
    titleEl2.addEventListener("click", () => {
      this.app.workspace.openLinkText(file.path, "", false);
    });

    const meta = header.createDiv({ cls: "tc-card-meta" });
    const age = Math.floor(getAge(this.app, file, this.settings) / 86_400_000);
    meta.createSpan({ text: `${age} day${age === 1 ? "" : "s"} ago` });
    if (file.parent?.name && file.parent.name !== "/") {
      meta.createSpan({ cls: "tc-meta-sep", text: "·" });
      meta.createSpan({ text: file.parent.name });
    }

    await this.renderNotePreview(card, file);

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

    const titleEl2 = card.createDiv({ cls: "tc-card-title tc-card-title--link", text: file.basename });
    titleEl2.addEventListener("click", () => {
      this.app.workspace.openLinkText(file.path, "", false);
    });

    await this.renderNotePreview(card, file);

    // Action UI
    const { pass2Action, shortcuts } = this.settings;
    const actionEl = contentEl.createDiv({ cls: "tc-pass2-action" });

    const label = pass2Action.type === "replace-link"
      ? `Replace ${pass2Action.findLink} with:`
      : `Set frontmatter "${pass2Action.frontmatterKey}" to:`;
    actionEl.createDiv({ cls: "tc-pass2-label", text: label });

    const input = actionEl.createEl("input", { cls: "tc-pass2-input", type: "text" }) as HTMLInputElement;
    input.placeholder = "Type a note name…";
    let selectedFile: TFile | null = null;
    const fileSuggest = new FileSuggest(this.app, input, shortcuts);
    fileSuggest.onSelect((f) => {
      selectedFile = f;
      fileSuggest.setValue(f.basename);
    });

    // Buttons
    const actions = contentEl.createDiv({ cls: "tc-actions" });

    const skipBtn = actions.createEl("button", { cls: "tc-btn" });
    skipBtn.createSpan({ text: "Skip" });
    skipBtn.addEventListener("click", () => { this.pass2Index++; this.renderPass2(); });

    const applyBtn = actions.createEl("button", { cls: "tc-btn tc-btn-keep" });
    setIcon(applyBtn, "check");
    applyBtn.createSpan({ text: "Apply" });
    applyBtn.addEventListener("click", async () => {
      const targetName = selectedFile?.basename ?? input.value.trim();
      if (!targetName) { this.pass2Index++; await this.renderPass2(); return; }
      const wikilink = `[[${selectedFile ? selectedFile.basename : targetName}]]`;
      await this.applyPass2Action(file, wikilink);
      this.pass2Index++;
      await this.renderPass2();
    });

    input.addEventListener("keydown", async (e) => {
      if (e.key !== "Enter") return;
      applyBtn.click();
    });

    setTimeout(() => input.focus(), 50);
  }

  private async applyPass2Action(file: TFile, wikilink: string) {
    const { pass2Action } = this.settings;

    if (pass2Action.type === "replace-link") {
      if (!pass2Action.findLink) return;
      const content = await this.app.vault.read(file);
      const updated = content.split(pass2Action.findLink).join(wikilink);
      await this.app.vault.modify(file, updated);
    } else {
      await this.applyFrontmatterAction(file, wikilink);
    }
  }

  private async applyFrontmatterAction(file: TFile, wikilink: string) {
    const key = this.settings.pass2Action.frontmatterKey.trim();
    if (!key) return;

    const cacheValue = this.app.metadataCache.getFileCache(file)?.frontmatter?.[key];
    const preferList = Array.isArray(cacheValue);

    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const current = frontmatter[key] ?? cacheValue;
        frontmatter[key] = Array.isArray(current) ? [wikilink] : wikilink;
      });
      return;
    } catch (error) {
      console.warn("Trash Collection: repairing frontmatter with text fallback", error);
    }

    const content = await this.app.vault.read(file);
    await this.app.vault.modify(file, updateFrontmatterField(content, key, wikilink, preferList));
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
