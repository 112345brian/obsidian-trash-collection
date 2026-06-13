import { App, TFile } from "obsidian";
import type { TrashCollectionSettings } from "./settings";

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

export function getAge(app: App, file: TFile, settings: TrashCollectionSettings): number {
  if (settings.ageField === "frontmatter") {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    const raw = fm?.[settings.ageFrontmatterKey];
    if (raw) {
      const ms = new Date(raw).getTime();
      if (!isNaN(ms)) return Date.now() - ms;
    }
    // fall back to ctime if frontmatter key is missing
    return Date.now() - file.stat.ctime;
  }

  return settings.ageField === "mtime"
    ? Date.now() - file.stat.mtime
    : Date.now() - file.stat.ctime;
}

export function getCandidates(app: App, settings: TrashCollectionSettings): TFile[] {
  const { metadataCache, vault } = app;
  const ageCutoffMs = settings.orphanAge * (UNIT_MS[settings.orphanAgeUnit] ?? 86_400_000);

  // Build set of all files that are linked to
  const linked = new Set<string>();
  for (const cache of Object.values(metadataCache.resolvedLinks)) {
    for (const path of Object.keys(cache)) linked.add(path);
  }

  return vault.getMarkdownFiles().filter((file) => {
    // Exclusions
    if (settings.excludeNotes.includes(file.path)) return false;
    if (settings.excludeFolders.some((prefix) => file.path.startsWith(prefix))) return false;

    const fm = metadataCache.getFileCache(file)?.frontmatter;

    if (settings.excludeFrontmatterKeys.some((key) => fm?.[key] === true || fm?.[key] === "true")) return false;
    if (settings.excludeFrontmatterValues.length > 0 && fm) {
      const fmValues = Object.values(fm).map((v) => String(v ?? ""));
      if (settings.excludeFrontmatterValues.some((val) => fmValues.some((v) => v.includes(val)))) return false;
    }

    // Age gate applies regardless of conditions
    if (getAge(app, file, settings) < ageCutoffMs) return false;

    const results: boolean[] = [];

    if (settings.checkOrphan) {
      results.push(!linked.has(file.path));
    }

    if (settings.frontmatterContainsLinks.length > 0) {
      const fmValues = fm ? Object.values(fm).map((v) => String(v ?? "")) : [];
      const hit = settings.frontmatterContainsLinks.some((link) =>
        fmValues.some((v) => v.includes(link))
      );
      results.push(hit);
    }

    if (settings.flaggedFrontmatterKeys.length > 0) {
      const hit = settings.flaggedFrontmatterKeys.some(
        (key) => fm?.[key] === true || fm?.[key] === "true"
      );
      results.push(hit);
    }

    if (results.length === 0) return false;
    return settings.conditionMode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
}
