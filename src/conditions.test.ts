import { test } from "node:test";
import assert from "node:assert/strict";
import type { ConditionGroup } from "./settings";
import {
  activeGroups,
  combineResults,
  evalCondition,
  evalGroup,
  isFilled,
} from "./conditions";

// ── isFilled ─────────────────────────────────────────────────────────────────
test("isFilled: emptiness rules", () => {
  assert.equal(isFilled(null), false);
  assert.equal(isFilled(undefined), false);
  assert.equal(isFilled(""), false);
  assert.equal(isFilled("   "), false); // whitespace-only is empty
  assert.equal(isFilled([]), false);
  assert.equal(isFilled([null, "", []]), false); // container of empties
  assert.equal(isFilled({}), false);

  assert.equal(isFilled("x"), true);
  assert.equal(isFilled(0), true); // a number is a value
  assert.equal(isFilled(false), true); // a boolean is a value
  assert.equal(isFilled(["", "a"]), true);
  assert.equal(isFilled("[[Foo]]"), true);
});

// ── evalCondition: presence operators ────────────────────────────────────────
test("is-set / is-empty on a specific field", () => {
  const setC = { field: "up", op: "is-set" as const, value: "" };
  const emptyC = { field: "up", op: "is-empty" as const, value: "" };

  assert.equal(evalCondition(setC, { up: "[[Home]]" }), true);
  assert.equal(evalCondition(emptyC, { up: "[[Home]]" }), false);

  // absent key
  assert.equal(evalCondition(setC, { other: "x" }), false);
  assert.equal(evalCondition(emptyC, { other: "x" }), true);

  // present but empty value
  assert.equal(evalCondition(setC, { up: "" }), false);
  assert.equal(evalCondition(emptyC, { up: "" }), true);
  assert.equal(evalCondition(setC, { up: null }), false);
  assert.equal(evalCondition(emptyC, { up: [] }), true);

  // no frontmatter at all
  assert.equal(evalCondition(setC, undefined), false);
  assert.equal(evalCondition(emptyC, undefined), true);
});

test("is-set / is-empty with field=any", () => {
  const anySet = { field: "any", op: "is-set" as const, value: "" };
  const anyEmpty = { field: "any", op: "is-empty" as const, value: "" };

  assert.equal(evalCondition(anySet, { a: "x" }), true);
  assert.equal(evalCondition(anyEmpty, { a: "x" }), false);

  // "position" is metadata, not a real field — must be ignored
  assert.equal(evalCondition(anySet, { position: { start: 0 } }), false);
  assert.equal(evalCondition(anyEmpty, { position: { start: 0 } }), true);

  // all real fields empty
  assert.equal(evalCondition(anySet, { a: "", b: null }), false);
  assert.equal(evalCondition(anyEmpty, { a: "", b: null }), true);
});

// ── evalCondition: value operators still behave ──────────────────────────────
test("contains / equals with wikilink targets", () => {
  const fm = { up: "[[Unique Notes]]" };
  // A [[...]] condition value matches both the raw form and the bare target.
  assert.equal(evalCondition({ field: "up", op: "contains", value: "[[Unique Notes]]" }, fm), true);
  assert.equal(evalCondition({ field: "up", op: "equals", value: "[[Unique Notes]]" }, fm), true);
  assert.equal(evalCondition({ field: "up", op: "not-equals", value: "[[Unique Notes]]" }, fm), false);
  // A bare-string condition value only substring-matches; it does not equal the [[...]] form.
  assert.equal(evalCondition({ field: "up", op: "contains", value: "Unique Notes" }, fm), true);
  assert.equal(evalCondition({ field: "up", op: "equals", value: "Unique Notes" }, fm), false);
  assert.equal(evalCondition({ field: "up", op: "not-contains", value: "Unique Notes" }, fm), false);
});

test("value operators do not match an absent field", () => {
  // A note with no `up` must NOT satisfy "up doesn't contain X" (regression guard).
  assert.equal(evalCondition({ field: "up", op: "not-contains", value: "X" }, { other: 1 }), false);
  assert.equal(evalCondition({ field: "up", op: "not-equals", value: "X" }, { other: 1 }), false);
});

// ── evalGroup ────────────────────────────────────────────────────────────────
test("evalGroup: any vs all, empty group", () => {
  const fm = { a: "x" };
  const anyG: ConditionGroup = {
    mode: "any",
    conditions: [
      { field: "a", op: "is-set", value: "" },
      { field: "b", op: "is-set", value: "" },
    ],
  };
  const allG: ConditionGroup = { ...anyG, mode: "all" };
  assert.equal(evalGroup(anyG, fm), true); // a set
  assert.equal(evalGroup(allG, fm), false); // b not set

  // empty group never matches (neither vacuously-true nor swallowing)
  assert.equal(evalGroup({ mode: "all", conditions: [] }, fm), false);
  assert.equal(evalGroup({ mode: "any", conditions: [] }, fm), false);
});

// ── activeGroups / combineResults ────────────────────────────────────────────
test("activeGroups drops empty groups", () => {
  const groups: ConditionGroup[] = [
    { mode: "all", conditions: [] },
    { mode: "all", conditions: [{ field: "a", op: "is-set", value: "" }] },
  ];
  assert.equal(activeGroups(groups).length, 1);
});

test("combineResults: orphan + groups under top-level mode", () => {
  // nothing enabled → null (caller treats as not-a-candidate)
  assert.equal(combineResults("any", null, []), null);
  assert.equal(combineResults("all", null, []), null);

  // orphan only
  assert.equal(combineResults("any", true, []), true);
  assert.equal(combineResults("all", false, []), false);

  // OR combines orphan with a group
  assert.equal(combineResults("any", false, [true]), true);
  assert.equal(combineResults("any", false, [false]), false);

  // AND requires both
  assert.equal(combineResults("all", true, [false]), false);
  assert.equal(combineResults("all", true, [true]), true);
});

// ── The user's real-world rule, end to end ───────────────────────────────────
// "Trash = (instance-of empty AND part-of empty) OR (either contains [[Unique Notes]])"
function isTrash(fm: Record<string, unknown> | undefined): boolean {
  const groups: ConditionGroup[] = [
    {
      mode: "all",
      conditions: [
        { field: "instance-of", op: "is-empty", value: "" },
        { field: "part-of", op: "is-empty", value: "" },
      ],
    },
    {
      mode: "any",
      conditions: [
        { field: "instance-of", op: "contains", value: "[[Unique Notes]]" },
        { field: "part-of", op: "contains", value: "[[Unique Notes]]" },
      ],
    },
  ];
  const results = activeGroups(groups).map((g) => evalGroup(g, fm));
  return combineResults("any", null, results) ?? false;
}

test("user rule: uncategorized note is trash", () => {
  assert.equal(isTrash(undefined), true); // no frontmatter → both empty
  assert.equal(isTrash({}), true);
  assert.equal(isTrash({ "instance-of": "", "part-of": null }), true);
});

test("user rule: placeholder link is trash even if other field is filled", () => {
  assert.equal(isTrash({ "instance-of": "[[Unique Notes]]", "part-of": "[[Project]]" }), true);
  assert.equal(isTrash({ "instance-of": "[[Book]]", "part-of": "[[Unique Notes]]" }), true);
});

test("user rule: properly categorized note is NOT trash", () => {
  assert.equal(isTrash({ "instance-of": "[[Book]]", "part-of": "[[Reading]]" }), false);
  // one filled, one empty, no placeholder → not fully uncategorized, not placeholder → kept
  assert.equal(isTrash({ "instance-of": "[[Book]]", "part-of": "" }), false);
});
