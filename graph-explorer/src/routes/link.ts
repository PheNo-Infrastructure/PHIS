import { authedGetOne, authedPut, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { NODE_TYPES, contextLinkFor, linkFieldFor, refUri, updatePayloadFromDto, type ContextLink } from "../node-types.ts";

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

  // Every distinct-type pair present that linkFieldFor can resolve. A selection with only one
  // type (types.length === 1, e.g. 3 facilities and nothing else) never has a resolvable pair —
  // same as clicking "+ New" with a single-type selection that shares no adjacency: honest 400.
  const ops: { ownerType: string; field: string; ownerIds: string[]; otherIds: string[]; ctx?: ContextLink }[] = [];
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      // Operation-style links (e.g. scientific object <-> experiment) first; else a DTO field.
      const resolved = contextLinkFor(types[i], types[j]) ?? linkFieldFor(types[i], types[j]);
      if (!resolved) continue;
      const ownerIsI = resolved.ownerType === types[i];
      ops.push({
        ownerType: resolved.ownerType,
        field: resolved.field,
        ctx: "ctx" in resolved ? resolved.ctx : undefined,
        ownerIds: idsByType.get(ownerIsI ? types[i] : types[j])!,
        otherIds: idsByType.get(ownerIsI ? types[j] : types[i])!,
      });
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
      const config = NODE_TYPES[op.ownerType];
      if (op.ctx) {
        for (const ownerId of op.ownerIds) {
          const existing = new Set(await op.ctx.current(ownerId));
          for (const otherId of op.otherIds) {
            if (existing.has(otherId)) { alreadyLinked++; continue; }
            await op.ctx.link(ownerId, otherId);
            linkedPairs++;
          }
        }
        continue;
      }
      for (const ownerId of op.ownerIds) {
        // Same read-current-DTO-then-full-PUT reasoning as rename/unlink — the update endpoint
        // replaces the whole DTO, so every other settable field has to be carried forward. Read
        // fresh each time (not just once up front) so an owner appearing in more than one op
        // (a third wired type, one day) doesn't clobber an earlier op's change to a different field.
        const current = (await authedGetOne(config.getUrl(ownerId))).result;
        const name = String(current.name ?? "");
        const existing = new Set(
          (Array.isArray(current[op.field]) ? (current[op.field] as ({ uri: string } | string)[]) : []).map(refUri)
        );
        const payload = updatePayloadFromDto(ownerId, name, current, config, {
          link: { field: op.field, uris: op.otherIds },
        });
        await authedPut(config.putUrl, payload);
        // updatePayloadFromDto dedupes the DTO itself (no duplicate relation is ever sent), but
        // it doesn't say how many of the requested uris were genuinely new — count that here so
        // the toast can tell the user "already linked" apart from "linked", instead of claiming
        // success for a no-op PUT.
        for (const uri of op.otherIds) {
          if (existing.has(uri)) alreadyLinked++;
          else linkedPairs++;
        }
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, linkedPairs, alreadyLinked }));
  });
  return true;
};
