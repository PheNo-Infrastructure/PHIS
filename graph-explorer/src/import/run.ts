// The shared import engine, step 3: write what the plan showed, in dependency order —
// vocabulary -> experiment -> germplasm (+ codes) -> factors (+ levels) -> scientific objects,
// containers (trays) before what is part of them, each with its germplasm, factor levels, parent
// and position (all live on the object's copy in the experiment, so they're sent on creation).
import { OpenSilexError, authedGet, authedGetOne, authedPost, authedPut } from "../opensilex.ts";
import { NODE_TYPES, updatePayloadFromDto } from "../node-types.ts";
import { POSITION_IN_TRAY, addTerm } from "./ontology.ts";
import { prepare } from "./plan.ts";
import type { Files } from "./plugins.ts";

const enc = encodeURIComponent;
const OBJECTS_AT_ONCE = 4;
const firstUri = (r: { result: unknown }) => String([r.result].flat()[0]);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// `progress` is called after each write (never before the checks pass), so a caller can show it.
export type Progress = { step: string; done: number; total: number };
export async function runImport(files: Files, choices: { species?: string }, progress: (p: Progress) => void = () => {}) {
  const { trial, plan } = await prepare(files);

  // Everything that would stop the import is checked before the first write.
  const blockers: string[] = [];
  if (plan.experiment.exists) blockers.push(`An experiment named "${plan.experiment.name}" already exists in PHIS.`);
  for (const a of plan.germplasm.ambiguous) blockers.push(`"${a.name}" matches ${a.ids.length} germplasm in PHIS, so it isn't clear which one is meant.`);
  if (plan.germplasm.missing.length && !plan.speciesOptions.some((o) => o.id === choices.species)) blockers.push("Choose the species for the new germplasm.");
  if (blockers.length) throw new OpenSilexError(409, blockers.join(" "));

  const done = { vocabulary: 0, experiment: "", germplasm: 0, codes: 0, factors: 0, objects: 0 };
  const codeOf = new Map(plan.germplasm.codes.map((c) => [c.name, c.code]));
  const existingCodes = plan.germplasm.existing.filter((g) => codeOf.has(g.name));
  const total = plan.vocabulary.length + 1 + plan.germplasm.missing.length + existingCodes.length + plan.factors.length + trial.objects.length;
  let steps = 0;
  const tick = (step: string) => progress({ step, done: ++steps, total });
  try {
    for (const term of plan.vocabulary) {
      await addTerm(term.uri);
      done.vocabulary++;
      tick(`Added ${term.label} to PHIS`);
    }

    done.experiment = firstUri(await authedPost("/core/experiments", {
      name: plan.experiment.name,
      start_date: plan.experiment.startDate,
      objective: `Imported from a ${plan.instrument} export.`,
      // Public, or nobody but this app's account sees it in PHIS (OpenSILEX defaults to private).
      is_public: true,
    }));
    tick("Created the experiment");

    const germplasm = new Map(plan.germplasm.existing.map((g) => [g.name, g.id]));
    for (const name of plan.germplasm.missing) {
      // ponytail: new germplasm are always varieties; let the plugin say so per instrument once one
      // brings accessions or lines.
      germplasm.set(name, firstUri(await authedPost("/core/germplasm", { name, rdf_type: "vocabulary:Variety", species: choices.species, is_public: true, ...(codeOf.has(name) ? { code: codeOf.get(name) } : {}) })));
      done.germplasm++;
      tick(`Creating germplasm: ${done.germplasm} of ${plan.germplasm.missing.length}`);
    }

    // An existing germplasm's code: its whole record goes back (the PUT replaces it), with the code.
    for (const g of existingCodes) {
      const dto = (await authedGetOne(`/core/germplasm/${enc(g.id)}`)).result;
      await authedPut("/core/germplasm", { ...updatePayloadFromDto(g.id, String(dto.name ?? g.name), dto, NODE_TYPES.germplasm), code: codeOf.get(g.name) });
      done.codes++;
      tick(`Setting variety codes: ${done.codes} of ${existingCodes.length}`);
    }

    const levels = new Map<string, string>(); // "factor|level" -> uri
    for (const f of plan.factors) {
      const id = firstUri(await authedPost("/core/experiments/factors", { name: f.name, experiment: done.experiment, levels: f.levels.map((name) => ({ name })) }));
      done.factors++;
      tick(`Creating factors: ${done.factors} of ${plan.factors.length}`);
      for (const l of (await authedGet(`/core/experiments/factors/${enc(id)}/levels`)).result) levels.set(`${f.name}|${l.name}`, l.uri);
    }

    // One POST per object (no batch endpoint in this OpenSILEX), OBJECTS_AT_ONCE in flight: each costs
    // OpenSILEX ~0.5-1 CPU-s, and with no CPU limit 4-5 at a time is ~2x faster; more gains nothing
    // on the 4-vCPU node (measured 2026-09-30). A failure stops the next batch.
    // Containers first, so a plant's tray has a uri when the plant is sent.
    const objectUri = new Map<string, string>();
    const write = async (o: (typeof trial.objects)[number]) => {
      const relations = [
        ...(o.germplasm ? [{ property: "vocabulary:hasGermplasm", value: germplasm.get(o.germplasm), inverse: false }] : []),
        ...Object.entries(o.factors).map(([f, l]) => ({ property: "vocabulary:hasFactorLevel", value: levels.get(`${f}|${l}`), inverse: false })),
        ...(o.parent ? [{ property: "vocabulary:isPartOf", value: objectUri.get(o.parent), inverse: false }] : []),
        ...(o.position !== undefined ? [{ property: POSITION_IN_TRAY, value: String(o.position), inverse: false }] : []),
      ];
      objectUri.set(o.name, firstUri(await authedPost("/core/scientific_objects", { name: o.name, rdf_type: o.rdfType, experiment: done.experiment, relations })));
      done.objects++;
      tick(`Creating scientific objects: ${done.objects} of ${trial.objects.length}`);
    };
    for (const pass of [trial.objects.filter((o) => !o.parent), trial.objects.filter((o) => o.parent)]) {
      for (let i = 0; i < pass.length; i += OBJECTS_AT_ONCE) await Promise.all(pass.slice(i, i + OBJECTS_AT_ONCE).map(write));
    }
  } catch (err) {
    const what = done.experiment
      ? `It had created the experiment, ${plural(done.germplasm, "new germplasm", "new germplasm")}, ${done.factors} of ${plan.factors.length} factors and ${done.objects} of ${trial.objects.length} scientific objects. To start over, delete the experiment "${plan.experiment.name}" (new germplasm stays and is reused next time).`
      : done.vocabulary ? `Only ${plural(done.vocabulary, "vocabulary term")} ${done.vocabulary === 1 ? "was" : "were"} added to PHIS (kept, and reused next time).` : "Nothing was written.";
    throw new OpenSilexError(err instanceof OpenSilexError ? err.status : 502, `The import stopped part-way: ${err instanceof Error ? err.message : String(err)}. ${what}`);
  }
  return {
    experiment: { id: done.experiment, type: "experiment", label: plan.experiment.name },
    created: { germplasm: done.germplasm, codes: done.codes, factors: done.factors, objects: done.objects, vocabulary: done.vocabulary },
  };
}
