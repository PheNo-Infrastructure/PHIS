// The shared import engine, step 3: write what the plan showed, in dependency order —
// vocabulary -> variables (+ their parts) -> experiment -> germplasm (+ codes) -> factors (+ levels) -> scientific objects,
// containers (blocks) before what is part of them, each with its germplasm, factor levels, parent
// (all live on the object's copy in the experiment, so they're sent on creation) -> where the new objects stand (a Move to the
// facility the device stands in, places.ts) -> the measured values. Into an experiment that exists, the same order fills in only what PHIS
// lacks (existing.ts): new factors/levels/objects are created, existing objects get what they miss.
import { OpenSilexError, authedGet, authedGetOne, authedPost, authedPut } from "../opensilex.ts";
import { NODE_TYPES, saveLevels, updateNode, updatePayloadFromDto } from "../node-types.ts";
import { addTerm } from "./ontology.ts";
import { placeBatches, recordPlaces, type Facility } from "./places.ts";
import { prepare } from "./plan.ts";
import { createPart, createVariable, type PartKind } from "./variables.ts";
import { VALUES_AT_ONCE, createProvenance, writeValues } from "./measurements.ts";
import { writeFill } from "./existing.ts";
import { writeGroup } from "./variable-groups.ts";
import type { Files } from "./plugins.ts";
import type { Edits } from "./edits.ts";

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
// device / person: who made the data (optional, from the plan's lists). share: who sees a NEW experiment — "public" (the
// default, as before), "private", or a group's uri. note: keep a note of the import (on by default in the page).
export type Choices = { species?: string; newSpecies?: string; devices?: string[]; person?: string; share?: string; note?: boolean; edits?: Edits };
const MOTIVATION_DESCRIBING = "http://www.w3.org/ns/oa#describing";
export async function runImport(files: Files, choices: Choices, progress: (p: Progress) => void = () => {}) {
  // The devices picked in the dialog are also the ones whose facility places the objects (the page sends them as an edit once they change).
  const edits = choices.devices && !choices.edits?.devices ? { ...choices.edits, devices: choices.devices } : choices.edits;
  const { trial, plan, variables, variableGroupPlans, values, experiment, fills, reused, unplaced } = await prepare(files, edits);

  // Everything that would stop the import is checked before the first write.
  const blockers: string[] = [];
  if (plan.experiment.sameName) blockers.push(`${plan.experiment.sameName} experiments in PHIS are named "${plan.experiment.name}", so it isn't clear which one to fill in.`);
  for (const a of plan.germplasm.ambiguous) blockers.push(`"${a.name}" matches ${a.ids.length} germplasm in PHIS, so it isn't clear which one is meant.`);
  // New germplasm needs a species: one of PHIS's, or one added first (named here, when PHIS lacks it).
  const newSpecies = choices.newSpecies?.trim();
  if (plan.germplasm.missing.length) {
    const sameName = newSpecies ? plan.speciesOptions.find((o) => o.label.toLowerCase() === newSpecies.toLowerCase()) : undefined;
    if (sameName) blockers.push(`There is already a species named "${sameName.label}" in PHIS; choose it from the list.`);
    else if (choices.newSpecies !== undefined ? !newSpecies : !plan.speciesOptions.some((o) => o.id === choices.species)) blockers.push("Choose the species for the new germplasm.");
  }
  for (const f of plan.factors) if (f.matches) blockers.push(`"${f.name}" matches ${f.matches.length} factors in PHIS, so it isn't clear which one is meant: pick one in the review, or choose to make a new one.`);
  if (choices.devices?.some((id) => !plan.options.devices.some((d) => d.id === id))) blockers.push("That device isn't in PHIS.");
  if (choices.person && !plan.options.persons.some((p) => p.id === choices.person)) blockers.push("That person isn't in PHIS.");
  const share = choices.share ?? "public";
  if (!experiment && !["public", "private"].includes(share) && !plan.options.groups.some((g) => g.id === share)) blockers.push("That group isn't in PHIS.");
  if (blockers.length) throw new OpenSilexError(409, blockers.join(" "));

  const done = { vocabulary: 0, parts: 0, variables: 0, groups: 0, species: 0, experiment: experiment?.id ?? "", germplasm: 0, codes: 0, factors: 0, levels: 0, objects: 0, reused: 0, filled: 0, placed: 0, provenance: "", values: 0, note: undefined as boolean | undefined };
  const notThere = trial.objects.filter((o) => !experiment?.objects.has(o.name));
  const newObjects = notThere.filter((o) => !reused.has(o.name));
  const joining = notThere.filter((o) => reused.has(o.name)); // already in PHIS, in the same place: they join this experiment under their own uri
  // Where the new objects stand: a Move to the facility the picked device stands in, if it stands in one in PHIS.
  const facility = plan.places.facility as Facility | null;
  const placeItems = facility ? newObjects.filter((o) => o.place).map((o) => ({ name: o.name, text: o.place! })) : [];
  const placeCount = placeItems.length + (facility ? unplaced.length : 0); // new objects, and objects of the filled experiment that were never moved
  const newFactors = plan.factors.filter((f) => !f.exists);
  const grownFactors = plan.factors.filter((f) => f.newLevels?.length || (f.reuse && !f.reuse.linked));
  const codeOf = new Map(plan.germplasm.codes.map((c) => [c.name, c.code]));
  const existingCodes = plan.germplasm.existing.filter((g) => codeOf.has(g.name));
  const total = plan.vocabulary.length + variables.create.length + variables.missing.length + plan.variableGroups.filter((g) => !g.exists || g.newMembers).length + (experiment ? 0 : 1) + (newSpecies && plan.germplasm.missing.length ? 1 : 0) + plan.germplasm.missing.length + existingCodes.length
    + newFactors.length + grownFactors.length + newObjects.length + joining.length + fills.length + placeBatches(placeCount)
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
    // Groups of variables (a histogram's bins), now that every member exists.
    for (const g of variableGroupPlans) {
      if (await writeGroup(g, variableUri)) {
        done.groups++;
        tick(`Grouping variables: ${done.groups} of ${plan.variableGroups.filter((x) => !x.exists || x.newMembers).length}`);
      }
    }

    if (!experiment) {
      done.experiment = firstUri(await authedPost("/core/experiments", {
        name: plan.experiment.name,
        start_date: plan.experiment.startDate,
        objective: `Imported from a ${plan.instrument} export.`,
        // Public (the default), or nobody but this app's account sees it in PHIS (OpenSILEX defaults to private) —
        // unless the user chose private or one group to share it with.
        is_public: share === "public",
        ...(share !== "public" && share !== "private" ? { groups: [share] } : {}),
      }));
      tick("Created the experiment");
    }

    const germplasm = new Map(plan.germplasm.existing.map((g) => [g.name, g.id]));
    let species = choices.species;
    if (newSpecies && plan.germplasm.missing.length) {
      species = firstUri(await authedPost("/core/germplasm", { name: newSpecies, rdf_type: "vocabulary:Species", is_public: true }));
      done.species++;
      tick(`Added the species ${newSpecies}`);
    }
    for (const name of plan.germplasm.missing) {
      // ponytail: new germplasm are always varieties; let the plugin say so per instrument once one
      // brings accessions or lines.
      germplasm.set(name, firstUri(await authedPost("/core/germplasm", { name, rdf_type: "vocabulary:Variety", species, is_public: true, ...(codeOf.has(name) ? { code: codeOf.get(name) } : {}) })));
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
      if (f.reuse) {
        // A factor PHIS already has: new levels go into it (read fresh, the PUT replaces the whole factor) and it is linked into this experiment.
        id = f.reuse.uri;
        if (f.newLevels?.length) {
          const dto = (await authedGetOne(`/core/experiments/factors/${enc(id)}`)).result as unknown as Parameters<typeof saveLevels>[0];
          await saveLevels(dto, [...dto.levels, ...f.newLevels.map((name) => ({ name }))]);
          done.levels += f.newLevels.length;
        }
        if (!f.reuse.linked) await updateNode(NODE_TYPES.experiment, done.experiment, { link: { field: "factors", uris: [id] } });
        tick(`Using the factor ${f.reuse.name}`);
      } else if (!inPhis) {
        id = firstUri(await authedPost("/core/experiments/factors", { name: f.name, experiment: done.experiment, ...(f.unit ? { exact_match: [f.unit.id] } : {}), levels: f.levels.map((name) => ({ name })) }));
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
    // Containers first, so a plant's block has a uri when the plant is sent.
    const objectUri = new Map<string, string>(experiment?.objects ?? []);
    const write = async (o: (typeof trial.objects)[number]) => {
      const relations = [
        ...(o.germplasm ? [{ property: "vocabulary:hasGermplasm", value: germplasm.get(o.germplasm), inverse: false }] : []),
        ...Object.entries(o.factors).map(([f, l]) => ({ property: "vocabulary:hasFactorLevel", value: levels.get(`${f}|${l}`), inverse: false })),
        ...(o.parent ? [{ property: "vocabulary:isPartOf", value: objectUri.get(o.parent), inverse: false }] : []),
      ];
      const existing = reused.get(o.name);
      if (existing) {
        await authedPost("/core/scientific_objects", { uri: existing, name: o.name, rdf_type: o.rdfType, experiment: done.experiment, relations });
        objectUri.set(o.name, existing);
        done.reused++;
        tick(`Adding objects that already stand there: ${done.reused} of ${joining.length}`);
        return;
      }
      objectUri.set(o.name, firstUri(await authedPost("/core/scientific_objects", { name: o.name, rdf_type: o.rdfType, experiment: done.experiment, relations })));
      done.objects++;
      tick(`Creating scientific objects: ${done.objects} of ${newObjects.length}`);
    };
    for (const pass of [[...newObjects, ...joining].filter((o) => !o.parent), [...newObjects, ...joining].filter((o) => o.parent)]) {
      for (let i = 0; i < pass.length; i += OBJECTS_AT_ONCE) await Promise.all(pass.slice(i, i + OBJECTS_AT_ONCE).map(write));
    }
    // Existing objects get what they lack (their block now has a uri), one PUT each.
    for (let i = 0; i < fills.length; i += OBJECTS_AT_ONCE) {
      await Promise.all(fills.slice(i, i + OBJECTS_AT_ONCE).map(async (fill) => {
        await writeFill(fill, done.experiment, { germplasm, levels, objects: objectUri });
        done.filled++;
        tick(`Filling in existing objects: ${done.filled} of ${fills.length}`);
      }));
    }

    if (placeCount) {
      const day = (plan.measurements.first ?? new Date().toISOString()).slice(0, 10);
      const list = [...placeItems.map((p) => ({ uri: objectUri.get(p.name)!, text: p.text })), ...(facility ? unplaced.map((u) => ({ uri: u.uri, text: u.text })) : [])];
      await recordPlaces(list, facility!.id, day, () => tick(`Recording where the objects stand in ${facility!.name}`));
      done.placed = placeCount;
    }

    // The measured values, under one provenance for this import, one batch at a time.
    if (values.length) {
      const m = plan.measurements;
      const tz = trial.timezone ?? "UTC";
      done.provenance = await createProvenance(
        `${plan.experiment.name} – ${trial.source ?? plan.instrument} import ${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
        `Imported from a ${plan.instrument} export by the Graph Explorer: ${values.length} values, scans from ${m.first!.replace("T", " ")} to ${m.last!.replace("T", " ")} (${tz}).`,
        m.first!, m.last!, tz,
        [
          ...(choices.devices ?? []).map((uri) => ({ uri, rdf_type: "vocabulary:Device" })),
          ...(choices.person ? [{ uri: choices.person, rdf_type: "vocabulary:Operator" }] : []),
        ],
      );
      tick("Created the provenance of the measurements");
      for (let i = 0; i < values.length; i += VALUES_AT_ONCE) {
        const batch = values.slice(i, i + VALUES_AT_ONCE);
        await writeValues(batch, { objects: objectUri, variables: variableUri }, done.provenance, done.experiment, tz);
        done.values += batch.length;
        tick(`Writing measurements: ${done.values} of ${values.length}`);
      }
    }
    // A note of what this import did, on the experiment and the provenance. The data is already in PHIS, so a failed note
    // is reported, never an import failure.
    if (choices.note) {
      try {
        const names = [...files.keys()].filter((p) => !p.endsWith("/")).sort();
        const made = [
          done.objects && plural(done.objects, "scientific object"), done.germplasm && `${done.germplasm} new germplasm`, done.factors && plural(done.factors, "factor"),
          done.variables && plural(done.variables, "variable"), done.values && `${done.values.toLocaleString("en")} measured values`, done.filled && `${done.filled} existing objects filled in`,
        ].filter(Boolean);
        const m = plan.measurements;
        const left = m ? [m.skipped.empty && `${m.skipped.empty} empty cells`, m.skipped.notNumbers.count && `${m.skipped.notNumbers.count} non-numbers`, m.skipped.contradictions.count && `${m.skipped.contradictions.count} contradicting values`].filter(Boolean) : [];
        const text = [
          `Imported from a ${plan.instrument} export by the Graph Explorer on ${new Date().toISOString().slice(0, 10)}.`,
          `Files: ${names.join(", ")}.`,
          made.length ? `Written: ${made.join(", ")}.` : "Nothing new was written; everything was already in PHIS.",
          left.length ? `Left out: ${left.join(", ")}.` : "",
          plan.warnings.length ? `Warnings: ${plan.warnings.slice(0, 10).join(" ")}` : "",
        ].filter(Boolean).join(" ");
        await authedPost("/core/annotations", { description: text.slice(0, 3000), motivation: MOTIVATION_DESCRIBING, targets: [done.experiment, ...(done.provenance ? [done.provenance] : [])] });
        done.note = true;
      } catch {
        done.note = false;
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
      done.reused && `added ${done.reused} of ${joining.length} objects that already stand there`,
      done.filled && `filled in ${done.filled} of ${fills.length} existing ones`,
      done.placed && `recorded where ${done.placed} objects stand`,
      done.values && `written ${done.values} of ${values.length} measured values`,
    ];
    const what = done.experiment && wrote.some(Boolean)
      ? `It had ${andList(wrote.map((x) => x || 0))} in "${plan.experiment.name}". Import the same files again to finish: what is already in PHIS is skipped, nothing is written twice.`
      : done.vocabulary || done.parts || done.variables || done.groups
        ? `Only ${andList([done.vocabulary && plural(done.vocabulary, "vocabulary term"), done.parts && plural(done.parts, "variable part"), done.variables && plural(done.variables, "variable"), done.groups && plural(done.groups, "variable group")])} ${done.vocabulary + done.parts + done.variables + done.groups === 1 ? "was" : "were"} added to PHIS (kept, and reused next time).`
        : "Nothing was written.";
    throw new OpenSilexError(err instanceof OpenSilexError ? err.status : 502, `The import stopped part-way: ${err instanceof Error ? err.message : String(err)}. ${what}`);
  }
  return {
    experiment: { id: done.experiment, type: "experiment", label: plan.experiment.name },
    created: { species: done.species, germplasm: done.germplasm, codes: done.codes, factors: done.factors, objects: done.objects, reused: done.reused, filled: done.filled, placed: done.placed, levels: done.levels, vocabulary: done.vocabulary, variables: done.variables, variableGroups: done.groups, values: done.values, ...(done.note !== undefined ? { note: done.note } : {}) },
  };
}
