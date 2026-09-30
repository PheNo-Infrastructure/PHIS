// The shared import engine, step 1: the reviewable plan. Whatever the instrument, its TrialData is
// matched against PHIS by name and summarised as "exists / will be created / needs a choice" —
// nothing is written here.
import { OpenSilexError, authedGet } from "../opensilex.ts";
import { instrumentPlugins, type Files } from "./plugins.ts";

const enc = encodeURIComponent;
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
  const experimentExists = (await authedGet(`/core/experiments?name=${enc(trial.experiment.name)}&page_size=50`)).result
    .some((e) => same(e.name, trial.experiment.name));

  const germplasmNames = [...new Set(trial.objects.map((o) => o.germplasm).filter((g): g is string => !!g))];
  const existing: { name: string; id: string }[] = [];
  const missing: string[] = [];
  const ambiguous: { name: string; ids: string[] }[] = [];
  await Promise.all(germplasmNames.map(async (name) => {
    const hits = (await authedGet(`/core/germplasm?name=${enc(name)}&page_size=50`)).result.filter((g) => same(g.name, name));
    if (hits.length === 1) existing.push({ name, id: hits[0].uri });
    else if (hits.length) ambiguous.push({ name, ids: hits.map((g) => g.uri) });
    else missing.push(name);
  }));
  // New germplasm needs a species; the user picks one of PHIS's.
  const speciesOptions = missing.length
    ? (await authedGet(`/core/germplasm?rdf_type=${enc("vocabulary:Species")}&page_size=500`)).result.map((s) => ({ id: s.uri, label: String(s.name ?? s.uri) }))
    : [];

  const levels = new Map<string, Set<string>>();
  for (const o of trial.objects) for (const [f, l] of Object.entries(o.factors)) (levels.get(f) ?? levels.set(f, new Set()).get(f)!).add(l);

  const plan = {
    instrument: plugin.label,
    experiment: { ...trial.experiment, exists: experimentExists },
    germplasm: {
      existing: existing.sort((a, b) => a.name.localeCompare(b.name)),
      missing: missing.sort(),
      ambiguous,
    },
    speciesOptions,
    factors: [...levels].map(([name, set]) => ({ name, levels: [...set].sort(byNumberThenText) })),
    objects: { count: trial.objects.length, sample: trial.objects.slice(0, 5) },
    warnings: trial.warnings,
  };
  return { trial, plan };
}

export async function buildPlan(files: Files) {
  return (await prepare(files)).plan;
}
