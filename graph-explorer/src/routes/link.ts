import { respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { applyLink, resolveLink, type ResolvedLink } from "../node-types.ts";

// Links a whole selection of EXISTING nodes directly (no third node created) — the counterpart
// to the unlink flow in routes/node.ts, and to /api/create's `links` (which links a NEW node to
// an existing selection). Mirrors how /api/create already treats a multi-type selection:
// everything selected gets linked, regardless of how many distinct types are in the mix — e.g.
// selecting 4 facilities and 1 organization links all 4 to that org, in one PUT to the org
// (batched), not 4 separate calls.
export const handleLink: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/link" || req.method !== "POST") return false;

  const body = (await readJsonBody(req)) as { items?: { type: string; id: string }[] };
  const items = (body.items ?? []).filter((it) => it?.type && it?.id);
  if (items.length < 2) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "at least two items are required" }));
    return true;
  }

  const idsByType = new Map<string, string[]>();
  for (const it of items) {
    const list = idsByType.get(it.type);
    if (list) list.push(it.id);
    else idsByType.set(it.type, [it.id]);
  }
  const types = [...idsByType.keys()];

  // Every distinct-type pair present that resolveLink can resolve. A selection with only one
  // type (types.length === 1, e.g. 3 facilities and nothing else) never has a resolvable pair —
  // same as clicking "+ New" with a single-type selection that shares no adjacency: honest 400.
  const ops: { r: ResolvedLink; ownerIds: string[]; otherIds: string[] }[] = [];
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const r = resolveLink(types[i], types[j]);
      if (!r) continue;
      const other = r.ownerType === types[i] ? types[j] : types[i];
      ops.push({ r, ownerIds: idsByType.get(r.ownerType)!, otherIds: idsByType.get(other)! });
    }
  }
  if (!ops.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "nothing in this selection can be linked directly" }));
    return true;
  }

  await respondOpenSilexErrors(res, async () => {
    let linkedPairs = 0;
    let alreadyLinked = 0;
    for (const op of ops) {
      const { linked, already } = await applyLink(op.r, op.ownerIds, op.otherIds);
      linkedPairs += linked;
      alreadyLinked += already;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, linkedPairs, alreadyLinked }));
  });
  return true;
};
