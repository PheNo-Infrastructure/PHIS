// How an experiment's objects and variables sit, for its page: the variables with values (and how many),
// each factor's levels with the plants that have them, and the objects in no factor. Read-only.
import { authedGet, authedPost, compactUri } from "./opensilex.ts";

const enc = encodeURIComponent;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export type Ref = { id: string; label: string };
export type Structure = {
  truncated: boolean;
  variables: { id: string; label: string; count: number }[];
  factors: {
    id: string; label: string;
    levels: { id: string; type: "factor_level"; label: string; factor: string; plants: Ref[] }[];
    unset: Ref[];
  }[];
  other: Ref[];
};
type Row = { uri?: unknown; name?: unknown };
type FactorRow = { uri: string; name: string; levels?: { uri: string; name: string }[] };

const refs = (rows: Row[]): Ref[] => rows.map((r) => ({ id: String(r.uri), label: String(r.name ?? r.uri) })).sort((a, b) => natural(a.label, b.label));
const PAGE = 500; // the page size the app already asks PHIS for (EXPERIMENT_SOS)
const AT_ONCE = 4; // calls to PHIS in flight together: the test instance has a small heap

// Runs fn over items a few at a time (in order), instead of firing every call at once.
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function experimentStructure(expId: string): Promise<Structure> {
  const e = enc(expId);
  const [varRows, factorRows, soPage] = await Promise.all([
    authedGet(`/core/experiments/${e}/variables`),
    authedGet(`/core/experiments/${e}/factors`),
    authedGet(`/core/scientific_objects?experiment=${e}&page_size=${PAGE}`),
  ]);

  const variables = await inBatches(varRows.result, AT_ONCE, async (v) => ({
    id: String(v.uri),
    label: String(v.name ?? v.uri),
    count: Number((await authedPost(`/core/data/count?experiments=${e}&variables=${enc(String(v.uri))}&count_limit=1000000`, [])).result) || 0,
  }));
  variables.sort((a, b) => natural(a.label, b.label));

  // Uris come back full or prefixed depending on the endpoint, so objects are matched by compacted uri.
  const all = refs(soPage.result);
  const keyOf = new Map(await Promise.all(all.map(async (o) => [o.id, await compactUri(o.id)] as const)));
  const key = async (id: string) => keyOf.get(id) ?? compactUri(id);
  const inAnyFactor = new Set<string>();

  const factorList = factorRows.result as unknown as FactorRow[];
  const flat = factorList.flatMap((f) => (f.levels ?? []).map((l) => ({ f, l })));
  let levelCut = false; // a level with more plants than one page: its overflow would sit under the wrong box
  const fetched = await inBatches(flat, AT_ONCE, async ({ l }) => {
    const page = await authedGet(`/core/scientific_objects?experiment=${e}&factor_levels=${enc(l.uri)}&page_size=${PAGE}`);
    if ((page.metadata?.pagination?.totalCount ?? 0) > page.result.length) levelCut = true;
    return refs(page.result);
  });
  const built = [];
  for (const f of factorList) {
    const own = new Set<string>();
    const levels = [];
    for (const l of f.levels ?? []) {
      const plants = fetched[flat.findIndex((x) => x.l === l)];
      for (const p of plants) { const k = await key(p.id); own.add(k); inAnyFactor.add(k); }
      levels.push({ id: l.uri, type: "factor_level" as const, label: `${f.name}: ${l.name}`, factor: f.uri, plants });
    }
    levels.sort((x, y) => natural(x.label, y.label));
    built.push({ id: f.uri, label: f.name, levels, own });
  }

  const factors = built.map(({ own, ...f }) => ({ ...f, unset: all.filter((o) => !own.has(keyOf.get(o.id)!) && inAnyFactor.has(keyOf.get(o.id)!)) }));
  const other = all.filter((o) => !inAnyFactor.has(keyOf.get(o.id)!));
  const total = soPage.metadata?.pagination?.totalCount ?? all.length;
  return { truncated: levelCut || total > all.length, variables, factors, other };
}
