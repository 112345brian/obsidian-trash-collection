import { AbstractInputSuggest, App, TFile, TFolder } from "obsidian";

export class FileSuggest extends AbstractInputSuggest<TFile> {
  selectedFile: TFile | null = null;
  private shortcuts: Record<string, string>;

  constructor(app: App, inputEl: HTMLInputElement, shortcuts: Record<string, string> = {}) {
    super(app, inputEl);
    this.shortcuts = shortcuts;
  }

  getSuggestions(query: string): TFile[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const resolved = this.shortcuts[q] ?? q;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.basename.toLowerCase().includes(resolved.toLowerCase()))
      .sort((a, b) => a.basename.localeCompare(b.basename))
      .slice(0, 8);
  }

  renderSuggestion(file: TFile, el: HTMLElement) {
    el.createSpan({ text: file.basename });
    if (file.parent?.name && file.parent.name !== "/") {
      el.createSpan({ cls: "tc-suggest-path", text: ` · ${file.parent.name}` });
    }
  }

  selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
    this.selectedFile = file;
    this.inputEl.value = file.basename;
    this.inputEl.dispatchEvent(new Event("input"));
    this.close();
  }
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  selectedPath: string | null = null;

  getSuggestions(query: string): TFolder[] {
    const q = query.toLowerCase().trim();
    const folders: TFolder[] = [];
    this.app.vault.getAllLoadedFiles().forEach((f) => {
      if (f instanceof TFolder && f.path.toLowerCase().includes(q)) folders.push(f);
    });
    return folders.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 10);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement) {
    el.setText(folder.path === "/" ? "/" : folder.path + "/");
  }

  selectSuggestion(folder: TFolder, evt: MouseEvent | KeyboardEvent) {
    const path = folder.path === "/" ? "/" : folder.path + "/";
    this.selectedPath = path;
    this.inputEl.value = path;
    this.inputEl.dispatchEvent(new Event("input"));
    this.close();
  }
}

export class NoteSuggest extends AbstractInputSuggest<TFile> {
  selectedFile: TFile | null = null;

  getSuggestions(query: string): TFile[] {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.toLowerCase().includes(q))
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 10);
  }

  renderSuggestion(file: TFile, el: HTMLElement) {
    el.createSpan({ text: file.basename });
    el.createSpan({ cls: "tc-suggest-path", text: ` · ${file.parent?.path ?? ""}` });
  }

  selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent) {
    this.selectedFile = file;
    this.inputEl.value = file.path;
    this.inputEl.dispatchEvent(new Event("input"));
    this.close();
  }
}
