// TraitFinder (PlantEye) export: a ZIP with
//  - the design manifest (e.g. PBar1x4_Metadata.csv): Unit, Block, Column, Row, PlantID, Genotype,
//    G_alias, Replicate, GroupID — one row per plant; authoritative for plants, germplasm, factors;
//  - an observation sheet (…_PHIS.csv): Block, Column, Row, Timestamp, Plant_ID, Germplasm, … traits.
// The two name plants differently (PB001 vs PB_1), so they're joined on position (Block/Column/Row).
// A Block is a tray of plants (the scanner images one tray at a time): it becomes a Tray object the
// plants are part of, the Column their position in it. G_alias is the variety's code (Olve = G5).
// Observations aren't imported yet (stage 2); the sheet is read for the start date, the experiment
// name, and to warn where it disagrees with the manifest.
import { parseCsv } from "../files.ts";
import type { Files, InstrumentPlugin, TrialData } from "../plugins.ts";
import { TRAY } from "../ontology.ts";

const MANIFEST_COLUMNS = ["Block", "Column", "Row", "PlantID", "Genotype", "Replicate", "GroupID"];
const SHEET_COLUMNS = ["Block", "Column", "Row", "Timestamp", "Plant_ID", "Germplasm"];
const FACTORS = ["Replicate", "GroupID"];

type Csv = { path: string; rows: Record<string, string>[] };
function csvsWith(files: Files, columns: string[]): Csv[] {
  const out: Csv[] = [];
  for (const [path, bytes] of files) {
    if (!path.toLowerCase().endsWith(".csv")) continue;
    const rows = parseCsv(bytes.toString("utf8"));
    if (rows.length && columns.every((c) => c in rows[0])) out.push({ path, rows });
  }
  return out;
}
const baseName = (path: string) => path.split("/").pop()!.replace(/\.csv$/i, "");
const position = (r: Record<string, string>) => `${Number(r.Block)}|${Number(r.Column)}|${Number(r.Row)}`;

const plugin: InstrumentPlugin = {
  key: "traitfinder",
  label: "TraitFinder (PlantEye)",

  detect: (files) => csvsWith(files, MANIFEST_COLUMNS).length > 0 || csvsWith(files, SHEET_COLUMNS).length > 0,

  parse(files): TrialData {
    const [manifest] = csvsWith(files, MANIFEST_COLUMNS);
    if (!manifest) {
      throw new Error("This TraitFinder export has no design manifest (a CSV with PlantID, Genotype, Replicate and GroupID). Add it to the ZIP: it says which plant is which germplasm.");
    }
    // Several sheets can hold the same data (Clean/Messy/PHIS) — the PHIS one is made for this.
    const sheets = csvsWith(files, SHEET_COLUMNS);
    const sheet = sheets.find((s) => /phis/i.test(baseName(s.path))) ?? sheets[0];

    const warnings: string[] = [];
    const byPosition = new Map(manifest.rows.map((r) => [position(r), r]));
    const seen = new Set<string>();
    const trayOf = (r: Record<string, string>) => `Tray ${Number(r.Block)}`;
    const plants = manifest.rows.map((r) => {
      if (seen.has(r.PlantID)) warnings.push(`The design manifest lists plant ${r.PlantID} more than once.`);
      seen.add(r.PlantID);
      return {
        name: r.PlantID,
        rdfType: "vocabulary:Plant",
        ...(r.Genotype ? { germplasm: r.Genotype } : {}),
        factors: Object.fromEntries(FACTORS.filter((f) => r[f]).map((f) => [f, r[f]])),
        parent: trayOf(r),
        position: Number(r.Column),
      };
    });
    const trays = [...new Set(manifest.rows.map(trayOf))].map((name) => ({ name, rdfType: TRAY, factors: {} }));
    if (new Set(manifest.rows.map((r) => Number(r.Row))).size > 1) warnings.push("The trays have more than one row of plants; a plant's position in its tray records only its column.");
    const objects = [...trays, ...plants];

    // A variety's code, from the manifest (like its germplasm: the sheet's names can be wrong while its
    // codes are right — seen in PBar1x4). One given two codes gets none (the scientist decides).
    const codes = new Map<string, Set<string>>();
    const addCode = (name?: string, code?: string) => { if (name && code) (codes.get(name) ?? codes.set(name, new Set()).get(name)!).add(code.trim()); };
    for (const r of manifest.rows) addCode(r.Genotype, r.G_alias);
    const germplasmCodes: Record<string, string> = {};
    for (const [name, set] of codes) {
      if (set.size === 1) germplasmCodes[name] = [...set][0];
      else warnings.push(`The design manifest gives ${name} ${set.size} codes (${[...set].join(", ")}), so no code is set for it.`);
    }

    const dates = (sheet?.rows ?? []).map((r) => r.Timestamp.slice(0, 10)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (sheet) {
      // Where the sheet names a different germplasm than the manifest for the same position.
      const clashes = new Map<string, string[]>();
      const unplaced = new Set<string>();
      for (const r of sheet.rows) {
        const m = byPosition.get(position(r));
        if (!m) { unplaced.add(`${r.Block}/${r.Column}/${r.Row}`); continue; }
        if (r.Germplasm && m.Genotype && r.Germplasm !== m.Genotype) {
          const day = r.Timestamp.slice(0, 10);
          (clashes.get(day) ?? clashes.set(day, []).get(day)!).push(`${m.PlantID}: sheet says ${r.Germplasm}, manifest says ${m.Genotype}`);
        }
      }
      for (const [day, list] of clashes) warnings.push(`On ${day} the observation sheet names different germplasm than the design manifest (${list.join("; ")}). The manifest is used.`);
      if (unplaced.size) warnings.push(`The observation sheet has positions the design manifest doesn't (Block/Column/Row ${[...unplaced].slice(0, 5).join(", ")}${unplaced.size > 5 ? ", …" : ""}).`);
    }

    const prefix = baseName(sheet?.path ?? manifest.path).split(/_TraitFinder|_Metadata/i)[0];
    const startDate = dates[0] ?? new Date().toISOString().slice(0, 10);
    return { experiment: { name: `${prefix} – TraitFinder – ${startDate}`, startDate }, objects, germplasmCodes, warnings };
  },
};
export default plugin;
