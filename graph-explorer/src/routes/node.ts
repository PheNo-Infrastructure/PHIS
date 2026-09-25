import { authedGetOne, authedDelete, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { NODE_TYPES, allows, queryItems, refUri, relationsFor, updateNode } from "../node-types.ts";

export const handleNodeDetail: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/node-detail" || req.method !== "GET") return false;

  const type = searchParams.get("type");
  const id = searchParams.get("id");
  const config = type ? NODE_TYPES[type] : undefined;
  if (!config || !id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "view not implemented for this type" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const dto = (await authedGetOne(config.getUrl(id))).result;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        uri: String(dto.uri ?? id),
        // OpenSILEX's own label for the node's class, e.g. "Sample", "Compartment", "research unit".
        ...(typeof dto.rdf_type_name === "string" && dto.rdf_type_name ? { typeName: dto.rdf_type_name } : {}),
        actions: (["rename", "delete", "link"] as const).filter((a) => allows(config, a)),
        ...(config.deleteRemovesLinks ? { deleteRemovesLinks: true } : {}),
        relations: await relationsFor(id, dto, config),
      })
    );
  });
  return true;
};

export const handleNodeMutation: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/node") return false;

  if (req.method === "PUT") {
    const body = (await readJsonBody(req)) as {
      type?: string;
      id?: string;
      name?: string;
      unlink?: { field: string; uri: string };
      link?: { field: string; uris: string[] };
    };
    const { type, id, name, unlink, link } = body;
    const config = type ? NODE_TYPES[type] : undefined;
    if (!config || !id || (!name && !unlink && !link) || (name && !allows(config, "rename")) || ((unlink || link) && !allows(config, "link"))) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "edit not implemented for this type, or id/name/unlink/link missing" }));
      return true;
    }
    const ctx = config.contextLinks?.[(unlink ?? link)?.field ?? ""];
    if (ctx) {
      // An operation-style link (see contextLinks) — no DTO PUT involved.
      await respondOpenSilexErrors(res, async () => {
        if (unlink) await ctx.unlink(id, unlink.uri);
        for (const uri of link?.uris ?? []) await ctx.link(id, uri);
        const dto = (await authedGetOne(config.getUrl(id))).result;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id, type, label: String(dto.name ?? id), relations: await relationsFor(id, dto, config) }));
      });
      return true;
    }
    await respondOpenSilexErrors(res, async () => {
      const current = await updateNode(config, id, { name, unlink, link });
      const finalName = name ?? String(current.name ?? "");
      // Unlink responses include the refreshed relations so the frontend can update its
      // detail-pane cache directly, instead of firing a second GET right after this PUT.
      // Filters the original {uri, name} refs (not payload's bare uri list) so the remaining
      // items in this group keep their real names instead of falling back to their uri. `link`
      // doesn't get the same treatment — the newly added uris have no {uri, name} pair to draw
      // a real label from here, so callers drop their NODE_DETAIL cache and refetch instead.
      const patched = unlink
        ? {
            ...current,
            [unlink.field]: (Array.isArray(current[unlink.field]) ? (current[unlink.field] as ({ uri: string } | string)[]) : []).filter(
              (r) => refUri(r) !== unlink.uri
            ),
          }
        : current;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id,
          type,
          label: finalName,
          ...(unlink ? { relations: await relationsFor(id, patched, config) } : {}),
        })
      );
    });
    return true;
  }

  if (req.method === "DELETE") {
    const type = searchParams.get("type");
    const id = searchParams.get("id");
    const config = type ? NODE_TYPES[type] : undefined;
    if (!config || !allows(config, "delete") || !id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "delete not implemented for this type" }));
      return true;
    }
    await respondOpenSilexErrors(res, async () => {
      // Enforced here, not just in the UI: OpenSILEX deletes e.g. a non-empty experiment and
      // orphans its scientific objects (undeletable afterwards) — probed live.
      for (const q of (config.queryRelations ?? []).filter((q) => q.blocksDelete)) {
        const blockers = await queryItems(q, id);
        if (blockers.length) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Can't delete: it still holds ${blockers.length} ${q.label.toLowerCase()} (${blockers.map((b) => b.label).join(", ")}). Deleting it would orphan them in PHIS — delete them first.` }));
          return;
        }
      }
      for (const url of (await config.deleteFirst?.(id)) ?? []) await authedDelete(url);
      await authedDelete(config.deleteUrl(id));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  return false;
};
