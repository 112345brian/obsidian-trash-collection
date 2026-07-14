import { App, TFile } from "obsidian";
import type { TrashCollectionSettings } from "./settings";
import { activeGroups, combineResults, evalGroup } from "./conditions";

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

function getOutgoingLinkPaths(app: App, file: TFile): Set<string> {
  const { metadataCache } = app;
  const outgoing = new Set(Object.keys(metadataCache.resolvedLinks[file.path] ?? {}));
  const fileCache = metadataCache.getFileCache(file);

  for (const link of fileCache?.frontmatterLinks ?? []) {
    const dest = metadataCache.getFirstLinkpathDest(link.link, file.path);
    if (dest) outgoing.add(dest.path);
  }

  return outgoing;
}

export function getCandidates(app: App, settings: TrashCollectionSettings): TFile[] {
  const { metadataCache, vault } = app;
  const ageCutoffMs = settings.orphanAge * (UNIT_MS[settings.orphanAgeUnit] ?? 86_400_000);

  // Precompute link sets only when the orphan check is enabled.
  const linked = new Set<string>();
  const placeholderPaths = new Set<string>();
  if (settings.checkOrphan) {
    for (const cache of Object.values(metadataCache.resolvedLinks)) {
      for (const path of Object.keys(cache)) linked.add(path);
    }
  }

  if (settings.checkOrphan && settings.orphanRequiresNoOutgoing) {
    for (const group of settings.conditionGroups) {
      for (const cond of group.conditions) {
        if (cond.op === "contains") {
          const linkText = cond.value.replace(/^\[\[|\]\]$/g, "");
          const dest = metadataCache.getFirstLinkpathDest(linkText, "");
          if (dest) placeholderPaths.add(dest.path);
        }
      }
    }
  }

  // Empty groups contribute nothing — dropping them keeps a half-built group in
  // the settings UI from flagging (mode "all" → vacuously true) or suppressing
  // (mode "any" → false) every note.
  const groups = activeGroups(settings.conditionGroups);

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

    // Age gate
    if (getAge(app, file, settings) < ageCutoffMs) return false;

    let orphan: boolean | null = null;
    if (settings.checkOrphan) {
      const noIncoming = !linked.has(file.path);
      if (settings.orphanRequiresNoOutgoing) {
        const outgoing = getOutgoingLinkPaths(app, file);
        const meaningfulOutgoing = [...outgoing].filter((p) => !placeholderPaths.has(p));
        orphan = noIncoming && meaningfulOutgoing.length === 0;
      } else {
        orphan = noIncoming;
      }
    }

    const groupResults = groups.map((group) => evalGroup(group, fm));

    // No orphan check and no active groups → nothing to match on → not a candidate.
    return combineResults(settings.conditionMode, orphan, groupResults) ?? false;
  });
}
