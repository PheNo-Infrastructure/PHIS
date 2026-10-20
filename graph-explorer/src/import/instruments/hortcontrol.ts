// A raw HortControl export from a Phenospex TraitFinder (PlantEye), exactly as HortControl writes it: one CSV,
// one row per plant and scan —
//   unit, timestamp, sensor, genotype, g_alias, treatment, <trait columns…>
// `unit` is block:column:row ("3:2:1"); a block is scanned as one (its plants share a timestamp) and its plants are
// cut out afterwards. Everything else a scientist knows (plant names, replicates) is not in the file.
// Trait columns are "Name unit" ("Digital Biomass mm³") or a histogram bin ("NDVI [0.15:0.3] %"); a histogram's
// bins sum to 100 % and become one variable each, grouped per index.
import { parseCsv } from "../files.ts";
import type { Files, InstrumentPlugin, TrialData } from "../plugins.ts";
import { BLOCK } from "../ontology.ts";

const IDENTIFYING = new Set(["unit", "timestamp", "sensor", "genotype", "g_alias", "treatment"]);
const UNIT = /\s+(mm²\/mm²|mm³|mm²|mm|%|°)$/;
const BIN = /^(\S+) \[(-?[\d.]+):(-?[\d.]+)\] %$/;
const UNIT_PARTS = /^(\d+):(\d+):(\d+)$/;
const ISO = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
const METHOD = "PlantEye 3D scan";
const FACTOR = "Treatment";

type Row = Record<string, string>;
const csvs = (files: Files) => [...files].filter(([path]) => path.toLowerCase().endsWith(".csv"))
  .map(([path, bytes]) => ({ path, rows: parseCsv(bytes.toString("utf8")) }));
const isExport = (rows: Row[]) => rows.length > 0 && ["unit", "timestamp", "sensor", "genotype"].every((c) => c in rows[0]);

// What is measured, by the words of the column. ponytail: an interim reading (the scientist's wording is still to be
// confirmed): leaf traits -> Leaf, colour and spectral indices and light penetration -> Canopy, the rest -> Plant.
const entityOf = (name: string) =>
  /^(3D Leaf|Projected Leaf|Leaf |Surface Angle)/.test(name) ? "Leaf"
  : /^(GLI|Hue|Lightness|NDVI|NPCI|PSRI|Saturation|Canopy)/.test(name) ? "Canopy"
  : "Plant";

function parseUnit(unit: string) {
  const m = UNIT_PARTS.exec(unit.trim());
  if (!m) throw new Error(`The unit "${unit}" isn't block:column:row (like 3:2:1). Export the file straight from HortControl.`);
  return { block: Number(m[1]), column: Number(m[2]), row: Number(m[3]) };
}

const plugin: InstrumentPlugin = {
  key: "hortcontrol",
  label: "TraitFinder (HortControl export)",

  detect: (files) => csvs(files).some((c) => isExport(c.rows)),

  parse(files): TrialData {
    const file = csvs(files).find((c) => isExport(c.rows))!;
    const rows = file.rows;
    const warnings: string[] = [];

    // Times are ISO in HortControl's own file; an edited file (Excel, US dates) can't be read without guessing day/month.
    const scans = rows.map((r) => {
      const m = ISO.exec(r.timestamp);
      if (!m) throw new Error(`The time "${r.timestamp}" isn't in HortControl's format (2025-11-25 08:42:23). Upload the export straight from HortControl — a file saved from Excel can swap day and month, so it isn't guessed.`);
      return `${m[1]}T${m[2]}`;
    });

    const units = rows.map((r) => ({ r, ...parseUnit(r.unit) }));
    const multiRow = units.some((u) => u.row > 1);
    if (multiRow) warnings.push("Some units have a row above 1. How rows lie in a block isn't known yet, so a plant's place in its block records only its column; the row is in the plant's name.");
    const plantName = (u: { block: number; column: number; row: number }) => `B${u.block}-C${u.column}${multiRow ? `-R${u.row}` : ""}`;

    // What one block or plant says about itself must agree across all its rows.
    const agreed = (rowsOf: Row[], key: string) => {
      const values = new Set(rowsOf.map((r) => r[key]).filter(Boolean));
      return values.size === 1 ? [...values][0] : undefined;
    };
    const hasTreatment = rows.some((r) => r.treatment);
    const factorsOf = (rowsOf: Row[], what: string) => {
      if (!hasTreatment) return {};
      const level = agreed(rowsOf, "treatment");
      if (!level) warnings.push(`${what} has more than one treatment (${[...new Set(rowsOf.map((r) => r.treatment))].join(", ")}), so it gets none.`);
      return level ? { [FACTOR]: level } : {};
    };

    const byBlock = Map.groupBy(units, (u) => u.block);
    const byPlant = Map.groupBy(units, plantName);
    const blocks = [...byBlock].sort((a, b) => a[0] - b[0]).map(([block]) => ({
      // A block carries no factor level: the portal lists a level's members as plants, and the plants have it.
      name: `Block ${block}`, rdfType: BLOCK, factors: {},
    }));
    const plants = [...byPlant].map(([name, us]) => {
      const germplasm = agreed(us.map((u) => u.r), "genotype");
      return {
        name, rdfType: "vocabulary:Plant", ...(germplasm ? { germplasm } : {}),
        factors: factorsOf(us.map((u) => u.r), `Plant ${name}`),
        parent: `Block ${us[0].block}`, position: us[0].column,
      };
    });

    // A variety's code is g_alias; a genotype with two codes gets none.
    const codes = new Map<string, Set<string>>();
    for (const r of rows) if (r.genotype && r.g_alias) (codes.get(r.genotype) ?? codes.set(r.genotype, new Set()).get(r.genotype)!).add(r.g_alias);
    const germplasmCodes: Record<string, string> = {};
    for (const [name, set] of codes) {
      if (set.size === 1) germplasmCodes[name] = [...set][0];
      else warnings.push(`The file gives ${name} ${set.size} codes (${[...set].join(", ")}), so no code is set for it.`);
    }

    // Trait columns, in the file's order.
    const columns = Object.keys(rows[0]).filter((c) => !IDENTIFYING.has(c.toLowerCase()));
    const groups = new Map<string, { lo: number; name: string }[]>();
    const variables = columns.map((column) => {
      const bin = BIN.exec(column);
      if (bin) {
        const name = column.replace(/ %$/, "");
        (groups.get(bin[1]) ?? groups.set(bin[1], []).get(bin[1])!).push({ lo: Number(bin[2]), name });
        return {
          name, entity: entityOf(bin[1]), characteristic: name, method: METHOD, unit: "%",
          description: `Share of the pixels in the ${bin[1]} range ${bin[2]} to ${bin[3]} (TraitFinder column "${column}"). bins=[${Number(bin[2])},${Number(bin[3])}]`,
        };
      }
      const name = column.replace(UNIT, "");
      return { name, entity: entityOf(name), characteristic: name, method: METHOD, unit: column.match(UNIT)?.[1] ?? "", description: `TraitFinder column "${column}".` };
    });
    const variableGroups = [...groups].map(([index, bins]) => ({ name: `${index} distribution`, variables: bins.sort((a, b) => a.lo - b.lo).map((b) => b.name) }));

    const measurements: NonNullable<TrialData["measurements"]> = [];
    units.forEach((u, i) => {
      const metadata = u.r.sensor ? { sensor: u.r.sensor } : undefined;
      for (let c = 0; c < columns.length; c++) measurements.push({ object: plantName(u), variable: variables[c].name, date: scans[i], value: u.r[columns[c]], ...(metadata ? { metadata } : {}) });
    });

    const base = file.path.split("/").pop()!.replace(/\.csv$/i, "");
    const startDate = scans.map((d) => d.slice(0, 10)).sort()[0];
    return {
      experiment: { name: `${base.split(/_TraitFinder/i)[0]} – TraitFinder – ${startDate}`, startDate },
      objects: [...blocks, ...plants], germplasmCodes, variables, variableGroups, measurements,
      // ponytail: the export has no time zone; the TraitFinder is in Norway. Shown in the plan.
      timezone: "Europe/Oslo", source: "TraitFinder", warnings,
    };
  },
};
export default plugin;
