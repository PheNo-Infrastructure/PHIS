import { test } from "node:test";
import assert from "node:assert/strict";
import { ADJACENT, creatableTypesFor } from "../src/adjacency.js";

// This is the whole point of pulling the rule out of the click-handling code: it can be
// exercised directly, from Node, with no browser and no server — the same way a future
// file-import pipeline would call it to validate a row's resolved anchors, not just the
// interactive "+ New" menu.

test("single type degenerates to that type's own adjacency list", () => {
  assert.deepEqual(creatableTypesFor(["organization"]), new Set(ADJACENT.organization));
});

test("intersects two types down to only what's common to both", () => {
  // ADJACENT.experiment ∩ ADJACENT.project = {project, person} — strictly smaller than either
  // operand alone, proving this is a real intersection and not "whichever set came first."
  assert.deepEqual(creatableTypesFor(["experiment", "project"]), new Set(["project", "person"]));
});

test("returns empty when selected types share no adjacent type", () => {
  assert.deepEqual(creatableTypesFor(["site", "project"]), new Set());
});

test("an unknown type contributes an empty set, collapsing the whole intersection", () => {
  assert.deepEqual(creatableTypesFor(["organization", "not-a-real-type"]), new Set());
});

test("empty input returns empty, not every type", () => {
  assert.deepEqual(creatableTypesFor([]), new Set());
});

test("validation direction: checking one target type against a selection is just membership", () => {
  // This is exactly how an autonomous/file-import caller would use the same function: given a
  // plugin-declared target type and a row's resolved anchor types, is the link valid?
  const valid = creatableTypesFor(["experiment", "project"]);
  assert.ok(valid.has("person"));
  assert.ok(!valid.has("facility"));
});
