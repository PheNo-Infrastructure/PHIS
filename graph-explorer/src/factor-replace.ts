// Linking a factor into an experiment that already has a factor of the same name (typically a duplicate made by an
// earlier import): the old one is SWAPPED for the new one when the levels fit one to one. Every plant keeps its level
// (the same-named level of the new factor), then the old factor, now unused, is deleted. When a level doesn't fit, or the
// old factor is also used by another experiment, nothing happens and the reason is given: deleting it would otherwise
// strip the levels off the plants (PHIS removes a deleted factor's levels from their objects).
import { OpenSilexError, authedGet, authedGetOne, authedDelete, compactUri } from "./opensilex.ts";
import { experimentsOfFactor, factorsOf } from "./experiment-factors.ts";
import { NODE_TYPES } from "./node-types.ts";

const enc = encodeURIComponent;
const norm = (s: string) => s.trim().toLowerCase();
type Level = { uri: string; name: string };
export type Replace = {
  experiment: { id: string; label: string };
  old: { id: string; name: string };
  factor: { id: string; name: string };
  levels: { from: string; to: string; fromUri: string; toUri: string; plants: string[] }[];
  plants: number;
};

async function plantsWith(expId: string, levelUri: string) {
  const out: string[] = [];
  for (let page = 0; ; page++) {
    const r = (await authedGet(`/core/scientific_objects?experiment=${enc(expId)}&factor_levels=${enc(levelUri)}&page=${page}&page_size=500`)).result;
    out.push(...r.map((o) => String(o.uri)));
    if (r.length < 500) return out;
  }
}

// null = nothing to swap (the experiment has no other factor of that name). Throws a 409 saying why a swap can't be done.
export async function planReplace(expId: string, factorId: string): Promise<Replace | null> {
  const mine = await factorsOf(expId);
  const want = (await authedGetOne(`/core/experiments/factors/${enc(factorId)}`)).result as unknown as { uri: string; name: string; levels?: Level[] };
  const newKey = await compactUri(String(want.uri));
  let old: (typeof mine)[number] | undefined;
  for (const f of mine) {
    if ((await compactUri(f.uri)) === newKey) return null; // already in the experiment
    if (!old && norm(f.name) === norm(want.name)) old = f;
  }
  if (!old) return null;
  const why = (reason: string) => new OpenSilexError(409, `The experiment already has a factor named ${old!.name}, and ${reason} Nothing was changed.`);
  const key = await compactUri(expId);
  const others: string[] = [];
  for (const e of await experimentsOfFactor(old.uri)) if ((await compactUri(e.uri)) !== key) others.push(e.name);
  if (others.length) throw why(`it is also used by ${others.join(", ")}, so it can't be swapped for ${want.name} here.`);
  const target = new Map((want.levels ?? []).map((l) => [norm(l.name), l] as const));
  const missing = (old.levels ?? []).filter((l) => !target.has(norm(l.name))).map((l) => l.name);
  if (missing.length) throw why(`its ${missing.length === 1 ? "level" : "levels"} ${missing.join(", ")} ${missing.length === 1 ? "isn't" : "aren't"} in the factor you are linking, so the plants couldn't keep them. Add ${missing.length === 1 ? "it" : "them"} there first.`);
  const levels = [];
  for (const l of old.levels ?? []) {
    const to = target.get(norm(l.name))!;
    levels.push({ from: l.name, to: to.name, fromUri: l.uri, toUri: to.uri, plants: await plantsWith(expId, l.uri) });
  }
  const label = String((await authedGetOne(`/core/experiments/${enc(expId)}`)).result.name ?? expId);
  return { experiment: { id: expId, label }, old: { id: old.uri, name: old.name }, factor: { id: want.uri, name: want.name }, levels, plants: levels.reduce((n, l) => n + l.plants.length, 0) };
}

// Run AFTER the new factor is linked in. Re-points the plants, checks every one holds its new level, then deletes the old factor.
export async function runReplace(p: Replace) {
  const update = NODE_TYPES.scientific_object.inExperiment!.update;
  const AT_ONCE = 4;
  for (const l of p.levels) {
    for (let i = 0; i < l.plants.length; i += AT_ONCE) await Promise.all(l.plants.slice(i, i + AT_ONCE).map((o) => update(o, p.experiment.id, { field: "hasFactorLevel", add: [l.toUri] })));
  }
  for (const l of p.levels) { // the old factor goes only when every plant of it holds the new level
    const now = new Set(await Promise.all((await plantsWith(p.experiment.id, l.toUri)).map(compactUri)));
    const lacking = (await Promise.all(l.plants.map(compactUri))).filter((o) => !now.has(o));
    if (lacking.length) throw new OpenSilexError(500, `${lacking.length} plants didn't take the level ${l.to}, so ${p.old.name} was NOT deleted. Run it again.`);
  }
  await authedDelete(NODE_TYPES.factor.deleteUrl(p.old.id));
}
