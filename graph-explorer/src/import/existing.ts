// Importing into an experiment that already exists is a fill (user, 2026-10-05): what the files have
// and PHIS lacks is added — objects, trays, factors and levels, an object's germplasm, factor levels,
// tray and position, measured values — and nothing in PHIS is changed. Where PHIS says something else,
// it's listed in the plan and PHIS is kept. Fewer orphans: an old import gets its trays and values.
import { authedGet, authedGetOne, authedPost, authedPut, compactUri } from "../opensilex.ts";
import { POSITION_IN_TRAY } from "./ontology.ts";
import type { TrialData } from "./plugins.ts";
import type { Value } from "./measurements.ts";

const enc = encodeURIComponent;
const localName = (p: unknown) => String(p).split(/[:#/]/).pop()!;
const AT_ONCE = 8;
type Obj = TrialData["objects"][number];
type Relation = { property: string; value: string };
export type Factor = { uri: string; name: string; experiment: string; levels: { uri: string; name: string; description?: string | null }[] };
// What one existing object lacks, by name — turned into uris when it's written.
export type Fill = { name: string; uri: string; germplasm?: string; levels: [string, string][]; parent?: string; position?: number };
export type Experiment = Awaited<ReturnType<typeof readExperiment>>;

async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += AT_ONCE) await Promise.all(items.slice(i, i + AT_ONCE).map(fn));
}

export async function readExperiment(id: string) {
  const objects = (await authedGet(`/core/scientific_objects?experiment=${enc(id)}&page_size=100000`)).result;
  const factors = (await authedGet(`/core/experiments/${enc(id)}/factors`)).result as unknown as Factor[];
  return { id, objects: new Map(objects.map((o) => [String(o.name), String(o.uri)])), factors };
}

// Each file object already in the experiment, against its copy there: what to add, what disagrees.
export async function compareObjects(objects: Obj[], exp: Experiment, germplasmIds: Map<string, string>) {
  const fills: Fill[] = [];
  const conflicts: string[] = [];
  const objectName = new Map(await Promise.all([...exp.objects].map(async ([n, u]) => [await compactUri(u), n] as const)));
  const levelNames = new Map<string, { factor: string; level: string }>();
  for (const f of exp.factors) for (const l of f.levels) levelNames.set(await compactUri(l.uri), { factor: f.name, level: l.name });
  const germplasmName = async (uri: string) => String((await authedGetOne(`/core/germplasm/${enc(uri)}`)).result.name ?? uri);

  await inBatches(objects.filter((o) => exp.objects.has(o.name)), async (o) => {
    const uri = exp.objects.get(o.name)!;
    const copy = (await authedGetOne(`/core/scientific_objects/${enc(uri)}?experiment=${enc(exp.id)}`)).result;
    const rels = ((Array.isArray(copy.relations) ? copy.relations : []) as Relation[]).map((r) => ({ p: localName(r.property), v: String(r.value) }));
    const of = (p: string) => rels.filter((r) => r.p === p);
    const fill: Fill = { name: o.name, uri, levels: [] };
    const differ = (phis: string, file: string) => conflicts.push(`${o.name}: PHIS has ${phis}, the file ${file}`);

    if (o.germplasm) {
      const g = of("hasGermplasm");
      const want = germplasmIds.get(o.germplasm);
      const wantC = want ? await compactUri(want) : null;
      if (!g.length) fill.germplasm = o.germplasm;
      else if (!wantC || !(await Promise.all(g.map((r) => compactUri(r.v)))).includes(wantC)) differ(await germplasmName(g[0].v), o.germplasm);
    }
    const levelsNow = await Promise.all(of("hasFactorLevel").map(async (r) => levelNames.get(await compactUri(r.v))));
    for (const [factor, level] of Object.entries(o.factors)) {
      const now = levelsNow.find((x) => x?.factor.toLowerCase() === factor.toLowerCase());
      if (!now) fill.levels.push([factor, level]);
      else if (now.level !== level) differ(`${factor} ${now.level}`, `${factor} ${level}`);
    }
    if (o.parent) {
      const p = of("isPartOf");
      if (!p.length) fill.parent = o.parent;
      else {
        const names = await Promise.all(p.map(async (r) => objectName.get(await compactUri(r.v)) ?? r.v));
        if (!names.includes(o.parent)) differ(`it in ${names.join(", ")}`, `in ${o.parent}`);
      }
    }
    if (o.position !== undefined) {
      const pos = of(localName(POSITION_IN_TRAY));
      if (!pos.length) fill.position = o.position;
      else if (Number(pos[0].v) !== o.position) differ(`position ${pos[0].v}`, `position ${o.position}`);
    }
    if (fill.germplasm || fill.levels.length || fill.parent || fill.position !== undefined) fills.push(fill);
  });
  fills.sort((a, b) => a.name.localeCompare(b.name));
  conflicts.sort();
  return { fills, conflicts };
}

// Adds what one object lacks to its copy in the experiment: read fresh, every relation sent back.
export async function writeFill(fill: Fill, expId: string, ids: { germplasm: Map<string, string>; levels: Map<string, string>; objects: Map<string, string> }) {
  const copy = (await authedGetOne(`/core/scientific_objects/${enc(fill.uri)}?experiment=${enc(expId)}`)).result;
  const relations = ((Array.isArray(copy.relations) ? copy.relations : []) as (Relation & { inverse?: boolean })[])
    .map((r) => ({ property: r.property, value: r.value, inverse: Boolean(r.inverse) }));
  const add = (property: string, value: string | undefined) => { if (value) relations.push({ property, value, inverse: false }); };
  if (fill.germplasm) add("vocabulary:hasGermplasm", ids.germplasm.get(fill.germplasm));
  for (const [f, l] of fill.levels) add("vocabulary:hasFactorLevel", ids.levels.get(`${f}|${l}`));
  if (fill.parent) add("vocabulary:isPartOf", ids.objects.get(fill.parent));
  if (fill.position !== undefined) add(POSITION_IN_TRAY, String(fill.position));
  await authedPut("/core/scientific_objects", { uri: fill.uri, name: copy.name, rdf_type: copy.rdf_type, experiment: expId, relations });
}

// The values PHIS already has in the experiment, keyed like the file's: object|variable|local time.
const PAGE = 5000;
export async function valuesIn(exp: Experiment, variableIds: Map<string, string>, timezone: string) {
  const objectName = new Map(await Promise.all([...exp.objects].map(async ([n, u]) => [await compactUri(u), n] as const)));
  const variableName = new Map(await Promise.all([...variableIds].map(async ([n, u]) => [await compactUri(u), n] as const)));
  const local = new Intl.DateTimeFormat("sv-SE", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const out = new Map<string, number>();
  for (let page = 0; ; page++) {
    const rows = (await authedPost(`/core/data/search?experiments=${enc(exp.id)}&page_size=${PAGE}&page=${page}`, [])).result as unknown as { target: string; variable: string; date: string; value: unknown }[];
    for (const r of rows) {
      const o = objectName.get(await compactUri(r.target));
      const v = variableName.get(await compactUri(r.variable));
      // PHIS answers "2025-10-22T13:19:34.000+0200"; Date wants "+02:00".
      const at = local.format(new Date(r.date.replace(/([+-]\d\d)(\d\d)$/, "$1:$2"))).replace(" ", "T");
      if (o && v) out.set(`${o}|${v}|${at}`, Number(r.value));
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// The file's values against PHIS's: already there (same value), different (PHIS kept), or new.
export function newValues(values: Value[], inPhis: Map<string, number>) {
  let already = 0;
  const differ: string[] = [];
  const fresh = values.filter((v) => {
    const there = inPhis.get(`${v.object}|${v.variable}|${v.date}`);
    if (there === undefined) return true;
    if (there === v.value) already++;
    else differ.push(`${v.object}, ${v.variable}, ${v.date.replace("T", " ")}: PHIS has ${there}, the file ${v.value}`);
    return false;
  });
  return { fresh, already, differ };
}
