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
    const blocked = await config.deleteBlockedBy?.(dto, id);
    const fix = blocked ? await config.deleteBlockFix?.check(id, dto) : null;
    // Body fully built BEFORE writeHead (same reason as list.ts): a relation query failing after
    // the 200 header went out can't be reported anymore and leaves the request hanging.
    const body = JSON.stringify({
      uri: String(dto.uri ?? id),
      // OpenSILEX's own label for the node's class, e.g. "Sample", "Compartment", "research unit".
      ...(typeof dto.rdf_type_name === "string" && dto.rdf_type_name ? { typeName: dto.rdf_type_name } : {}),
      actions: (["rename", "delete", "link"] as const).filter((a) => allows(config, a)),
      ...(config.deleteRemovesLinks ? { deleteRemovesLinks: true } : {}),
      ...(config.visibility ? { isPublic: dto.is_public === true } : {}),
      ...(config.facts ? { facts: config.facts(dto) } : {}),
      ...(blocked ? { deleteBlocked: blocked } : {}),
      ...(fix ? { deleteFix: fix } : {}),
      ...(config.deleteWarning ? { deleteWarning: await config.deleteWarning(id, dto) } : {}),
      relations: await relationsFor(id, dto, config),
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  return true;
};

export const handleNodeMutation: RouteHandler = async (req, res, { pathname, searchParams }) => {
  // The way past a blocked delete (deleteBlockFix), taken only on its own confirmed request.
  if (pathname === "/api/node/delete-fix" && req.method === "POST") {
    const config = NODE_TYPES[searchParams.get("type") ?? ""];
    const id = searchParams.get("id");
    if (!config?.deleteBlockFix || !id) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "nothing to do for this type" }));
      return true;
    }
    await respondOpenSilexErrors(res, async () => {
      await config.deleteBlockFix!.run(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }
  if (pathname !== "/api/node") return false;

  if (req.method === "PUT") {
    const body = (await readJsonBody(req)) as {
      type?: string;
      id?: string;
      name?: string;
      unlink?: { field: string; uri: string };
      link?: { field: string; uris: string[] };
      isPublic?: boolean;
    };
    const { type, id, name, unlink, link, isPublic } = body;
    const config = type ? NODE_TYPES[type] : undefined;
    if (!config || !id || (!name && !unlink && !link && isPublic === undefined) || (name && !allows(config, "rename")) || ((unlink || link) && !allows(config, "link"))
        || (isPublic !== undefined && (typeof isPublic !== "boolean" || !config.visibility))) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "edit not implemented for this type, or id/name/unlink/link/isPublic missing" }));
      return true;
    }
    const experiment = (body as { experiment?: string }).experiment;
    if (experiment && name && config.rename) {
      // A rename of the node's copy in one experiment (a scientific object's name is per copy).
      await respondOpenSilexErrors(res, async () => {
        const label = await config.rename!(id, name, experiment);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id, type, label }));
      });
      return true;
    }
    if (experiment) {
      // A link that lives only inside one experiment (see NodeConfig.inExperiment).
      const field = (unlink ?? link)?.field ?? "";
      if (!config.inExperiment?.fields.includes(field) || name) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `${field || "this"} can't be set inside an experiment for this type` }));
        return true;
      }
      await respondOpenSilexErrors(res, async () => {
        await config.inExperiment!.update(id, experiment, { field, add: link?.uris, remove: unlink?.uri });
        const dto = (await authedGetOne(config.getUrl(id))).result;
        const offer = link?.uris?.length && config.inExperiment!.childOffer ? await config.inExperiment!.childOffer(id, experiment, field, link.uris) : [];
        const out = JSON.stringify({ id, type, label: String(dto.name ?? id), relations: await relationsFor(id, dto, config), ...(offer.length ? { childOffer: offer } : {}) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(out);
      });
      return true;
    }
    const ctx = config.contextLinks?.[(unlink ?? link)?.field ?? ""];
    if (ctx) {
      // An operation-style link (see contextLinks) — no DTO PUT involved.
      await respondOpenSilexErrors(res, async () => {
        if (unlink) await ctx.unlink(id, unlink.uri);
        for (const uri of link?.uris ?? []) await ctx.link(id, uri);
        const dto = (await authedGetOne(config.getUrl(id))).result;
        const body = JSON.stringify({ id, type, label: String(dto.name ?? id), relations: await relationsFor(id, dto, config) });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(body);
      });
      return true;
    }
    if (name && config.rename) {
      await respondOpenSilexErrors(res, async () => {
        const label = await config.rename!(id, name);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id, type, label }));
      });
      return true;
    }
    await respondOpenSilexErrors(res, async () => {
      const current = await updateNode(config, id, { name, unlink, link, isPublic });
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
      const body = JSON.stringify({
        id,
        type,
        label: finalName,
        ...(unlink ? { relations: await relationsFor(id, patched, config) } : {}),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
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
      const blocked = config.deleteBlockedBy && (await config.deleteBlockedBy((await authedGetOne(config.getUrl(id))).result, id));
      if (blocked) {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: `It ${blocked}` }));
        return;
      }
      // Enforced here, not just in the UI: OpenSILEX deletes e.g. a non-empty experiment and
      // orphans its scientific objects (undeletable afterwards) — probed live.
      for (const q of (config.queryRelations ?? []).filter((q) => q.blocksDelete)) {
        const blockers = await queryItems(q, id);
        if (blockers.length) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Can't delete yet: ${blockers.map((b) => b.label).join(", ")} ${blockers.length === 1 ? "is" : "are"} still in it (${q.label.toLowerCase()}). Remove ${blockers.length === 1 ? "it" : "them"} first, or ${blockers.length === 1 ? "it" : "they"} would be left behind with nowhere to belong.` }));
          return;
        }
      }
      for (const url of (await config.deleteFirst?.(id)) ?? []) await authedDelete(url);
      if (config.remove) await config.remove(id);
      else await authedDelete(config.deleteUrl(id));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    return true;
  }

  return false;
};
