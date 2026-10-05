// The shared import engine, step 3: write what the plan showed, in dependency order —
// vocabulary -> variables (+ their parts) -> experiment -> germplasm (+ codes) -> factors (+ levels) -> scientific objects,
// containers (trays) before what is part of them, each with its germplasm, factor levels, parent
// and position (all live on the object's copy in the experiment, so they're sent on creation)
// -> the measured values. Into an experiment that exists, the same order fills in only what PHIS
// lacks (existing.ts): new factors/levels/objects are created, existing objects get what they miss.
import { OpenSilexError, authedGet, authedGetOne, authedPost, authedPut } from "../opensilex.ts";
import { NODE_TYPES, saveLevels, updatePayloadFromDto } from "../node-types.ts";
import { POSITION_IN_TRAY, addTerm } from "./ontology.ts";
import { prepare } from "./plan.ts";
import { createPart, createVariable, type PartKind } from "./variables.ts";
import { VALUES_AT_ONCE, createProvenance, writeValues } from "./measurements.ts";
import { writeFill } from "./existing.ts";
import type { Files } from "./plugins.ts";

const enc = encodeURIComponent;
const OBJECTS_AT_ONCE = 4;
const firstUri = (r: { result: unknown }) => String([r.result].flat()[0]);
const PART_LABEL: Record<PartKind, string> = { entities: "entity", characteristics: "characteristic", methods: "method", units: "unit" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const andList = (items: (string | 0)[]) => {
  const xs = items.filter((x): x is string => !!x);
  return xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
};

// `progress` is called after each write (never before the checks pass), so a caller can show it.
export type Progress = { step: string; done: number; total: number };
export async function runImport(files: Files, choices: { species?: string }, progress: (p: Progress) => void = () => {}) {
  const { trial, plan, variables, values, experiment, fills } = await prepare(files);

  // Everything that would stop the import is checked before the first write.
  const blockers: string[] = [];
  if (plan.experiment.sameName) blockers.push(`${plan.experiment.sameName} experiments in PHIS are named "${plan.experiment.name}", so it isn't clear which one to fill in.`);
  for (const a of plan.germplasm.ambiguous) blockers.push(`"${a.name}" matches ${a.ids.length} germplasm in PHIS, so it isn't clear which one is meant.`);
  if (plan.germplasm.missing.length && !plan.speciesOptions.some((o) => o.id === choices.species)) blockers.push("Choose the species for the new germplasm.");
  if (blockers.length) throw new OpenSilexError(409, blockers.join(" "));

  const done = { vocabulary: 0, parts: 0, variables: 0, experiment: experiment?.id ?? "", germplasm: 0, codes: 0, factors: 0, levels: 0, objects: 0, filled: 0, provenance: "", values: 0 };
  const newObjects = trial.objects.filter((o) => !experiment?.objects.has(o.name));
  const newFactors = plan.factors.filter((f) => !f.exists);
  const grownFactors = plan.factors.filter((f) => f.newLevels?.length);
  const codeOf = new Map(plan.germplasm.codes.map((c) => [c.name, c.code]));
  const existingCodes = plan.germplasm.existing.filter((g) => codeOf.has(g.name));
  const total = plan.vocabulary.length + variables.create.length + variables.missing.length + (experiment ? 0 : 1) + plan.germplasm.missing.length + existingCodes.length
    + newFactors.length + grownFactors.length + newObjects.length + fills.length
    + (values.length ? 1 + Math.ceil(values.length / VALUES_AT_ONCE) : 0);
  let steps = 0;
  const tick = (step: string) => progress({ step, done: ++steps, total });
  try {
    for (const term of plan.vocabulary) {
      await addTerm(term.uri);
      done.vocabulary++;
      tick(`Added ${term.label} to PHIS`);
    }

    // Variables don't belong to the experiment: like vocabulary, they're kept and reused if it fails.
    for (const part of variables.create) {
      await createPart(variables, part);
      done.parts++;
      tick(`Added the ${PART_LABEL[part.kind]} ${part.name}`);
    }
    const variableUri = new Map(variables.existing.map((v) => [v.name, v.id]));
    for (const v of variables.missing) {
      variableUri.set(v.name, await createVariable(variables, v));
      done.variables++;
      tick(`Creating variables: ${done.variables} of ${variables.missing.length}`);
    }

    if (!experiment) {
      done.experiment = firstUri(await authedPost("/core/experiments", {
        name: plan.experiment.name,
        start_date: plan.experiment.startDate,
        objective: `Imported from a ${plan.instrument} export.`,
        // Public, or nobody but this app's account sees it in PHIS (OpenSILEX defaults to private).
        is_public: true,
      }));
      tick("Created the experiment");
    }

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
      const inPhis = experiment?.factors.find((x) => x.name.toLowerCase() === f.name.toLowerCase());
      let id = inPhis?.uri;
      if (!inPhis) {
        id = firstUri(await authedPost("/core/experiments/factors", { name: f.name, experiment: done.experiment, levels: f.levels.map((name) => ({ name })) }));
        done.factors++;
        tick(`Creating factors: ${done.factors} of ${newFactors.length}`);
      } else if (f.newLevels?.length) {
        await saveLevels(inPhis, [...inPhis.levels, ...f.newLevels.map((name) => ({ name }))]);
        done.levels += f.newLevels.length;
        tick(`Added ${plural(f.newLevels.length, "level")} to ${inPhis.name}`);
      }
      for (const l of (await authedGet(`/core/experiments/factors/${enc(id!)}/levels`)).result) levels.set(`${f.name}|${l.name}`, l.uri);
    }

    // One POST per object (no batch endpoint in this OpenSILEX), OBJECTS_AT_ONCE in flight: each costs
    // OpenSILEX ~0.5-1 CPU-s, and with no CPU limit 4-5 at a time is ~2x faster; more gains nothing
    // on the 4-vCPU node (measured 2026-09-30). A failure stops the next batch.
    // Containers first, so a plant's tray has a uri when the plant is sent.
    const objectUri = new Map<string, string>(experiment?.objects ?? []);
    const write = async (o: (typeof trial.objects)[number]) => {
      const relations = [
        ...(o.germplasm ? [{ property: "vocabulary:hasGermplasm", value: germplasm.get(o.germplasm), inverse: false }] : []),
        ...Object.entries(o.factors).map(([f, l]) => ({ property: "vocabulary:hasFactorLevel", value: levels.get(`${f}|${l}`), inverse: false })),
        ...(o.parent ? [{ property: "vocabulary:isPartOf", value: objectUri.get(o.parent), inverse: false }] : []),
        ...(o.position !== undefined ? [{ property: POSITION_IN_TRAY, value: String(o.position), inverse: false }] : []),
      ];
      objectUri.set(o.name, firstUri(await authedPost("/core/scientific_objects", { name: o.name, rdf_type: o.rdfType, experiment: done.experiment, relations })));
      done.objects++;
      tick(`Creating scientific objects: ${done.objects} of ${newObjects.length}`);
    };
    for (const pass of [newObjects.filter((o) => !o.parent), newObjects.filter((o) => o.parent)]) {
      for (let i = 0; i < pass.length; i += OBJECTS_AT_ONCE) await Promise.all(pass.slice(i, i + OBJECTS_AT_ONCE).map(write));
    }
    // Existing objects get what they lack (their tray now has a uri), one PUT each.
    for (let i = 0; i < fills.length; i += OBJECTS_AT_ONCE) {
      await Promise.all(fills.slice(i, i + OBJECTS_AT_ONCE).map(async (fill) => {
        await writeFill(fill, done.experiment, { germplasm, levels, objects: objectUri });
        done.filled++;
        tick(`Filling in existing objects: ${done.filled} of ${fills.length}`);
      }));
    }

    // The measured values, under one provenance for this import, one batch at a time.
    if (values.length) {
      const m = plan.measurements;
      const tz = trial.timezone ?? "UTC";
      done.provenance = await createProvenance(
        `${plan.experiment.name} – ${trial.source ?? plan.instrument} import ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
        `Imported from a ${plan.instrument} export by the Graph Explorer: ${values.length} values, scans from ${m.first!.replace("T", " ")} to ${m.last!.replace("T", " ")} (${tz}).`,
        m.first!, m.last!, tz,
      );
      tick("Created the provenance of the measurements");
      for (let i = 0; i < values.length; i += VALUES_AT_ONCE) {
        const batch = values.slice(i, i + VALUES_AT_ONCE);
        await writeValues(batch, { objects: objectUri, variables: variableUri }, done.provenance, done.experiment, tz);
        done.values += batch.length;
        tick(`Writing measurements: ${done.values} of ${values.length}`);
      }
    }
  } catch (err) {
    // Whatever it got to, importing the same files again finishes the job: the experiment then exists
    // and is filled in, so nothing is written twice.
    const wrote = [
      !experiment && done.experiment && "created the experiment",
      done.germplasm && `created ${plural(done.germplasm, "new germplasm", "new germplasm")}`,
      done.factors && `created ${plural(done.factors, "factor")}`,
      done.levels && `added ${plural(done.levels, "factor level")}`,
      done.objects && `created ${done.objects} of ${newObjects.length} scientific objects`,
      done.filled && `filled in ${done.filled} of ${fills.length} existing ones`,
      done.values && `written ${done.values} of ${values.length} measured values`,
    ];
    const what = done.experiment && wrote.some(Boolean)
      ? `It had ${andList(wrote.map((x) => x || 0))} in "${plan.experiment.name}". Import the same files again to finish: what is already in PHIS is skipped, nothing is written twice.`
      : done.vocabulary || done.parts || done.variables
        ? `Only ${andList([done.vocabulary && plural(done.vocabulary, "vocabulary term"), done.parts && plural(done.parts, "variable part"), done.variables && plural(done.variables, "variable")])} ${done.vocabulary + done.parts + done.variables === 1 ? "was" : "were"} added to PHIS (kept, and reused next time).`
        : "Nothing was written.";
    throw new OpenSilexError(err instanceof OpenSilexError ? err.status : 502, `The import stopped part-way: ${err instanceof Error ? err.message : String(err)}. ${what}`);
  }
  return {
    experiment: { id: done.experiment, type: "experiment", label: plan.experiment.name },
    created: { germplasm: done.germplasm, codes: done.codes, factors: done.factors, objects: done.objects, filled: done.filled, levels: done.levels, vocabulary: done.vocabulary, variables: done.variables, values: done.values },
  };
}
