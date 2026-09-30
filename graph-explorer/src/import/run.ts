// The shared import engine, step 3: write what the plan showed, in dependency order —
// experiment -> germplasm -> factors (+ levels) -> scientific objects with their germplasm and
// factor levels (both live on the object's copy in the experiment, so they're sent on creation).
import { OpenSilexError, authedGet, authedPost } from "../opensilex.ts";
import { prepare } from "./plan.ts";
import type { Files } from "./plugins.ts";

const enc = encodeURIComponent;
const firstUri = (r: { result: unknown }) => String([r.result].flat()[0]);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function runImport(files: Files, choices: { species?: string }) {
  const { trial, plan } = await prepare(files);

  // Everything that would stop the import is checked before the first write.
  const blockers: string[] = [];
  if (plan.experiment.exists) blockers.push(`An experiment named "${plan.experiment.name}" already exists in PHIS.`);
  for (const a of plan.germplasm.ambiguous) blockers.push(`"${a.name}" matches ${a.ids.length} germplasm in PHIS, so it isn't clear which one is meant.`);
  if (plan.germplasm.missing.length && !plan.speciesOptions.some((o) => o.id === choices.species)) blockers.push("Choose the species for the new germplasm.");
  if (blockers.length) throw new OpenSilexError(409, blockers.join(" "));

  const done = { experiment: "", germplasm: 0, factors: 0, objects: 0 };
  try {
    done.experiment = firstUri(await authedPost("/core/experiments", {
      name: plan.experiment.name,
      start_date: plan.experiment.startDate,
      objective: `Imported from a ${plan.instrument} export.`,
    }));

    const germplasm = new Map(plan.germplasm.existing.map((g) => [g.name, g.id]));
    for (const name of plan.germplasm.missing) {
      // ponytail: new germplasm are always varieties; let the plugin say so per instrument once one
      // brings accessions or lines.
      germplasm.set(name, firstUri(await authedPost("/core/germplasm", { name, rdf_type: "vocabulary:Variety", species: choices.species })));
      done.germplasm++;
    }

    const levels = new Map<string, string>(); // "factor|level" -> uri
    for (const f of plan.factors) {
      const id = firstUri(await authedPost("/core/experiments/factors", { name: f.name, experiment: done.experiment, levels: f.levels.map((name) => ({ name })) }));
      done.factors++;
      for (const l of (await authedGet(`/core/experiments/factors/${enc(id)}/levels`)).result) levels.set(`${f.name}|${l.name}`, l.uri);
    }

    // ponytail: one POST per object (no batch endpoint in this OpenSILEX) — ~100 in a few seconds.
    for (const o of trial.objects) {
      const relations = [
        ...(o.germplasm ? [{ property: "vocabulary:hasGermplasm", value: germplasm.get(o.germplasm), inverse: false }] : []),
        ...Object.entries(o.factors).map(([f, l]) => ({ property: "vocabulary:hasFactorLevel", value: levels.get(`${f}|${l}`), inverse: false })),
      ];
      await authedPost("/core/scientific_objects", { name: o.name, rdf_type: o.rdfType, experiment: done.experiment, relations });
      done.objects++;
    }
  } catch (err) {
    const what = done.experiment
      ? `It had created the experiment, ${plural(done.germplasm, "new germplasm", "new germplasm")}, ${done.factors} of ${plan.factors.length} factors and ${done.objects} of ${trial.objects.length} scientific objects. To start over, delete the experiment "${plan.experiment.name}" (new germplasm stays and is reused next time).`
      : "Nothing was written.";
    throw new OpenSilexError(err instanceof OpenSilexError ? err.status : 502, `The import stopped part-way: ${err instanceof Error ? err.message : String(err)}. ${what}`);
  }
  return {
    experiment: { id: done.experiment, type: "experiment", label: plan.experiment.name },
    created: { germplasm: done.germplasm, factors: done.factors, objects: done.objects },
  };
}
