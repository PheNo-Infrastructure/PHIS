import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import plugin from "../src/import/instruments/boxeed.ts";
import hortcontrol from "../src/import/instruments/hortcontrol.ts";

// The first 6 seeds of a real Boxeed sort's average_*.csv, unchanged.
const NAME = "average_RFP sort_arenosa_v4-2025-12-05-11-20-45.csv";
const sample = readFileSync(new URL("./fixtures/boxeed-average-sample.csv", import.meta.url));
const files = (name = NAME) => new Map([[name, Buffer.from(sample)], ["photos/0_0.jpg", Buffer.from("x")]]);

test("detect: a Boxeed export is recognised, a HortControl one and other files are not", () => {
  assert.equal(plugin.detect(files()), true);
  assert.equal(plugin.detect(new Map([["x.csv", Buffer.from("a,b\n1,2\n")]])), false);
  assert.equal(plugin.detect(new Map([["notes.txt", Buffer.from("hello")]])), false);
  assert.equal(hortcontrol.detect(files()), false);
});

test("parse: one Seed per row, named after its sample and row; no germplasm or factors", () => {
  const t = plugin.parse(files());
  assert.deepEqual(t.objects.map((o) => o.name), ["rfp source-1", "rfp source-2", "rfp source-3", "rfp source-4", "rfp source-5", "rfp source-6"]);
  assert.deepEqual(t.objects[0], { name: "rfp source-1", rdfType: "vocabulary:Seed", factors: {} });
  assert.deepEqual(t.warnings, []);
});

test("parse: name, start date and measuring time come from the file name; Oslo time", () => {
  const t = plugin.parse(files());
  assert.deepEqual(t.experiment, { name: "RFP sort_arenosa_v4 – Boxeed – 2025-12-05", startDate: "2025-12-05" });
  assert.equal(t.timezone, "Europe/Oslo");
  assert.equal(t.source, "Boxeed");
  assert.ok(t.measurements!.every((m) => m.date === "2025-12-05T11:20:45"));
});

test("parse: the 8 trait columns become Seed variables with their units; every value is kept as the file has it", () => {
  const t = plugin.parse(files());
  assert.deepEqual(t.variables!.map((v) => [v.name, v.unit]), [
    ["Pixel count", "pixels"], ["Shape error", ""], ["Length-surface ratio", ""], ["Surface area", "mm²"],
    ["Length", "mm"], ["Width", "mm"], ["Orientation angle", "°"], ["Fluorescence protein ratio", ""],
  ]);
  assert.ok(t.variables!.every((v) => v.entity === "Seed" && v.method === "Boxeed 2.0 image analysis"));
  assert.equal(t.measurements!.length, 6 * 8);
  assert.deepEqual(t.measurements!.find((m) => m.object === "rfp source-5" && m.variable === "Pixel count")?.value, "2133.5");
});

test("parse: without the average file, or without the time in its name, the message says what to do", () => {
  assert.throws(() => plugin.parse(new Map([["RFP sort-2025-12-05-11-20-45.csv", Buffer.from(sample)]])), /average_/);
  assert.throws(() => plugin.parse(files("average_RFP sort.csv")), /time of the sort/);
});
