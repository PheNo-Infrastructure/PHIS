import { authedGetOne, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { NODE_TYPES } from "../node-types.ts";

// Parent/child between two nodes of the same type that lives INSIDE an experiment — "child is
// part of parent" for scientific objects (NodeConfig.inExperiment.parentField). The page's
// ranking modal sends explicit pairs, so direction is never guessed. Like /api/link's
// in-experiment pairs, everything is checked before anything is written: the link can only go
// in an experiment BOTH objects are in; a pair with none shared, or several shared and no
// `experiments` picked, makes the answer `needsExperiment` and nothing changes yet.
export const handleParent: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/parent" || req.method !== "POST") return false;

  const body = (await readJsonBody(req)) as { type?: string; pairs?: { child: string; parent: string }[]; experiments?: string[] };
  const config = body.type ? NODE_TYPES[body.type] : undefined;
  const field = config?.inExperiment?.parentField;
  const pairs = (body.pairs ?? []).filter((p) => p?.child && p?.parent);
  if (!config || !field || !pairs.length || pairs.some((p) => p.child === p.parent)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "needs a type with a parent relation and at least one child/parent pair of two different nodes" }));
    return true;
  }
  const cfg = config.inExperiment!;

  await respondOpenSilexErrors(res, async () => {
    const expsOf = new Map<string, { id: string; label: string; key: string }[]>();
    const experiments = async (id: string) => {
      if (!expsOf.has(id)) expsOf.set(id, await Promise.all((await cfg.experimentsOf(id)).map(async (e) => ({ ...e, key: await compactUri(e.id) }))));
      return expsOf.get(id)!;
    };
    const name = async (id: string) => String((await authedGetOne(config.getUrl(id))).result.name ?? id);
    const chosen = body.experiments ? new Set(await Promise.all(body.experiments.map(compactUri))) : null;

    const noShared: { id: string; label: string; parent: string; parentLabel: string; parentExperiments: { id: string; label: string }[] }[] = [];
    const choices = new Map<string, { id: string; label: string; objects: number }>();
    const writes: { child: string; parent: string; exps: { id: string; label: string }[] }[] = [];
    let needsChoice = false;
    for (const p of pairs) {
      const parentExps = await experiments(p.parent);
      const shared = (await experiments(p.child)).filter((e) => parentExps.some((x) => x.key === e.key));
      if (!shared.length) {
        noShared.push({ id: p.child, label: await name(p.child), parent: p.parent, parentLabel: await name(p.parent), parentExperiments: parentExps.map(({ id, label }) => ({ id, label })) });
        continue;
      }
      if (shared.length > 1 && !chosen) needsChoice = true;
      for (const e of shared) {
        const c = choices.get(e.key) ?? { id: e.id, label: e.label, objects: 0 };
        c.objects++;
        choices.set(e.key, c);
      }
      writes.push({ child: p.child, parent: p.parent, exps: chosen ? shared.filter((e) => chosen.has(e.key)) : shared });
    }
    if (noShared.length || needsChoice) {
      const out = JSON.stringify({ needsExperiment: noShared.length ? { noShared } : { notInAny: [], experiments: [...choices.values()], objects: pairs.length } });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
      return;
    }

    let linkedPairs = 0;
    let skipped = 0;
    const touched = new Set<string>();
    const written: { child: string; parent: string; experiments: string[]; only: boolean }[] = [];
    for (const w of writes) {
      if (!w.exps.length) skipped++;
      else written.push({ child: w.child, parent: w.parent, experiments: w.exps.map((e) => (e as { label: string }).label), only: !chosen });
      for (const e of w.exps) {
        await cfg.update(w.child, e.id, { field, add: [w.parent] }); // single-valued: replaces any earlier parent there
        linkedPairs++;
        touched.add(e.id);
      }
    }
    const out = JSON.stringify({ ok: true, linkedPairs, written, ...(touched.size ? { touched: [...touched] } : {}), ...(skipped ? { skipped } : {}) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(out);
  });
  return true;
};
