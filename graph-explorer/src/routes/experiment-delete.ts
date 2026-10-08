import { OpenSilexError, authedDelete, authedGet, authedGetOne, authedPost, authedPut, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { NODE_TYPES } from "../node-types.ts";
import { objectsElsewhere } from "./elsewhere.ts";

const enc = encodeURIComponent;
// The name is typed to confirm, and names carry dashes like "–" that few keyboards have: every kind of dash counts as "-",
// and case and repeated spaces don't matter.
export const sameTypedName = (a: string, b: string) => {
  const norm = (s: string) => s.replace(/[‐-―−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) === norm(b);
};
const AT_ONCE = 4; // deletes in flight: each costs OpenSILEX CPU, like the import's writes
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;
const countValues = async (query: string) => Number((await authedPost(`/core/data/count?${query}&count_limit=10000000`, [])).result) || 0;

// Everything an experiment's "delete it and everything in it" would remove, counted right now.
// Objects also in another experiment are only taken out of this one; shared things (germplasm, variables, groups) stay.
async function look(id: string) {
  const exp = (await authedGetOne(`/core/experiments/${enc(id)}`)).result;
  const objects = (await authedGet(`/core/scientific_objects?experiment=${enc(id)}&page_size=5000`)).result;
  const elsewhere = await objectsElsewhere(id);
  const isTray = (o: Record<string, unknown>) => /tray/i.test(String(o.rdf_type_name ?? o.rdf_type));
  const values = await countValues(`experiments=${enc(id)}`);
  const factors = (await authedGet(`/core/experiments/${enc(id)}/factors`)).result;
  const provenances = (await authedGet(`/core/experiments/${enc(id)}/provenances?page_size=500`)).result;
  const variables = values ? (await authedGet(`/core/experiments/${enc(id)}/variables`)).result : [];
  // Notes about the experiment or its provenances (the import keeps one).
  const notes = new Map<string, Record<string, unknown>>();
  for (const uri of [id, ...provenances.map((p) => String(p.uri))]) for (const n of (await authedGet(`/core/annotations?target=${enc(uri)}&page_size=200`)).result) notes.set(String(n.uri), n);
  return { exp, name: String(exp.name ?? id), objects, isTray, elsewhere, values, factors, provenances, variables, notes: [...notes.values()] };
}
// A note about what has just been deleted: gone if that was all it was about, otherwise it loses those targets.
async function tidyNotes(notes: Record<string, unknown>[], goneUris: string[]) {
  const gone = new Set(await Promise.all(goneUris.map(compactUri)));
  let removed = 0;
  for (const n of notes) {
    const targets = ((n.targets ?? []) as string[]).map(String);
    const keep: string[] = [];
    for (const t of targets) if (!gone.has(await compactUri(t))) keep.push(t);
    if (keep.length === targets.length) continue;
    if (!keep.length) { await authedDelete(`/core/annotations/${enc(String(n.uri))}`); removed++; continue; }
    const m = n.motivation as { uri?: string } | string | null;
    await authedPut("/core/annotations", { uri: n.uri, description: n.description, motivation: typeof m === "string" ? m : m?.uri, targets: keep });
  }
  return removed;
}

// GET    /api/experiment-delete/preview?id=<uri>           -> what would go and what would stay (nothing is written)
// DELETE /api/experiment-delete?id=<uri>&name=<its name>   -> does it, streaming {"progress":…} lines, then {"result":…} or {"error":…}
// The name must be typed in full: a stray click or a copied request can't wipe measured values.
export const handleExperimentDelete: RouteHandler = async (req, res, { pathname, searchParams }) => {
  const route = { "/api/experiment-delete/preview": "preview", "/api/experiment-delete": "run" }[pathname];
  if (!route || req.method !== (route === "preview" ? "GET" : "DELETE")) return false;
  const id = searchParams.get("id");
  if (!id) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "id is required" }));
    return true;
  }

  if (route === "preview") {
    await respondOpenSilexErrors(res, async () => {
      const l = await look(id);
      const shared = l.objects.filter((o) => l.elsewhere[String(o.uri)]?.length).length;
      const trays = l.objects.filter(l.isTray).length;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        name: l.name,
        objects: l.objects.length, trays, shared,
        values: l.values, factors: l.factors.length, provenances: l.provenances.map((p) => String(p.name ?? p.uri)), notes: l.notes.length,
      }));
    });
    return true;
  }

  // The run: the NDJSON stream keeps the connection alive for the minutes a big trial takes. A refusal before the
  // first write is still a plain error status. Closing the page doesn't stop it: the server finishes.
  let streaming = false;
  const line = (o: unknown) => { if (!streaming) { res.writeHead(200, { "Content-Type": "application/x-ndjson" }); streaming = true; } res.write(JSON.stringify(o) + "\n"); };
  try {
    const l = await look(id);
    if (!sameTypedName(searchParams.get("name") ?? "", l.name)) throw new OpenSilexError(400, "Type the experiment's name to confirm (a plain - works in place of a long dash).");
    const cleared = { variables: 0, values: l.values, provenances: 0, kept: [] as string[], removed: 0, deleted: 0, factors: 0, notes: 0 };
    const steps = l.variables.length + l.provenances.length + l.objects.length + l.factors.length + 2;
    const goneProvenances: string[] = [];
    let done = 0;
    const tick = (step: string) => line({ progress: { step, done: ++done, total: steps } });

    // 1. The experiment's measured values, one variable at a time (so there is progress, and no call runs for minutes).
    for (const v of l.variables) {
      await authedDelete(`/core/data?experiment=${enc(id)}&variable=${enc(String(v.uri))}`);
      tick(`Deleting measured values: variable ${++cleared.variables} of ${l.variables.length}`);
    }
    // 2. Provenances that now describe nothing (one shared with another experiment's values stays).
    let seen = 0;
    for (const p of l.provenances) {
      if (await countValues(`provenances=${enc(String(p.uri))}`)) cleared.kept.push(String(p.name ?? p.uri));
      else { await authedDelete(`/core/provenances/${enc(String(p.uri))}`); cleared.provenances++; goneProvenances.push(String(p.uri)); }
      tick(`Cleaning up provenances: ${++seen} of ${l.provenances.length}`);
    }
    // 3. Objects: what is part of a tray first, trays last; four at a time.
    const failed: string[] = [];
    const objectGone = async (o: Record<string, unknown>) => {
      const uri = String(o.uri);
      try {
        if (l.elsewhere[uri]?.length) { await authedDelete(`/core/scientific_objects/${enc(uri)}?experiment=${enc(id)}`); cleared.removed++; }
        else {
          for (const url of await NODE_TYPES.scientific_object.deleteFirst!(uri)) await authedDelete(url);
          await authedDelete(NODE_TYPES.scientific_object.deleteUrl(uri));
          cleared.deleted++;
        }
      } catch (err) {
        failed.push(`${o.name ?? uri} (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`);
      }
      tick(`Deleting scientific objects: ${cleared.removed + cleared.deleted + failed.length} of ${l.objects.length}`);
    };
    for (const pass of [l.objects.filter((o) => !l.isTray(o)), l.objects.filter(l.isTray)]) {
      for (let i = 0; i < pass.length; i += AT_ONCE) await Promise.all(pass.slice(i, i + AT_ONCE).map(objectGone));
    }
    if (failed.length) {
      throw new OpenSilexError(409, `${plural(failed.length, "scientific object")} could not be deleted (${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "; …" : ""}), so the experiment is kept. Fix that and run this again: what is already gone is skipped.`);
    }
    // 4. The factors (their levels went with the objects that used them), 5. the experiment.
    for (const f of l.factors) {
      await authedDelete(`/core/experiments/factors/${enc(String(f.uri))}`);
      cleared.factors++;
      tick(`Deleting factors: ${cleared.factors} of ${l.factors.length}`);
    }
    cleared.notes = await tidyNotes(l.notes, [id, ...goneProvenances]);
    tick("Tidying annotations about it");
    await authedDelete(`/core/experiments/${enc(id)}`);
    tick("Deleted the experiment");
    if (!streaming) line({});
    line({ result: { name: l.name, ...cleared } });
    res.end();
  } catch (err) {
    if (!streaming) {
      await respondOpenSilexErrors(res, async () => { throw err; });
      return true;
    }
    line({ error: `The delete stopped part-way: ${err instanceof Error ? err.message : String(err)}${err instanceof OpenSilexError && err.status === 409 ? "" : " Run it again to finish: what is already gone is skipped."}` });
    res.end();
  }
  return true;
};
