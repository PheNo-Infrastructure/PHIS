// An experiment's factors. PHIS lets one factor serve several experiments (probed 2026-11-09), but its
// `/experiments/{id}/factors` lists only the factors MADE in that experiment. The ones linked in later sit
// in the experiment's own `factors` field, so both are read and joined.
import { authedGet, authedGetOne, compactUri } from "./opensilex.ts";

const enc = encodeURIComponent;
export type FactorOf = { uri: string; name: string; experiment: string; levels: { uri: string; name: string; description?: string | null }[] };

export async function factorsOf(expId: string): Promise<FactorOf[]> {
  const made = (await authedGet(`/core/experiments/${enc(expId)}/factors`)).result as unknown as FactorOf[];
  const linked = ((await authedGetOne(`/core/experiments/${enc(expId)}`)).result.factors ?? []) as (string | { uri: string })[];
  const have = new Set(await Promise.all(made.map((f) => compactUri(f.uri))));
  const out = [...made];
  for (const r of linked) {
    const uri = typeof r === "string" ? r : r.uri;
    const key = await compactUri(uri);
    if (have.has(key)) continue;
    have.add(key);
    const f = (await authedGetOne(`/core/experiments/factors/${enc(uri)}`).catch(() => null))?.result as unknown as FactorOf | undefined;
    if (f) out.push(f);
  }
  return out;
}

// The experiments that hold a factor (the one it was made in, and any it was linked into).
export async function experimentsOfFactor(factorId: string): Promise<{ uri: string; name: string }[]> {
  return (await authedGet(`/core/experiments/factors/${enc(factorId)}/experiments`)).result.map((e) => ({ uri: String(e.uri), name: String(e.name ?? e.uri) }));
}

// True when the factor was made in this experiment (PHIS keeps that one fixed: an update can't move it).
export async function madeIn(f: Pick<FactorOf, "experiment">, expId: string) {
  return (await compactUri(f.experiment)) === (await compactUri(expId));
}
