import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import plugin from "../src/import/instruments/hortcontrol.ts";
import { BLOCK } from "../src/import/ontology.ts";

// Two blocks (1 = 15C, 3 = 18C) x two scan days, rows copied unchanged from a raw HortControl export:
// 20 rows, 5 plants per block, 63 trait columns.
const NAME = "Sheets/UiT_MDK_ArcticFrontiers_01_TraitFinder_20260108_PlantEye.csv";
const sample = readFileSync(new URL("./fixtures/hortcontrol-raw-sample.csv", import.meta.url));
const files = (text: Buffer | string = sample) => new Map([[NAME, Buffer.from(text)]]);

test("detect: a raw HortControl export is recognised, other files are not", () => {
  assert.equal(plugin.detect(files()), true);
  assert.equal(plugin.detect(new Map([["x.csv", Buffer.from("Block,Column,Row,Timestamp,Plant_ID,Germplasm\n1,1,1,2025-10-22 13:00:00,PB_1,Olve\n")]])), false);
  assert.equal(plugin.detect(new Map([["notes.txt", Buffer.from("hello")]])), false);
});

test("parse: blocks carry the treatment, plants are parts of their block with their column, germplasm and treatment", () => {
  const t = plugin.parse(files());
  const blocks = t.objects.filter((o) => o.rdfType === BLOCK);
  assert.deepEqual(blocks.map((b) => [b.name, b.factors]), [["Block 1", { Treatment: "15C" }], ["Block 3", { Treatment: "18C" }]]);
  const plants = t.objects.filter((o) => o.rdfType === "vocabulary:Plant");
  assert.equal(plants.length, 10);
  assert.deepEqual(plants.find((p) => p.name === "B3-C2"), {
    name: "B3-C2", rdfType: "vocabulary:Plant", germplasm: "Bean", factors: { Treatment: "18C" }, parent: "Block 3", position: 2,
  });
  assert.deepEqual(t.germplasmCodes, { Bean: "Bean" });
  assert.deepEqual(t.warnings, []);
});

test("parse: experiment name and start date come from the file name and the first scan; the time zone is Oslo; the device is matched from 'TraitFinder'", () => {
  const t = plugin.parse(files());
  assert.deepEqual(t.experiment, { name: "UiT_MDK_ArcticFrontiers_01 – TraitFinder – 2025-11-25", startDate: "2025-11-25" });
  assert.equal(t.timezone, "Europe/Oslo");
  assert.equal(t.source, "TraitFinder");
});

test("parse: single-value traits become variables (entity, unit from the header's end); every bin is its own variable with its edges in the description", () => {
  const t = plugin.parse(files());
  const v = Object.fromEntries(t.variables!.map((x) => [x.name, x]));
  assert.equal(t.variables!.length, 21 + 42);
  assert.equal(v["Digital Biomass"].unit, "mm³");
  assert.equal(v["Digital Biomass"].entity, "Plant");
  assert.equal(v["Digital Biomass"].method, "PlantEye 3D scan");
  assert.equal(v["Projected Leaf Area"].entity, "Leaf");
  assert.equal(v["NDVI Average"].entity, "Canopy");
  assert.equal(v["NDVI Average"].unit, "");
  assert.equal(v["Hue Average"].unit, "°");
  assert.equal(v["Leaf inclination"].unit, "mm²/mm²");
  assert.equal(v["NDVI [0.15:0.3]"].unit, "%");
  assert.equal(v["NDVI [0.15:0.3]"].entity, "Canopy");
  assert.match(v["NDVI [0.15:0.3]"].description!, /bins=\[0\.15,0\.3\]/);
  assert.match(v["GLI [-1:-0.2]"].description!, /bins=\[-1,-0\.2\]/);
});

test("parse: one variable group per histogram index, its six bins in order of their lower edge", () => {
  const t = plugin.parse(files());
  assert.equal(t.variableGroups!.length, 7);
  const ndvi = t.variableGroups!.find((g) => g.name === "NDVI distribution")!;
  assert.deepEqual(ndvi.variables, ["NDVI [-1:0]", "NDVI [0:0.15]", "NDVI [0.15:0.3]", "NDVI [0.3:0.45]", "NDVI [0.45:0.6]", "NDVI [0.6:1]"]);
});

test("parse: every row gives one value per column, for its plant, at the scan's own time", () => {
  const t = plugin.parse(files());
  assert.equal(t.measurements!.length, 20 * 63);
  const m = t.measurements!.find((x) => x.object === "B1-C1" && x.variable === "3D Leaf Area" && x.date === "2025-11-25T08:42:23");
  assert.equal(m?.value, "1465.96");
  assert.deepEqual(m?.metadata, { sensor: "A" }, "which sensor measured it travels with each value");
  assert.ok(t.measurements!.every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(x.date)));
});

test("parse: a time that is not ISO (e.g. US style from an edited file) is refused, saying why — nothing is guessed", () => {
  const edited = sample.toString().replace("2025-11-25 08:42:23", "11/25/2025 08:42:23 AM");
  assert.throws(() => plugin.parse(files(edited)), /11\/25\/2025 08:42:23 AM[\s\S]*HortControl/);
});

test("parse: unit is block:column:row read as numbers (padding doesn't matter); a row above 1 is named and warned about, not guessed", () => {
  const padded = sample.toString().replaceAll("\n1:1:1,", "\n01:01:01,");
  assert.ok(plugin.parse(files(padded)).objects.some((o) => o.name === "B1-C1"));
  const rowed = sample.toString().replaceAll("\n1:2:1,", "\n1:2:2,");
  const t = plugin.parse(files(rowed));
  assert.ok(t.objects.some((o) => o.name === "B1-C2-R2"));
  assert.ok(t.warnings.some((w) => /row/i.test(w)));
  assert.throws(() => plugin.parse(files(sample.toString().replace("\n1:1:1,", "\n1-1-1,"))), /1-1-1/);
});

test("parse: a block whose plants disagree on treatment is warned about and gets no treatment itself", () => {
  const mixed = sample.toString().replace("\n1:2:1,2025-11-25 08:42:23,A,Bean,Bean,15C", "\n1:2:1,2025-11-25 08:42:23,A,Bean,Bean,18C");
  const t = plugin.parse(files(mixed));
  assert.deepEqual(t.objects.find((o) => o.name === "Block 1")!.factors, {});
  assert.ok(t.warnings.some((w) => /Block 1/.test(w) && /treatment/i.test(w)));
});
