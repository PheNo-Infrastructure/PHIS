import { authedGetOne, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";
import { NODE_TYPES, applyLink, resolveLink, type CarryOver, type ResolvedLink } from "../node-types.ts";

// Links a whole selection of EXISTING nodes directly (no third node created) — the counterpart
// to the unlink flow in routes/node.ts, and to /api/create's `links` (which links a NEW node to
// an existing selection). Mirrors how /api/create already treats a multi-type selection:
// everything selected gets linked, regardless of how many distinct types are in the mix — e.g.
// selecting 4 facilities and 1 organization links all 4 to that org, in one PUT to the org
// (batched), not 4 separate calls.
export const handleLink: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/link" || req.method !== "POST") return false;

  // `experiments`: the user's pick for links that live inside an experiment (see below).
  const body = (await readJsonBody(req)) as { items?: { type: string; id: string }[]; experiments?: string[] };
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
  // Pairs that can only be linked INSIDE an experiment (a scientific object's germplasm).
  const inExp: { ownerType: string; otherType: string; field: string; ownerIds: string[]; otherIds: string[] }[] = [];
  for (let i = 0; i < types.length; i++) {
    for (let j = i + 1; j < types.length; j++) {
      const r = resolveLink(types[i], types[j]);
      if (!r) {
        for (const [owner, other] of [[types[i], types[j]], [types[j], types[i]]]) {
          const field = NODE_TYPES[owner]?.inExperiment?.byType[other];
          if (field) inExp.push({ ownerType: owner, otherType: other, field, ownerIds: idsByType.get(owner)!, otherIds: idsByType.get(other)! });
        }
        continue;
      }
      const other = r.ownerType === types[i] ? types[j] : types[i];
      ops.push({ r, ownerIds: idsByType.get(r.ownerType)!, otherIds: idsByType.get(other)! });
    }
  }
  if (!ops.length && !inExp.length) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "nothing in this selection can be linked directly" }));
    return true;
  }

  await respondOpenSilexErrors(res, async () => {
    // In-experiment pairs are checked BEFORE anything is written: an object in no experiment
    // can't hold the link at all, and one in several needs the user's pick (nothing ticked by
    // default) — either way the answer is `needsExperiment` and nothing changes yet.
    const targets: { ownerType: string; field: string; id: string; exps: { id: string; label: string }[]; otherIds: string[]; fixed?: true }[] = [];
    const chosen = body.experiments ? new Set(await Promise.all(body.experiments.map(compactUri))) : null;
    const notInAny: { id: string; label: string }[] = [];
    const choices = new Map<string, { id: string; label: string; objects: number }>();
    let needsChoice = false;
    const notInFixed: { id: string; label: string }[] = [];
    let placeOptions: { id: string; type: string; label: string }[] | null = null;
    for (const p of inExp) {
      const cfg = NODE_TYPES[p.ownerType].inExperiment!;
      const fixed = cfg.fixedExperiment?.[p.otherType] ? await cfg.fixedExperiment[p.otherType](p.otherIds) : null;
      for (const id of p.ownerIds) {
        const exps = await cfg.experimentsOf(id);
        if (fixed) {
          // The value belongs to one experiment: write there only; an object not in it is asked
          // to be added there first (the page's lone-object question), never silently skipped.
          const key = await compactUri(fixed.id);
          const there = (await Promise.all(exps.map(async (e) => ((await compactUri(e.id)) === key ? e : null)))).filter((e) => e !== null);
          if (!there.length) {
            notInFixed.push({ id, label: String((await authedGetOne(NODE_TYPES[p.ownerType].getUrl(id))).result.name ?? id) });
            placeOptions = [{ id: fixed.id, type: "experiment", label: fixed.label }];
            continue;
          }
          targets.push({ ownerType: p.ownerType, field: p.field, id, exps: there, otherIds: p.otherIds, fixed: true });
          continue;
        }
        if (!exps.length) {
          notInAny.push({ id, label: String((await authedGetOne(NODE_TYPES[p.ownerType].getUrl(id))).result.name ?? id) });
          continue;
        }
        if (exps.length > 1 && !chosen) needsChoice = true;
        for (const e of exps) {
          const c = choices.get(e.id) ?? { id: e.id, label: e.label, objects: 0 };
          c.objects++;
          choices.set(e.id, c);
        }
        const keep = chosen ? (await Promise.all(exps.map(async (e) => (chosen.has(await compactUri(e.id)) ? e : null)))).filter((e) => e !== null) : exps;
        targets.push({ ownerType: p.ownerType, field: p.field, id, exps: keep, otherIds: p.otherIds });
      }
    }
    if (notInFixed.length) {
      const out = JSON.stringify({ needsExperiment: { notInAny: notInFixed, placeOptions } });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
      return;
    }
    if (notInAny.length || needsChoice) {
      const out = JSON.stringify({ needsExperiment: { notInAny, ...(needsChoice && !notInAny.length ? { experiments: [...choices.values()], objects: targets.length } : {}) } });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(out);
      return;
    }

    let linkedPairs = 0;
    let alreadyLinked = 0;
    let skipped = 0;
    const touched = new Set<string>();
    const carryOver: CarryOver[] = [];
    const childOffer: CarryOver[] = [];
    // What went where, so the page can say it — including when the experiment was the object's
    // only one and nobody was asked (`only`).
    const written: { id: string; values: string[]; experiments: string[]; only: boolean }[] = [];
    for (const t of targets) {
      if (!t.exps.length) skipped++;
      else written.push({ id: t.id, values: t.otherIds, experiments: t.exps.map((e) => e.label), only: !chosen && !t.fixed });
      const cfg = NODE_TYPES[t.ownerType].inExperiment!;
      for (const e of t.exps) {
        await cfg.update(t.id, e.id, { field: t.field, add: t.otherIds });
        linkedPairs += t.otherIds.length;
        touched.add(e.id);
        if (cfg.childOffer && !t.fixed) childOffer.push(...(await cfg.childOffer(t.id, e.id, t.field, t.otherIds)));
      }
    }
    for (const op of ops) {
      const r = await applyLink(op.r, op.ownerIds, op.otherIds);
      linkedPairs += r.linked;
      alreadyLinked += r.already;
      carryOver.push(...r.carryOver);
    }
    // Labels the new links left behind (e.g. an object's germplasm from its other experiments) —
    // the page offers them, nothing ticked; only a pick writes anything.
    const out = JSON.stringify({
      ok: true, linkedPairs, alreadyLinked,
      ...(carryOver.length ? { carryOver } : {}),
      // Children (part of these objects there) that don't have the new germplasm — offered too.
      ...(childOffer.length ? { childOffer } : {}),
      ...(written.length ? { written } : {}),
      // Experiments whose derived data (Species) changed, and objects not in any picked one.
      ...(touched.size ? { touched: [...touched] } : {}),
      ...(skipped ? { skipped } : {}),
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(out);
  });
  return true;
};
