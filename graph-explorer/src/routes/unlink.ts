import { authedGetOne, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { NODE_TYPES, personName, refUri, resolveLink, updateNode } from "../node-types.ts";
import { PERSON_ROLES } from "../adjacency.js";

// "Unlink selection" (selection-first design): every link that exists BETWEEN the selected
// items, whatever kind it is — a DTO field (site <-> organization, organization parents), an
// operation (object <-> experiment), or a link inside an experiment (an object's germplasm or
// parent there). Without `confirm` it only lists them in plain words, for the page's confirm;
// with `confirm` it removes them in order and stops at the first failure.
type Item = { type: string; id: string };
type Found = { text: string; run: () => Promise<unknown>; touched?: string };

async function findLinks(items: Item[]): Promise<Found[]> {
  const names = new Map<string, Promise<string>>();
  const dtos = new Map<string, Promise<Record<string, unknown>>>();
  const dto = (it: Item) => {
    if (!dtos.has(it.id)) dtos.set(it.id, authedGetOne(NODE_TYPES[it.type].getUrl(it.id)).then((r) => r.result));
    return dtos.get(it.id)!;
  };
  const name = (it: Item) => {
    if (!names.has(it.id)) names.set(it.id, dto(it).then((d) => String(d.name ?? it.id)));
    return names.get(it.id)!;
  };
  const same = async (a: string, b: string) => (await compactUri(a)) === (await compactUri(b));
  const has = async (list: string[], id: string) => (await Promise.all(list.map((x) => same(x, id)))).some(Boolean);
  const out: Found[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      for (const [o, x] of [[items[i], items[j]], [items[j], items[i]]] as const) {
        const cfg = NODE_TYPES[o.type]?.inExperiment;
        // Inside an experiment: germplasm on an object, or an object being part of another.
        const field = o.type === x.type ? cfg?.parentField : cfg?.byType[x.type];
        if (cfg && field) {
          for (const e of await cfg.experimentsOf(o.id)) {
            if (!(await has(await cfg.valuesIn(o.id, e.id, field), x.id))) continue;
            out.push({
              text: o.type === x.type ? `${await name(o)} is part of ${await name(x)} in ${e.label}` : `${await name(x)} on ${await name(o)} in ${e.label}`,
              run: () => cfg.update(o.id, e.id, { field, remove: x.id }),
              touched: e.id,
            });
          }
        }
        // A DTO field between two nodes of the same type (organization parents).
        if (o.type === x.type) {
          const nc = NODE_TYPES[o.type];
          for (const rg of nc?.relationGroups.filter((g) => g.type === o.type && nc.updateLinkFields.includes(g.field)) ?? []) {
            const refs = (await dto(o))[rg.field];
            if (!Array.isArray(refs) || !(await has((refs as ({ uri: string } | string)[]).map(refUri), x.id))) continue;
            out.push({ text: `${await name(o)} — ${rg.label.toLowerCase()}: ${await name(x)}`, run: () => updateNode(nc, o.id, { unlink: { field: rg.field, uri: x.id } }) });
          }
        }
      }
      const [a, b] = [items[i], items[j]];
      if (a.type === b.type) continue;
      if (a.type === "account" || b.type === "account") continue; // a person's account is set once and stays
      // A person sits in an experiment or project under some role(s): every role holding them is listed.
      const [boss, person] = a.type === "person" ? [b, a] : [a, b];
      const roles = person.type === "person" ? (PERSON_ROLES as Record<string, { field: string; label: string }[]>)[boss.type] : undefined;
      if (roles) {
        const refs = await dto(boss);
        const who = personName((await authedGetOne(NODE_TYPES.person.getUrl(person.id))).result);
        for (const role of roles) {
          const list = refs[role.field];
          if (!Array.isArray(list) || !(await has((list as ({ uri: string } | string)[]).map(refUri), person.id))) continue;
          out.push({ text: `${await name(boss)} — ${role.label}s: ${who}`, run: () => updateNode(NODE_TYPES[boss.type], boss.id, { unlink: { field: role.field, uri: person.id } }) });
        }
        continue;
      }
      const r = resolveLink(a.type, b.type);
      if (!r) continue;
      const [owner, other] = r.ownerType === a.type ? [a, b] : [b, a];
      if (r.ctx) {
        if (!(await has(await r.ctx.current(owner.id), other.id))) continue;
        const [so, exp] = owner.type === "scientific_object" ? [owner, other] : [other, owner];
        out.push({
          text: `${await name(so)} is in ${await name(exp)} — removing it there also removes what it has in that experiment (germplasm, parent)`,
          run: () => r.ctx!.unlink(owner.id, other.id),
          touched: exp.id,
        });
      } else {
        const refs = (await dto(owner))[r.field];
        if (!Array.isArray(refs) || !(await has((refs as ({ uri: string } | string)[]).map(refUri), other.id))) continue;
        const label = NODE_TYPES[owner.type].relationGroups.find((g) => g.field === r.field)?.label ?? r.field;
        out.push({ text: `${await name(owner)} — ${label.toLowerCase()}: ${await name(other)}`, run: () => updateNode(NODE_TYPES[owner.type], owner.id, { unlink: { field: r.field, uri: other.id } }) });
      }
    }
  }
  return out;
}

export const handleUnlink: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/unlink" || req.method !== "POST") return false;
  const body = (await readJsonBody(req)) as { items?: Item[]; confirm?: boolean };
  const items = (body.items ?? []).filter((it) => it?.type && it?.id && NODE_TYPES[it.type]);
  if (items.length < 2) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "at least two items the app knows are required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const found = await findLinks(items);
    if (!body.confirm) {
      const out = JSON.stringify({ links: found.map((f) => f.text) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
      return;
    }
    const removed: string[] = [];
    const touched = new Set<string>();
    for (const f of found) {
      try {
        await f.run();
      } catch (err) {
        // Stop at the first failure and say what was already done.
        const out = JSON.stringify({ removed, failed: f.text, error: err instanceof Error ? err.message.split("\n")[0] : String(err), touched: [...touched] });
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(out);
        return;
      }
      removed.push(f.text);
      if (f.touched) touched.add(f.touched);
    }
    const out = JSON.stringify({ removed, touched: [...touched] });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(out);
  });
  return true;
};
