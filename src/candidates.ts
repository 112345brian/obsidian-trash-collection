import { App, TFile } from "obsidian";
import type { FrontmatterCondition, TrashCollectionSettings } from "./settings";

const UNIT_MS: Record<string, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

function frontmatterValueStrings(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [String(value), ...value.flatMap(frontmatterValueStrings)];
  }

  if (value !== null && typeof value === "object") {
    return [
      JSON.stringify(value),
      ...Object.values(value as Record<string, unknown>).flatMap(frontmatterValueStrings),
    ];
  }

  return [String(value ?? "")];
}

function wikilinkTarget(value: string): string | null {
  const link = value.match(/^\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]$/);
  return link?.[1] ?? null;
}

function containsConditionValue(haystack: string, needle: string): boolean {
  const target = wikilinkTarget(needle);
  return haystack.includes(needle) || (target !== null && haystack === target);
}

function equalsConditionValue(value: string, expected: string): boolean {
  const target = wikilinkTarget(expected);
  return value === expected || (target !== null && value === target);
}

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

function evalCondition(cond: FrontmatterCondition, fm: Record<string, unknown> | undefined): boolean {
  const rawValues: unknown[] = cond.field === "any"
    ? (fm ? Object.entries(fm).filter(([k]) => k !== "position").map(([, v]) => v) : [])
    : (fm?.[cond.field] != null ? [fm[cond.field]] : []);

  // Absent field never satisfies any condition — "field doesn't contain X"
  // should not match notes that simply have no such field.
  if (rawValues.length === 0) return false;

  const strValues = rawValues.flatMap(frontmatterValueStrings);

  switch (cond.op) {
    case "contains":     return strValues.some((v) => containsConditionValue(v, cond.value));
    case "not-contains": return strValues.every((v) => !containsConditionValue(v, cond.value));
    case "equals":       return strValues.some((v) => equalsConditionValue(v, cond.value));
    case "not-equals":   return strValues.every((v) => !equalsConditionValue(v, cond.value));
    default:             return false;
  }
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
    for (const cond of settings.frontmatterConditions) {
      if (cond.op === "contains") {
        const linkText = cond.value.replace(/^\[\[|\]\]$/g, "");
        const dest = metadataCache.getFirstLinkpathDest(linkText, "");
        if (dest) placeholderPaths.add(dest.path);
      }
    }
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

    // Age gate
    if (getAge(app, file, settings) < ageCutoffMs) return false;

    const results: boolean[] = [];

    if (settings.checkOrphan) {
      const noIncoming = !linked.has(file.path);
      if (settings.orphanRequiresNoOutgoing) {
        const outgoing = getOutgoingLinkPaths(app, file);
        const meaningfulOutgoing = [...outgoing].filter((p) => !placeholderPaths.has(p));
        results.push(noIncoming && meaningfulOutgoing.length === 0);
      } else {
        results.push(noIncoming);
      }
    }

    for (const cond of settings.frontmatterConditions) {
      results.push(evalCondition(cond, fm));
    }

    if (results.length === 0) return false;
    return settings.conditionMode === "any"
      ? results.some(Boolean)
      : results.every(Boolean);
  });
}
