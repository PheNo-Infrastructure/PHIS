import { test } from "node:test";
import assert from "node:assert/strict";
import { meanSd, groupColumns, yRange, arrangeCharts, normaliseOverview, distributionMeans, histogram } from "../src/chart-math.js";

test("meanSd: mean and sample SD over the numbers present; one value has SD null; nothing gives null", () => {
  assert.deepEqual(meanSd([2, 4, 6]), { mean: 4, sd: 2, n: 3 });
  assert.deepEqual(meanSd([5, null, undefined as any]), { mean: 5, sd: null, n: 1 });
  assert.equal(meanSd([null, null]), null);
  assert.equal(meanSd([]), null);
});

test("groupColumns: per scan column over the plants that have a value then", () => {
  const plants = [{ values: [{ v: 1 }, { v: 3 }, null] }, { values: [{ v: 3 }, null, null] }];
  assert.deepEqual(groupColumns(plants, 3), [{ mean: 2, sd: Math.SQRT2, n: 2 }, { mean: 3, sd: null, n: 1 }, null]);
});

test("yRange: spans every number; a flat line still gets height", () => {
  assert.deepEqual(yRange([[1, 5], [3, null]]), { lo: 1, hi: 5 });
  assert.deepEqual(yRange([[7, 7]]), { lo: 6.5, hi: 7.5 });
  assert.deepEqual(yRange([[]]), { lo: 0, hi: 1 });
});

const P = (n: number) => ({ id: `p${n}`, label: `PB${n}` });
const ST = {
  truncated: false, variables: [],
  factors: [
    { id: "fg", label: "GroupID", unset: [], levels: [
      { id: "g1", type: "factor_level", label: "GroupID: 1", factor: "fg", plants: [P(1), P(2)] },
      { id: "g2", type: "factor_level", label: "GroupID: 2", factor: "fg", plants: [P(3)] } ] },
    { id: "fr", label: "Replicate", unset: [], levels: [
      { id: "r1", type: "factor_level", label: "Replicate: 1", factor: "fr", plants: [P(1), P(2), P(3)] } ] },
  ],
  other: [{ id: "t1", label: "Tray 31" }],
};
const v = (id: string) => ({ id, type: "variable", label: id });
const lvl = (id: string, factor: string, label: string) => ({ id, type: "factor_level", label, factor });
const plant = (n: number, vias?: string[]) => ({ id: `p${n}`, type: "scientific_object", label: `PB${n}`, ...(vias ? { vias } : {}) });

test("arrangeCharts: variables are listed in pick order; nothing chartable gives no rows", () => {
  const r = arrangeCharts([v("v2"), v("v1")], ST);
  assert.deepEqual(r.variables.map((x: any) => x.id), ["v2", "v1"]);
  assert.deepEqual(r.rows, []);
});

test("arrangeCharts: a picked factor is a row with a chart per level; its levels are not charted twice", () => {
  const r = arrangeCharts([{ id: "fg", type: "factor", label: "GroupID" }, lvl("g1", "fg", "GroupID: 1"), lvl("r1", "fr", "Replicate: 1")], ST);
  assert.deepEqual(r.rows.map((x: any) => [x.label, x.charts.map((c: any) => c.key)]), [["GroupID", ["g1", "g2"]], ["Replicate", ["r1"]]]);
  assert.deepEqual(r.rows[0].charts.map((c: any) => c.plantIds), [["p1", "p2"], ["p3"]]);
  assert.deepEqual(r.rows[0].charts.map((c: any) => c.colorIndex), [0, 1]);
});

test("arrangeCharts: plants picked inside an unpicked level overlay in that level's chart; inside a picked level they only get emphasis", () => {
  const r = arrangeCharts([plant(1, ["g1"]), plant(2, ["g1"]), plant(3, ["g2"]), lvl("g2", "fg", "GroupID: 2")], ST);
  const g = r.rows.find((x: any) => x.label === "GroupID")!;
  const g1 = g.charts.find((c: any) => c.key === "g1:picked")!;
  assert.deepEqual([g1.kind, g1.plantIds], ["picked", ["p1", "p2"]]);
  const g2 = g.charts.find((c: any) => c.key === "g2")!;
  assert.deepEqual([g2.kind, g2.plantIds, g2.emphasis], ["level", ["p3"], ["p3"]]);
});

test("arrangeCharts: standalone plants (list, A-Z, trays, unset) get their own chart in a Plants row, after the factor rows; a plant also inside a picked level appears in both", () => {
  const r = arrangeCharts([lvl("g1", "fg", "GroupID: 1"), plant(1, [""]), plant(2, ["#all"]), { id: "t1", type: "scientific_object", label: "Tray 31", vias: ["#other"] }], ST);
  assert.deepEqual(r.rows.map((x: any) => x.label), ["GroupID", "Plants"]);
  assert.deepEqual(r.rows[1].charts.map((c: any) => [c.kind, c.plantIds]), [["plant", ["p1"]], ["plant", ["p2"]], ["plant", ["t1"]]]);
  assert.deepEqual(r.rows[0].charts[0].emphasis, ["p1", "p2"], "bold inside the level they also belong to");
});

test("arrangeCharts: the same plant picked in two boxes (graph-only) is charted once per box", () => {
  const r = arrangeCharts([plant(1, ["g1", "r1"])], ST);
  assert.deepEqual(r.rows.map((x: any) => [x.label, x.charts.map((c: any) => c.plantIds)]), [["GroupID", [["p1"]]], ["Replicate", [["p1"]]]]);
});

test("arrangeCharts: a pick with no vias is standalone; plants unknown to this experiment are reported", () => {
  const r = arrangeCharts([{ id: "zz", type: "scientific_object", label: "ZZ plant" }, plant(1)], ST);
  assert.deepEqual(r.rows[0].charts.map((c: any) => c.plantIds), [["p1"]], "p1 is in the experiment");
  assert.deepEqual(r.outside, ["ZZ plant"]);
});

test("normaliseOverview: every plant as % of its own first scan; no baseline (first value 0) means no values", () => {
  const out = normaliseOverview({ variable: { name: "H", unit: "mm" }, columns: [{}, {}, {}], plants: [
    { id: "a", values: [{ v: 10, at: "x" }, null, { v: 15, at: "y" }] },
    { id: "b", values: [null, { v: 4, at: "x" }, { v: 2, at: "y" }] },
    { id: "z", values: [{ v: 0, at: "x" }, { v: 3, at: "y" }, null] } ] } as any);
  assert.deepEqual(out.plants[0].values, [{ v: 100, at: "x" }, null, { v: 150, at: "y" }]);
  assert.deepEqual(out.plants[1].values, [null, { v: 100, at: "x" }, { v: 50, at: "y" }], "the first scan it HAS is the baseline");
  assert.deepEqual(out.plants[2].values, [null, null, null]);
  assert.equal(out.variable.unit, "% of first scan");
});

test("arrangeCharts: a picked variable group the experiment offers as a distribution is charted like a variable (in pick order, marked); one it doesn't offer is ignored", () => {
  const st = { ...ST, distributions: [{ id: "vg1", label: "NDVI distribution", bins: [] }] };
  const r = arrangeCharts([v("v1"), { id: "vg1", type: "variable_group", label: "NDVI distribution" }, { id: "vg9", type: "variable_group", label: "Other" }], st);
  assert.deepEqual(r.variables, [{ id: "v1", label: "v1" }, { id: "vg1", label: "NDVI distribution", kind: "distribution" }]);
});

test("distributionMeans: per scan, the mean share of each bin over the plants that have one; no plant then gives null", () => {
  const plants = [{ values: [[30, 70], [20, 80], null] }, { values: [[40, 60], null, null] }];
  assert.deepEqual(distributionMeans(plants, 3), [[35, 65], [20, 80], null]);
  assert.deepEqual(distributionMeans([], 2), [null, null]);
});

test("histogram: equal-width bins over the numbers present, the highest value in the last bin; flat or empty sets are handled", () => {
  assert.deepEqual(histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5), { lo: 0, hi: 10, counts: [2, 2, 2, 2, 3], n: 11 });
  assert.deepEqual(histogram([4, 4, 4]), { lo: 4, hi: 4, counts: [3], n: 3 });
  assert.deepEqual(histogram([2, null as any, "x" as any]), { lo: 2, hi: 2, counts: [1], n: 1 });
  assert.equal(histogram([]), null);
});

test("arrangeCharts: a crowd of single picks is one chart; a few stay one chart each", () => {
  const few = arrangeCharts([v("v1"), ...[1, 2, 3].map((n) => plant(n))], ST);
  assert.equal(few.rows[0].charts.length, 3);
  const all = Array.from({ length: 13 }, (_, i) => plant(i + 1, ["#all"]));
  const crowd = arrangeCharts([v("v1"), ...all], { ...ST, factors: [], other: all.map((p) => P(Number(p.label.slice(2)))) });
  assert.equal(crowd.rows.length, 1);
  assert.equal(crowd.rows[0].charts.length, 1);
  assert.deepEqual([crowd.rows[0].charts[0].title, crowd.rows[0].charts[0].sub, crowd.rows[0].charts[0].plantIds.length], ["Selected objects", "13 objects", 13]);
});
