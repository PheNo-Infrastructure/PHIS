// Which PHIS factor each factor of a file becomes. The rule is to REUSE: a factor already in PHIS is linked into the
// experiment instead of a second one being made, and a factor with a unit (its uri in exact_match, see node-types.ts)
// takes its levels as numbers only ("15C" -> 15). Nothing here writes; plan.ts shows the result and run.ts acts on it.
import { authedGet, authedGetOne, compactUri, escapeRegex } from "../opensilex.ts";
import { experimentsOfFactor } from "../experiment-factors.ts";
import { namesIn, type Edits } from "./edits.ts";
import type { Experiment } from "./existing.ts";
import type { TrialData } from "./plugins.ts";

const enc = encodeURIComponent;
const same = (a: unknown, b: string) => String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export type Unit = { id: string; name: string };
export type PhisFactor = { uri: string; name: string; levels: { uri: string; name: string; description?: string | null }[]; exact_match?: string[]; experiment: string };
// A factor chosen for a file factor: its levels and unit as PHIS has them now.
export type Reuse = { uri: string; name: string; unit: Unit | null; levels: string[]; usedBy: string[]; auto: boolean };
export type FactorChoice = {
  file: string; // the file's own name for it (the edits are keyed by it)
  reuse?: Reuse;
  newUnit?: Unit; // a NEW factor made with this unit
  parsed: [string, string][]; // file level -> number, only the ones that changed
  matches?: Reuse[]; // several PHIS factors share the name and none was picked
};

// "15C" -> "15", "15 °C" -> "15", "-2.5mm" -> "-2.5". Only a number followed by non-digits is read; "control", "10-20" and "15C/20C" stay as written.
export function levelNumber(level: string): string | null {
  const m = /^\s*([-+]?\d+(?:[.,]\d+)?)\s*([^\d]*)$/.exec(level);
  return m && m[2].trim() !== "" ? m[1] : null;
}

// Every unit in PHIS by compact uri (the factor DTO holds full or prefixed uris).
async function unitsByUri() {
  const out = new Map<string, Unit>();
  for (const u of (await authedGet("/core/units?page_size=500")).result) out.set(await compactUri(String(u.uri)), { id: String(u.uri), name: String(u.name ?? u.uri) });
  return out;
}
const unitOf = async (f: { exact_match?: string[] }, units: Map<string, Unit>): Promise<Unit | null> => {
  for (const m of f.exact_match ?? []) { const u = units.get(await compactUri(String(m))); if (u) return u; }
  return null;
};

async function toReuse(uri: string, units: Map<string, Unit>, auto: boolean): Promise<Reuse> {
  const f = (await authedGetOne(`/core/experiments/factors/${enc(uri)}`)).result as unknown as PhisFactor;
  const used = await experimentsOfFactor(String(f.uri)).catch(() => []);
  return { uri: String(f.uri), name: f.name, unit: await unitOf(f, units), levels: (f.levels ?? []).map((l) => l.name), usedBy: used.map((e) => e.name), auto };
}

// Decides every file factor. The page's edits say what the user picked (`use` = a PHIS factor's uri, `unit` = the unit of a new one,
// `fresh` = make a new one even if the name exists); without a pick, a factor already named so in the experiment is left to the
// existing fill, and a name that matches exactly ONE other factor in PHIS reuses it (said in the review). Several matches
// pick nothing: the import asks.
export async function chooseFactors(original: TrialData, edits: Edits | undefined, experiment: Experiment | null) {
  const choices: FactorChoice[] = [];
  const files = namesIn(original).factors;
  if (!files.length) return choices;
  const units = await unitsByUri();
  for (const { name, levels } of files) {
    const e = edits?.factors?.[name];
    const finalName = e?.name ?? name;
    const choice: FactorChoice = { file: name, parsed: [] };
    const inExperiment = experiment?.factors.some((f) => same(f.name, finalName));
    let unit: Unit | null = null;
    if (e?.use) {
      choice.reuse = await toReuse(e.use, units, false);
      unit = choice.reuse.unit;
    } else if (e?.unit) {
      const u = units.get(await compactUri(e.unit));
      if (!u) throw new Error(`"${e.unit}" is not a unit in PHIS.`);
      choice.newUnit = unit = u;
    } else if (!inExperiment && !e?.fresh) {
      const hits = (await authedGet(`/core/experiments/factors?name=${enc(escapeRegex(finalName))}&page_size=50`)).result.filter((f) => same(f.name, finalName));
      if (hits.length === 1) { choice.reuse = await toReuse(String(hits[0].uri), units, true); unit = choice.reuse.unit; }
      else if (hits.length) choice.matches = await Promise.all(hits.map((f) => toReuse(String(f.uri), units, false)));
    }
    if (unit) for (const l of levels) {
      if (e?.levels?.[l] !== undefined) continue; // the user's own name for this level wins
      const n = levelNumber(l);
      if (n !== null && n !== l) choice.parsed.push([l, n]);
    }
    choices.push(choice);
  }
  return choices;
}

// The factors a chooser can offer: name, unit and levels of every factor in PHIS.
export async function factorCatalogue() {
  const units = await unitsByUri();
  const all = (await authedGet("/core/experiments/factors?page_size=500")).result;
  const out: { id: string; label: string; unit: Unit | null; levels: string[]; usedBy: string[] }[] = [];
  for (let i = 0; i < all.length; i += 8) {
    out.push(...(await Promise.all(all.slice(i, i + 8).map(async (r) => {
      const f = (await authedGetOne(`/core/experiments/factors/${enc(String(r.uri))}`)).result as unknown as PhisFactor;
      const used = await experimentsOfFactor(String(f.uri)).catch(() => []); // the experiments, so two factors of one name can be told apart
      return { id: String(f.uri), label: f.name, unit: await unitOf(f, units), levels: (f.levels ?? []).map((l) => l.name), usedBy: used.map((x) => x.name) };
    }))));
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}
export async function unitList() {
  return [...(await unitsByUri()).values()].sort((a, b) => a.name.localeCompare(b.name));
}
