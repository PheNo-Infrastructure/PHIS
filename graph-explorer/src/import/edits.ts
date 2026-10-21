// What the user changed in the review before confirming. Applied to the instrument's TrialData right
// after parsing, so the plan that is shown and the import that is written both see the same, edited
// data. Keys are always the FILE's own names, so editing twice just replaces the earlier edit.
import type { TrialData } from "./plugins.ts";

export type Edits = {
  experiment?: { name?: string; startDate?: string };
  germplasm?: Record<string, string>; // file's germplasm name -> new name
  factors?: Record<string, { name?: string; levels?: Record<string, string> }>; // file's factor -> new name, and its levels' new names
  variables?: Record<string, string>; // file's variable name -> new name
};

// A message meant for the person editing: the route answers it as a 400.
export class EditError extends Error {}

const isStringMap = (x: unknown): x is Record<string, string> =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x).every((v) => typeof v === "string");

// The page sends the edits as URL-encoded JSON in a header.
export function parseEdits(raw: string | undefined): Edits {
  if (!raw) return {};
  const unreadable = () => new EditError("The edits could not be read; reload the page and try again.");
  let e: any;
  try { e = JSON.parse(decodeURIComponent(raw)); } catch { throw unreadable(); }
  if (!e || typeof e !== "object" || Array.isArray(e)) throw unreadable();
  const factors = e.factors ?? {};
  if ((e.germplasm !== undefined && !isStringMap(e.germplasm)) || (e.variables !== undefined && !isStringMap(e.variables))
    || (e.experiment !== undefined && (typeof e.experiment !== "object" || Object.values(e.experiment).some((v) => typeof v !== "string")))
    || typeof factors !== "object" || Object.values(factors).some((f: any) => !f || typeof f !== "object" || (f.name !== undefined && typeof f.name !== "string") || (f.levels !== undefined && !isStringMap(f.levels)))) throw unreadable();
  return e;
}

// The names the files hold, which are what the page keys its edits by.
export function namesIn(trial: TrialData) {
  const levels = new Map<string, Set<string>>();
  for (const o of trial.objects) for (const [f, l] of Object.entries(o.factors)) (levels.get(f) ?? levels.set(f, new Set()).get(f)!).add(l);
  return {
    germplasm: [...new Set(trial.objects.map((o) => o.germplasm).filter((g): g is string => !!g))],
    factors: [...levels].map(([name, set]) => ({ name, levels: [...set] })),
    variables: (trial.variables ?? []).map((v) => v.name),
  };
}

const clean = (value: string, what: string) => {
  const v = value.trim();
  if (!v) throw new EditError(`The ${what} can't be empty.`);
  return v;
};

// original name -> final name, for every name in `all` (edited or not); refuses unknown names and two things ending up with one name.
function rename(all: string[], changes: Record<string, string> | undefined, kind: string, plural: string, owner = ""): Map<string, string> {
  const out = new Map(all.map((n) => [n, n]));
  for (const [from, to] of Object.entries(changes ?? {})) {
    if (!out.has(from)) throw new EditError(`The file has no ${kind} "${from}"${owner}.`);
    out.set(from, clean(to, `${kind} name`));
  }
  const seen = new Set<string>();
  for (const name of out.values()) {
    if (seen.has(name)) throw new EditError(`Two ${plural}${owner} would both be called "${name}".`);
    seen.add(name);
  }
  return out;
}

export function applyEdits(trial: TrialData, edits: Edits | undefined): TrialData {
  if (!edits || !Object.keys(edits).length) return trial;
  const names = namesIn(trial);
  const out: TrialData = structuredClone(trial);

  if (edits.experiment?.name !== undefined) out.experiment.name = clean(edits.experiment.name, "experiment name");
  if (edits.experiment?.startDate !== undefined) {
    const d = edits.experiment.startDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new EditError("The start date must be written YYYY-MM-DD.");
    if (new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) throw new EditError(`The start date ${d} isn't a real date.`);
    out.experiment.startDate = d;
  }

  const germplasm = rename(names.germplasm, edits.germplasm, "germplasm", "germplasm");
  for (const o of out.objects) if (o.germplasm) o.germplasm = germplasm.get(o.germplasm)!;
  if (out.germplasmCodes) out.germplasmCodes = Object.fromEntries(Object.entries(out.germplasmCodes).map(([n, c]) => [germplasm.get(n) ?? n, c]));

  for (const f of Object.keys(edits.factors ?? {})) if (!names.factors.some((x) => x.name === f)) throw new EditError(`The file has no factor "${f}".`);
  const factorNames = rename(names.factors.map((f) => f.name), Object.fromEntries(Object.entries(edits.factors ?? {}).filter(([, v]) => v.name !== undefined).map(([k, v]) => [k, v.name!])), "factor", "factors");
  const levelNames = new Map(names.factors.map((f) => [f.name, rename(f.levels, edits.factors?.[f.name]?.levels, "level", "levels", ` of ${factorNames.get(f.name)}`)]));
  for (const o of out.objects) o.factors = Object.fromEntries(Object.entries(o.factors).map(([f, l]) => [factorNames.get(f)!, levelNames.get(f)!.get(l)!]));

  const variables = rename(names.variables, edits.variables, "variable", "variables");
  for (const v of out.variables ?? []) v.name = variables.get(v.name)!;
  for (const g of out.variableGroups ?? []) g.variables = g.variables.map((v) => variables.get(v) ?? v);
  for (const m of out.measurements ?? []) m.variable = variables.get(m.variable) ?? m.variable;
  return out;
}
