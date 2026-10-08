import { authedGet, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";

const enc = encodeURIComponent;

// GET /api/elsewhere?experiment=<uri> -> { "<object uri>": [{ id, label }] }: for each scientific
// object in the experiment, the OTHER experiments it is also in (objects only here are left out).
// Asked from the experiments' side — one list per other experiment — instead of once per object:
// clearing a 100-plant trial spent minutes asking each plant (found 2026-09-30).
// ponytail: every other experiment's list is read; fine for tens of experiments, needs a SPARQL
// query or paging once there are hundreds.
export async function objectsElsewhere(id: string) {
  const objectsIn = async (exp: string) => (await authedGet(`/core/scientific_objects?experiment=${enc(exp)}&page_size=5000`)).result.map((o) => String(o.uri));
  const self = await compactUri(id);
  const mine = new Set(await objectsIn(id));
  const others = [];
  for (const e of (await authedGet("/core/experiments?page_size=500")).result) if ((await compactUri(e.uri)) !== self) others.push(e);
  const out: Record<string, { id: string; label: string }[]> = {};
  await Promise.all(others.map(async (e) => {
    for (const so of await objectsIn(e.uri)) if (mine.has(so)) (out[so] ??= []).push({ id: e.uri, label: String(e.name ?? e.uri) });
  }));
  return out;
}

export const handleElsewhere: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/elsewhere" || req.method !== "GET") return false;
  const id = searchParams.get("experiment");
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "experiment is required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(await objectsElsewhere(id)));
  });
  return true;
};
