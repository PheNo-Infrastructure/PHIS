import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEdits, namesIn, parseEdits } from "../src/import/edits.ts";
import type { TrialData } from "../src/import/plugins.ts";

const trial = (): TrialData => ({
  experiment: { name: "UiT trial", startDate: "2025-11-25" },
  objects: [
    { name: "B1", rdfType: "Block", factors: {} },
    { name: "B1-C1", rdfType: "Plant", germplasm: "Bean", factors: { Treatment: "15C" }, parent: "B1", position: 1 },
    { name: "B1-C2", rdfType: "Plant", germplasm: "Olve", factors: { Treatment: "18C" }, parent: "B1", position: 2 },
  ],
  germplasmCodes: { Bean: "G1", Olve: "G5" },
  variables: [
    { name: "NDVI Average", entity: "Plant", characteristic: "NDVI", method: "", unit: "" },
    { name: "Hue [0-10]", entity: "Plant", characteristic: "Hue", method: "", unit: "" },
  ],
  variableGroups: [{ name: "Hue distribution", variables: ["Hue [0-10]"] }],
  measurements: [{ object: "B1-C1", variable: "NDVI Average", date: "2025-11-25T12:00:00", value: "0.5" }],
  warnings: [],
});

test("applyEdits: no edits returns the data as it is", () => {
  const t = trial();
  assert.deepEqual(applyEdits(t, undefined), t);
  assert.deepEqual(applyEdits(t, {}), t);
});

test("applyEdits: the experiment's name and start date can be changed, and are trimmed", () => {
  const out = applyEdits(trial(), { experiment: { name: "  My trial  ", startDate: "2025-12-01" } });
  assert.deepEqual(out.experiment, { name: "My trial", startDate: "2025-12-01" });
  assert.equal(applyEdits(trial(), { experiment: { name: "Only the name" } }).experiment.startDate, "2025-11-25");
});

test("applyEdits: an empty experiment name, or a date that is not a real YYYY-MM-DD date, is refused with a plain message", () => {
  assert.throws(() => applyEdits(trial(), { experiment: { name: "   " } }), /name can't be empty/);
  assert.throws(() => applyEdits(trial(), { experiment: { startDate: "25.11.2025" } }), /YYYY-MM-DD/);
  assert.throws(() => applyEdits(trial(), { experiment: { startDate: "2025-02-30" } }), /isn't a real date/);
});

test("applyEdits: a renamed germplasm follows through the objects and its code", () => {
  const out = applyEdits(trial(), { germplasm: { Olve: "Olve (G5)" } });
  assert.equal(out.objects[2].germplasm, "Olve (G5)");
  assert.equal(out.objects[1].germplasm, "Bean", "others are left alone");
  assert.deepEqual(out.germplasmCodes, { Bean: "G1", "Olve (G5)": "G5" });
});

test("applyEdits: a renamed factor and level follow through every object that has them", () => {
  const out = applyEdits(trial(), { factors: { Treatment: { name: "Temperature", levels: { "15C": "15 °C" } } } });
  assert.deepEqual(out.objects[1].factors, { Temperature: "15 °C" });
  assert.deepEqual(out.objects[2].factors, { Temperature: "18C" });
});

test("applyEdits: a renamed variable follows through the variable list, its group and the measurements", () => {
  const out = applyEdits(trial(), { variables: { "NDVI Average": "NDVI", "Hue [0-10]": "Hue 0-10" } });
  assert.deepEqual(out.variables!.map((v) => v.name), ["NDVI", "Hue 0-10"]);
  assert.deepEqual(out.variableGroups![0].variables, ["Hue 0-10"]);
  assert.equal(out.measurements![0].variable, "NDVI");
});

test("applyEdits: editing never changes the object it was given", () => {
  const t = trial();
  applyEdits(t, { germplasm: { Bean: "Common bean" }, variables: { "NDVI Average": "NDVI" }, experiment: { name: "X" } });
  assert.deepEqual(t, trial());
});

test("applyEdits: naming something the file doesn't have, or giving two things one name, is refused", () => {
  assert.throws(() => applyEdits(trial(), { germplasm: { Wheat: "Corn" } }), /no germplasm "Wheat"/);
  assert.throws(() => applyEdits(trial(), { variables: { Nope: "x" } }), /no variable "Nope"/);
  assert.throws(() => applyEdits(trial(), { factors: { Nope: { name: "x" } } }), /no factor "Nope"/);
  assert.throws(() => applyEdits(trial(), { factors: { Treatment: { levels: { "99C": "x" } } } }), /no level "99C"/);
  assert.throws(() => applyEdits(trial(), { germplasm: { Bean: "Olve" } }), /Two germplasm would both be called "Olve"/);
  assert.throws(() => applyEdits(trial(), { factors: { Treatment: { levels: { "15C": "18C" } } } }), /Two levels of Treatment would both be called "18C"/);
  assert.throws(() => applyEdits(trial(), { variables: { "NDVI Average": "Hue [0-10]" } }), /Two variables would both be called "Hue \[0-10\]"/);
  assert.throws(() => applyEdits(trial(), { germplasm: { Bean: " " } }), /can't be empty/);
});

test("namesIn: what the review lets you edit, by the file's own names", () => {
  assert.deepEqual(namesIn(trial()), {
    germplasm: ["Bean", "Olve"],
    factors: [{ name: "Treatment", levels: ["15C", "18C"] }],
    variables: ["NDVI Average", "Hue [0-10]"],
  });
});

test("parseEdits: reads the page's JSON, and turns anything else into a plain error", () => {
  assert.deepEqual(parseEdits(undefined), {});
  assert.deepEqual(parseEdits(encodeURIComponent(JSON.stringify({ experiment: { name: "A" } }))), { experiment: { name: "A" } });
  assert.throws(() => parseEdits("%7Bnot json"), /edits could not be read/);
  assert.throws(() => parseEdits(encodeURIComponent('{"germplasm":{"A":5}}')), /edits could not be read/);
  assert.throws(() => parseEdits(encodeURIComponent('[1]')), /edits could not be read/);
});

test("applyEdits: a germplasm's code can be changed or removed, by the file's name for it", () => {
  const out = applyEdits(trial(), { germplasm: { Bean: "Common bean" }, germplasmCodes: { Bean: " G9 ", Olve: "" } });
  assert.deepEqual(out.germplasmCodes, { "Common bean": "G9" });
  assert.throws(() => applyEdits(trial(), { germplasmCodes: { Nope: "G1" } }), /no germplasm "Nope"/);
  assert.throws(() => parseEdits(encodeURIComponent('{"germplasmCodes":{"A":5}}')), /edits could not be read/);
});
