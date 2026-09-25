import { creatableTypesFor } from "../adjacency.js";
import { CREATABLE } from "../creation.js";
import { authedPost, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { applyLink, resolveLink, type ResolvedLink } from "../node-types.ts";

export const handleCreate: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/create" || req.method !== "POST") return false;

  const body = (await readJsonBody(req)) as {
    type?: string;
    name?: string;
    links?: { type: string; id: string }[];
    fields?: Record<string, unknown>;
  };
  const type = body.type;
  const name = body.name;
  const links = body.links ?? [];
  if (!type || !name || !Array.isArray(links)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "type and name are required" }));
    return true;
  }
  const config = CREATABLE[type];
  if (!config) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `creation not implemented for type: ${type}` }));
    return true;
  }
  // No links at all = standalone creation (browsing straight from a category page with
  // nothing selected) — always allowed for any type creation is wired for. Clusters start
  // somewhere; minimizing orphans doesn't mean every node needs a relation at birth, just
  // that linking should be easy when there's something real to link to. Given links,
  // though, the intersection rule still applies — same check the "+ New" menu used to offer
  // this type in the first place, enforced again server-side so the API can't be driven into
  // a nonsensical link by a client that skips the UI's own check.
  if (links.length > 0 && !creatableTypesFor(links.map((l) => l.type)).has(type)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `${type} is not a valid link target for the given selection` }));
    return true;
  }
  const payload: Record<string, unknown> = { name };
  // Links the new node's own DTO can't carry in the POST — no field for that type (a project's
  // experiments live on each experiment), or a scalar field already used (a scientific object's
  // second experiment) — are linked right after it, the same way /api/link links existing nodes.
  const later: { id: string; r: ResolvedLink }[] = [];
  // Only the keys the type declares — never an arbitrary client-supplied DTO field.
  for (const f of config.fields ?? []) {
    const value = body.fields?.[f.key];
    if (value === undefined || value === "") {
      if (!f.required) continue;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `${f.label} is required` }));
      return true;
    }
    payload[f.key] = String(value);
  }
  for (const link of links) {
    const field = config.linkFields[link.type];
    const scalarTaken = field && config.scalarLinkFields?.includes(field) && payload[field] !== undefined;
    if (!field || scalarTaken) {
      const r = resolveLink(type, link.type);
      // Adjacent but not linkable either way (e.g. experiment <- factor): refuse rather than
      // silently create the node without that link — a quiet orphan is exactly what this app
      // exists to prevent.
      if (!r) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `linking a new ${type} to a ${link.type} isn't supported yet` }));
        return true;
      }
      later.push({ id: link.id, r });
      continue;
    }
    if (config.scalarLinkFields?.includes(field)) {
      payload[field] = link.id;
      continue;
    }
    (payload[field] as string[] | undefined) ??= [];
    (payload[field] as string[]).push(link.id);
  }
  await respondOpenSilexErrors(res, async () => {
    const created = String((await authedPost(config.url, payload)).result);
    // The node exists now, so a failed follow-up link is reported alongside the 201, never as a
    // failed create — e.g. a name clash in one experiment shouldn't hide that the object was
    // made in the others.
    const missed: string[] = [];
    for (const { id, r } of later) {
      const [owner, other] = r.ownerType === type ? [created, id] : [id, created];
      try {
        await applyLink(r, [owner], [other]);
      } catch (err) {
        missed.push(`${id}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
      }
    }
    res.writeHead(201, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: await compactUri(created), type, label: name,
      ...(missed.length ? { warning: `not linked to ${missed.length} of ${links.length} — ${missed.join("; ")}` } : {}),
    }));
  });
  return true;
};
