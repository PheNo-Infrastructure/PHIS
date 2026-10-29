// A Boxeed 2.0 (Labdeers) seed sort, as its export zip holds it: `average_<sort>-<YYYY-MM-DD-HH-mm-ss>.csv` — one row per
// seed, the mean of its three photos —
//   Pick ID, Pick description, Pass ID, Pass description, <trait columns…>
// (next to the raw one-row-per-photo CSV and the photos, which are not read). The seeds have no ids and the file has no
// germplasm or factors: a seed is named after its sample and row, and the time is the one in the file name.
import { parseCsv } from "../files.ts";
import type { Files, InstrumentPlugin, TrialData } from "../plugins.ts";

const SIGNATURE = ["Pick ID", "Pass ID", "SSE", "LS Ratio", "FP ratio"];
const IDENTIFYING = new Set(["Pick ID", "Pick description", "Pass ID", "Pass description", "Type", "Photo name"]);
const METHOD = "Boxeed 2.0 image analysis";
const WHEN = /(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})(?=\.csv$)/i;

// What each trait column is, by its header. A column not listed here is left out (the plugin only maps what it knows).
const TRAITS: Record<string, { characteristic: string; unit: string }> = {
  "Pixel count": { characteristic: "Pixel count", unit: "pixels" },
  SSE: { characteristic: "Shape error", unit: "" },
  "LS Ratio": { characteristic: "Length-surface ratio", unit: "" },
  Surface: { characteristic: "Surface area", unit: "mm²" },
  Length: { characteristic: "Length", unit: "mm" },
  Width: { characteristic: "Width", unit: "mm" },
  "Axes angle": { characteristic: "Orientation angle", unit: "°" },
  "FP ratio": { characteristic: "Fluorescence protein ratio", unit: "" },
};

const csvs = (files: Files) => [...files].filter(([path]) => path.toLowerCase().endsWith(".csv"))
  .map(([path, bytes]) => ({ path, rows: parseCsv(bytes.toString("utf8")) }))
  .filter((c) => c.rows.length > 0 && SIGNATURE.every((h) => h in c.rows[0]));
const isAverage = (path: string) => path.split("/").pop()!.toLowerCase().startsWith("average_");

const plugin: InstrumentPlugin = {
  key: "boxeed",
  label: "Boxeed 2.0 (Labdeers seed sort)",

  detect: (files) => csvs(files).length > 0,

  parse(files): TrialData {
    const file = csvs(files).find((c) => isAverage(c.path));
    if (!file) throw new Error("This looks like a Boxeed export, but it has no average_*.csv (one row per seed). Upload the zip from Boxeed as it is.");
    const base = file.path.split("/").pop()!.replace(/^average_/i, "");
    const when = WHEN.exec(base);
    if (!when) throw new Error(`The time of the sort isn't in the file name "${base}" (…-2025-12-05-11-20-45.csv). Keep the name Boxeed gave the file.`);
    const date = `${when[1]}T${when[2]}:${when[3]}:${when[4]}`;

    const columns = Object.keys(file.rows[0]).filter((c) => !IDENTIFYING.has(c) && c in TRAITS);
    const pad = String(file.rows.length).length;
    const names = file.rows.map((r, i) => `${r["Pick description"] || "Seed"}-${String(i + 1).padStart(pad, "0")}`);

    const variables = columns.map((c) => ({ name: TRAITS[c].characteristic, entity: "Seed", characteristic: TRAITS[c].characteristic, method: METHOD, unit: TRAITS[c].unit, description: `Boxeed column "${c}".` }));
    const measurements: NonNullable<TrialData["measurements"]> = [];
    file.rows.forEach((r, i) => columns.forEach((c, k) => {
      if (r[c] !== "") measurements.push({ object: names[i], variable: variables[k].name, date, value: r[c] });
    }));

    return {
      experiment: { name: `${base.slice(0, when.index).replace(/-$/, "")} – Boxeed – ${when[1]}`, startDate: when[1] },
      objects: names.map((name) => ({ name, rdfType: "vocabulary:Seed", factors: {} })),
      variables, measurements,
      // ponytail: the file name has no time zone; the sorter is in Norway. Shown in the plan.
      timezone: "Europe/Oslo", source: "Boxeed", warnings: [],
    };
  },
};
export default plugin;
