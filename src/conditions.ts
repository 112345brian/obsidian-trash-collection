import type { ConditionGroup, ConditionMode, FrontmatterCondition } from "./settings";

// Pure frontmatter-condition evaluation. Kept free of any `obsidian` import so it
// can be unit-tested in plain Node. `candidates.ts` layers the vault/orphan logic
// on top of these predicates.

export type Frontmatter = Record<string, unknown> | undefined;

export function frontmatterValueStrings(value: unknown): string[] {
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

export function wikilinkTarget(value: string): string | null {
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

// Whether a frontmatter value counts as "filled in": a non-empty string,
// a number/boolean, or a container with at least one filled entry.
// Empty strings, empty arrays, null and undefined count as empty.
export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(isFilled);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some(isFilled);
  return true; // numbers, booleans, etc.
}

function fieldIsFilled(cond: FrontmatterCondition, fm: Frontmatter): boolean {
  if (!fm) return false;
  if (cond.field === "any") {
    return Object.entries(fm).some(([k, v]) => k !== "position" && isFilled(v));
  }
  return isFilled(fm[cond.field]);
}

export function evalCondition(cond: FrontmatterCondition, fm: Frontmatter): boolean {
  // Presence operators are evaluated against the field itself, independent of
  // whether it has a value, so handle them before the absent-field early-out.
  if (cond.op === "is-set")   return fieldIsFilled(cond, fm);
  if (cond.op === "is-empty") return !fieldIsFilled(cond, fm);

  const rawValues: unknown[] = cond.field === "any"
    ? (fm ? Object.entries(fm).filter(([k]) => k !== "position").map(([, v]) => v) : [])
    : (fm?.[cond.field] != null ? [fm[cond.field]] : []);

  // Absent field never satisfies a value operator — "field doesn't contain X"
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

// A group matches per its own mode. An empty group is never satisfied — callers
// should drop empty groups before combining so a half-built group in the UI
// neither flags every note (mode "all" → vacuously true) nor suppresses matches.
export function evalGroup(group: ConditionGroup, fm: Frontmatter): boolean {
  if (group.conditions.length === 0) return false;
  return group.mode === "any"
    ? group.conditions.some((c) => evalCondition(c, fm))
    : group.conditions.every((c) => evalCondition(c, fm));
}

// Groups with at least one condition — the only ones that contribute a result.
export function activeGroups(groups: ConditionGroup[]): ConditionGroup[] {
  return groups.filter((g) => g.conditions.length > 0);
}

// Combine an optional orphan result with the active groups under the top-level mode.
// Returns null when nothing is enabled (no orphan check and no active groups), so the
// caller can decide that a note with no applicable checks is not a candidate.
export function combineResults(
  mode: ConditionMode,
  orphan: boolean | null,
  groupResults: boolean[],
): boolean | null {
  const results = orphan === null ? [...groupResults] : [orphan, ...groupResults];
  if (results.length === 0) return null;
  return mode === "any" ? results.some(Boolean) : results.every(Boolean);
}
