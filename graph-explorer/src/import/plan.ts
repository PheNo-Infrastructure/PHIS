// The shared import engine, step 1: the reviewable plan. Whatever the instrument, its TrialData is
// matched against PHIS by name and summarised as "exists / will be created / needs a choice" —
// nothing is written here.
import { OpenSilexError, authedGet, authedGetOne, escapeRegex } from "../opensilex.ts";
import { instrumentPlugins, type Files } from "./plugins.ts";
import { POSITION_IN_TRAY, missingTerms } from "./ontology.ts";
import { resolveVariables } from "./variables.ts";
import { checkMeasurements } from "./measurements.ts";
import { compareObjects, newValues, readExperiment, valuesIn, type Experiment } from "./existing.ts";

const enc = encodeURIComponent;
// How many existing objects get each kind of detail added: "tray", "position", "germplasm", "factor level".
function fillWhat(fills: Awaited<ReturnType<typeof compareObjects>>["fills"]) {
  return {
    tray: fills.filter((f) => f.parent).length, position: fills.filter((f) => f.position !== undefined).length,
    germplasm: fills.filter((f) => f.germplasm).length, levels: fills.filter((f) => f.levels.length).length,
  };
}
const byNumberThenText = (a: string, b: string) => (Number(a) - Number(b)) || a.localeCompare(b);

// Plan and run both start here, so what is written is exactly what was shown.
export async function prepare(files: Files) {
  const plugins = await instrumentPlugins();
  const plugin = plugins.find((p) => p.detect(files));
  if (!plugin) {
    throw new OpenSilexError(400, `None of the known instruments recognises these files (${plugins.map((p) => p.label).join(", ")}).`);
  }
  let trial;
  try {
    trial = plugin.parse(files);
  } catch (err) {
    throw new OpenSilexError(400, err instanceof Error ? err.message : String(err));
  }

  // OpenSILEX's name filters match parts of names, so exact (case-insensitive) matching is done here.
  const same = (a: unknown, b: string) => String(a ?? "").toLowerCase() === b.toLowerCase();
  // OpenSILEX's name filters are regexes, so names are escaped ("Tiril (G16)" is a name, not a pattern).
  // An experiment of the same name is filled in (existing.ts); two of them can't be told apart.
  const sameName = (await authedGet(`/core/experiments?name=${enc(escapeRegex(trial.experiment.name))}&page_size=50`)).result
    .filter((e) => same(e.name, trial.experiment.name));
  const experiment: Experiment | null = sameName.length === 1 ? await readExperiment(String(sameName[0].uri)) : null;

  const germplasmNames = [...new Set(trial.objects.map((o) => o.germplasm).filter((g): g is string => !!g))];
  const existing: { name: string; id: string }[] = [];
  const missing: string[] = [];
  const ambiguous: { name: string; ids: string[] }[] = [];
  await Promise.all(germplasmNames.map(async (name) => {
    const hits = (await authedGet(`/core/germplasm?name=${enc(escapeRegex(name))}&page_size=50`)).result.filter((g) => same(g.name, name));
    if (hits.length === 1) existing.push({ name, id: hits[0].uri });
    else if (hits.length) ambiguous.push({ name, ids: hits.map((g) => g.uri) });
    else missing.push(name);
  }));
  // New germplasm needs a species; the user picks one of PHIS's.
  const speciesOptions = missing.length
    ? (await authedGet(`/core/germplasm?rdf_type=${enc("vocabulary:Species")}&page_size=500`)).result.map((s) => ({ id: s.uri, label: String(s.name ?? s.uri) }))
    : [];

  // Codes (G_alias): set where the germplasm has none in PHIS; an existing different code is kept.
  const codes = trial.germplasmCodes ?? {};
  const setCodes: { name: string; code: string }[] = [];
  const keptCodes: { name: string; code: string; inPhis: string }[] = [];
  await Promise.all(existing.filter((g) => codes[g.name]).map(async (g) => {
    const inPhis = String((await authedGetOne(`/core/germplasm/${enc(g.id)}`)).result.code ?? "").trim();
    if (!inPhis) setCodes.push({ name: g.name, code: codes[g.name] });
    else if (inPhis !== codes[g.name]) keptCodes.push({ name: g.name, code: codes[g.name], inPhis });
  }));
  for (const name of missing) if (codes[name]) setCodes.push({ name, code: codes[name] });
  setCodes.sort((a, b) => a.name.localeCompare(b.name));
  const warnings = [...trial.warnings, ...keptCodes.map((k) => `${k.name} already has the code ${k.inPhis} in PHIS; the file's ${k.code} isn't used.`)];

  // Vocabulary the objects need that this PHIS lacks (a Tray type, a plant's position) — added first.
  const needed = new Set(trial.objects.map((o) => o.rdfType));
  if (trial.objects.some((o) => o.position !== undefined)) needed.add(POSITION_IN_TRAY);
  const vocabulary = await missingTerms(needed);
  const parents = new Set(trial.objects.map((o) => o.parent).filter(Boolean)); // the sample shows what is measured, not trays
  const newObjects = trial.objects.filter((o) => !experiment?.objects.has(o.name));
  const kinds = new Map<string, number>();
  for (const o of newObjects) kinds.set(o.rdfType, (kinds.get(o.rdfType) ?? 0) + 1);
  const germplasmIds = new Map(existing.map((g) => [g.name, g.id]));
  const compared = experiment ? await compareObjects(trial.objects, experiment, germplasmIds) : { fills: [], conflicts: [] };

  const variables = await resolveVariables(trial.variables ?? []);
  const measurements = checkMeasurements(trial.measurements ?? []);
  // In an existing experiment, values PHIS already has (same object, variable and time) aren't written again.
  const timezone = trial.timezone ?? "UTC";
  const against = experiment && measurements.values.length
    ? newValues(measurements.values, await valuesIn(experiment, new Map(variables.existing.map((v) => [v.name, v.id])), timezone))
    : { fresh: measurements.values, already: 0, differ: [] as string[] };

  const levels = new Map<string, Set<string>>();
  for (const o of trial.objects) for (const [f, l] of Object.entries(o.factors)) (levels.get(f) ?? levels.set(f, new Set()).get(f)!).add(l);

  const plan = {
    instrument: plugin.label,
    experiment: { ...trial.experiment, exists: !!experiment, ...(sameName.length > 1 ? { sameName: sameName.length } : {}) },
    germplasm: {
      existing: existing.sort((a, b) => a.name.localeCompare(b.name)),
      missing: missing.sort(),
      ambiguous,
      codes: setCodes,
    },
    speciesOptions,
    factors: [...levels].map(([name, set]) => {
      const inPhis = experiment?.factors.find((f) => same(f.name, name));
      const all = [...set].sort(byNumberThenText);
      return { name, levels: all, ...(inPhis ? { exists: true, newLevels: all.filter((l) => !inPhis.levels.some((x) => same(x.name, l))) } : {}) };
    }),
    vocabulary,
    variables: {
      existing: variables.existing.map((v) => v.name),
      missing: variables.missing.map((v) => v.name),
      parts: variables.create.map((p) => ({ kind: p.kind, name: p.name, ...(p.symbol ? { symbol: p.symbol } : {}) })),
    },
    measurements: {
      ...measurements.summary, count: against.fresh.length, timezone: trial.timezone ?? null,
      ...(experiment ? { alreadyInPhis: against.already, differ: { count: against.differ.length, examples: against.differ.slice(0, 3) } } : {}),
    },
    // ponytail: the type's name is the end of its uri (vocabulary:Plant, …#Tray) — fine for these two.
    objects: {
      count: newObjects.length,
      kinds: [...kinds].map(([type, count]) => ({ type: type.split(/[#:]/).pop()!.toLowerCase(), count })),
      sample: newObjects.filter((o) => !parents.has(o.name)).slice(0, 5),
      ...(experiment ? {
        existing: trial.objects.length - newObjects.length,
        fills: { count: compared.fills.length, what: fillWhat(compared.fills) },
        conflicts: { count: compared.conflicts.length, examples: compared.conflicts.slice(0, 3) },
      } : {}),
    },
    warnings,
  };
  return { trial, plan, variables, values: against.fresh, experiment, fills: compared.fills };
}

export async function buildPlan(files: Files) {
  return (await prepare(files)).plan;
}
