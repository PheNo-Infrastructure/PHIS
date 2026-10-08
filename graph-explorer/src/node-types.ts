import { OpenSilexError, authedGet, authedGetOne, authedPost, authedPut, authedDelete, compactUri, escapeRegex } from "./opensilex.ts";
import { experimentStructure } from "./experiment-structure.ts";

// View/edit/delete config, one entry per type — same reasoning as CREATABLE in creation.js:
// adding a type is "add one entry here," not a new code path. Unlike CREATABLE this doesn't
// need to be shared with the browser (the frontend never sees DTO field names, only the
// {label, items} shape the backend already translated), so it stays plain TS, not inlined JS.
// nameField: for a single-uri field (a germplasm's `species`), the DTO field holding its label
// (`species_name`).
// kind: what the item is within its type (a germplasm's species/variety/accession), for the page.
export type RelationGroup = { label: string; field: string; type: string; nameField?: string; kind?: string };

export type Action = "rename" | "delete" | "link";
export const allows = (config: NodeConfig, action: Action) => (config.actions ?? ["rename", "delete", "link"]).includes(action);

export type NodeConfig = {
  getUrl: (id: string) => string;
  putUrl: string;
  deleteUrl: (id: string) => string;
  // Every relation worth showing in the detail pane.
  relationGroups: RelationGroup[];
  // Subset of relationGroups[].field that the type's UpdateDTO actually accepts — read-modify-
  // write on rename carries only these forward, since some GetDTO relations (e.g. an
  // organization's derived `children`/`experiments`) aren't settable fields at all.
  updateLinkFields: string[];
  // What the app may do with this type — default all three. The backend refuses the rest, the
  // frontend hides them, and only "link" types belong in the mockup's LINKABLE_TYPES. E.g. a
  // move event can only be deleted.
  actions?: Action[];
  // Delete goes ahead with links still in place — OpenSILEX drops them with the node (confirmed
  // for sites and experiments) — so the confirm names them instead of routing to unlink mode.
  deleteRemovesLinks?: true;
  // Why OpenSILEX will refuse deleting THIS node, read from its own record — shown before the
  // user tries (node-detail's `deleteBlocked`) and enforced by the DELETE route.
  deleteBlockedBy?: (dto: Record<string, unknown>, id: string) => string | null | Promise<string | null>;
  // A blocked delete's way forward when the app can take it (a plant's measured values): offered in
  // the blocked banner as its own action, with its own confirm, counted when it's pressed.
  deleteBlockFix?: {
    check: (id: string, dto: Record<string, unknown>) => Promise<{ label: string; confirm: string } | null>;
    run: (id: string) => Promise<void>;
  };
  // DELETE calls to make before deleteUrl — e.g. a scientific object's per-experiment copies
  // (OpenSILEX refuses deleting the global copy while any experiment copy exists — probed).
  deleteFirst?: (id: string) => Promise<string[]>;
  // The whole UpdateDTO, when copying the GetDTO back would mangle it (a factor's levels are
  // {uri, name} objects that must go back as objects — probed).
  putPayload?: (dto: Record<string, unknown>, name: string) => Record<string, unknown>;
  // A sentence for the delete confirm when OpenSILEX's delete cascades somewhere the relations
  // don't show (a factor's levels vanish from the objects using them — probed). Counted, never guessed.
  deleteWarning?: (id: string, dto: Record<string, unknown>) => Promise<string>;
  // For a node that lives inside another one's record (a factor level inside its factor): rename,
  // delete and create save that record instead of putUrl/deleteUrl/CREATABLE.url. rename answers
  // the new label, create the new item. `experiment`: rename only the node's copy there (a
  // scientific object has one name per experiment).
  rename?: (id: string, name: string, experiment?: string) => Promise<string>;
  remove?: (id: string) => Promise<void>;
  create?: (payload: Record<string, unknown>) => Promise<{ id: string; label: string; [k: string]: unknown }>;
  // A few plain values shown under the title (an account's email/admin/enabled) — not resources.
  facts?: (dto: Record<string, unknown>) => { label: string; value: string }[];
  // Has an is_public flag the app can set (experiments, germplasm): shown in the detail pane and
  // changed from the selection pane. Other types have no visibility flag in OpenSILEX.
  visibility?: true;
  // Links that are an OPERATION, not a field on either DTO — keyed by the relation-group field
  // name the detail pane uses for them. A scientific object "in" an experiment is its own copy
  // in that experiment's graph (probed live): linking POSTs a copy there, unlinking deletes
  // that copy (the object's other experiments and its global copy stay). Registered on BOTH
  // types so either side's detail pane / selection can drive it.
  contextLinks?: Record<string, ContextLink>;
  // Links that exist only INSIDE one experiment (a scientific object's germplasm): /api/node's
  // PUT with an `experiment` routes here. `fields` = what may be written (the itemGroups rows'
  // `field`), so the detail pane and the route agree on what's editable.
  inExperiment?: {
    fields: string[];
    // Which field a link to another type goes into (germplasm -> hasGermplasm), for /api/link.
    byType: Record<string, string>;
    // The "part of" relation for /api/parent (child is part of parent), if the type has one.
    parentField?: string;
    experimentsOf: (id: string) => Promise<{ id: string; label: string }[]>;
    // Values that belong to ONE experiment (a factor level): keyed by the value's type, gives
    // that experiment — the link is written there only, and no "which experiment?" is asked.
    fixedExperiment?: Record<string, (valueIds: string[]) => Promise<{ id: string; label: string }>>;
    update: (id: string, expId: string, mod: { field: string; add?: string[]; remove?: string }) => Promise<void>;
    // After values were ADDED on a node inside an experiment: its children there (part of it)
    // lacking them — offered, never applied (a plot's variety doesn't pass down — probed).
    childOffer?: (id: string, expId: string, field: string, values: string[]) => Promise<CarryOver[]>;
    // The values (compacted ids) a node has in one row inside one experiment — for /api/unlink.
    valuesIn: (id: string, expId: string, field: string) => Promise<string[]>;
  };
  // Relation groups that aren't a field on the node's own DTO but come from a query — e.g. an
  // experiment's scientific objects (each SO points at its experiment, not the reverse).
  // Read-only in the detail pane (no `field`, so no Unlink). `item` maps a result row to a
  // chip (default: the row's own uri/name), or null to skip it.
  queryRelations?: {
    label: string;
    type: string;
    url: (id: string) => string;
    item?: (row: Record<string, unknown>) => { id: string; label: string; kind?: string } | null;
    // Builds the items itself instead of mapping `url`'s rows (labels that need the parent node).
    load?: (id: string) => Promise<{ id: string; label: string; [k: string]: unknown }[]>;
    // Makes the group's chips unlinkable (×), through contextLinks[field].
    field?: string;
    // Deleting the node is refused while this group is non-empty — e.g. an experiment that still
    // holds scientific objects: OpenSILEX would delete it anyway and orphan them (probed live).
    blocksDelete?: true;
    // Return ids compacted (phis:id/...), matching /api/germplasm's (see its parent comment).
    compactIds?: true;
    // The query also returns the node itself (germplasm ?species=X includes X) — drop it.
    skipSelf?: true;
    // What the node is WITHIN each item, e.g. a scientific object's germplasm and parent inside
    // each experiment (they live only on that experiment's copy). Shown as one box per item.
    itemGroups?: (id: string, itemId: string) => Promise<{ label: string; field?: string; type?: string; addable?: boolean; items: { id: string; type: string; label: string }[] }[]>;
    // Shown instead of hiding the group when it's empty.
    emptyText?: string;
  }[];
  // Extra structure for the node's page (an experiment's variables and factor boxes), sent beside `relations`.
  structure?: (id: string) => Promise<unknown>;
};

export type ContextLink = {
  otherType: string;
  current: (id: string) => Promise<string[]>; // ids of the other side currently linked
  link: (id: string, otherId: string) => Promise<void>;
  unlink: (id: string, otherId: string) => Promise<void>;
  // After a NEW link: labels the node has elsewhere that the new link didn't bring along (a
  // scientific object joining an experiment starts with none). Offered, never applied.
  carryOver?: (id: string, otherId: string) => Promise<CarryOver[]>;
};

// One label that could be copied into a new experiment copy — written only if the user picks it,
// through /api/node's in-experiment link (NodeConfig.inExperiment).
export type CarryOver = {
  type: string; id: string; label: string; // the object
  experiment: string; experimentLabel: string; // the copy it would go on
  field: string; value: string; valueType: string; valueLabel: string; from: string; // what, and which experiment has it
  parent?: string; // set = a child offer: `from` is then the parent's label, not an experiment
};

// Adding an existing SO to an experiment = POSTing a copy with the SAME uri into that
// experiment, carrying the global copy's name/type (a name must be unique per experiment —
// OpenSILEX 400s a clash, surfaced as-is). Removing = deleting that experiment's copy only.
async function addSoToExperiment(soId: string, expId: string) {
  const g = (await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}`)).result;
  await authedPost("/core/scientific_objects", { uri: soId, name: g.name, rdf_type: g.rdf_type, experiment: expId });
}
async function removeSoFromExperiment(soId: string, expId: string) {
  await authedDelete(`/core/scientific_objects/${encodeURIComponent(soId)}?experiment=${encodeURIComponent(expId)}`);
}

// What a scientific object is within one experiment. These live ONLY on its copy there (the
// global copy can't hold them, a new copy inherits nothing — probed live), so they're read per
// experiment. `property` is the relation's local name; `byUris` names the values in one call
// (`names` instead, for values with no by_uris endpoint).
// Flags: `removable` rows carry their property as the row's `field` (× in unlink mode; /api/node's
// in-experiment PUT accepts it). `addable` rows also get "+ Add", link by selection (/api/link)
// and are offered for carry-over. `single` = at most one value: setting one replaces the old
// (an object has one parent). Part of isn't addable: parent/child goes through the ranking
// modal (/api/parent), same as organizations.
const SO_ROWS_PER_EXPERIMENT = [
  { label: "Germplasm", property: "hasGermplasm", type: "germplasm", byUris: () => "/core/germplasm/by_uris", addable: true, removable: true, single: false },
  { label: "Part of", property: "isPartOf", type: "scientific_object", byUris: (expId: string) => `/core/scientific_objects/by_uris?experiment=${encodeURIComponent(expId)}`, addable: false, removable: true, single: true },
  // The other side of "part of" (OpenSILEX stores it only on the child): the objects part of
  // this one there, via the per-experiment parent filter (probed). Removing one clears ITS
  // isPartOf. Shown so a relation is visible and removable from both sides.
  { label: "Contains", property: "contains", inverseOf: "isPartOf", type: "scientific_object", byUris: (expId: string) => `/core/scientific_objects/by_uris?experiment=${encodeURIComponent(expId)}`, addable: false, removable: true, single: false },
  // A level has no node of its own beyond uri + name; its chip is "Replicate: 2" (type
  // factor_level, selectable). Removable here; set through Link selection (byType below), never
  // carried over or offered to children — levels belong to ONE experiment's factors.
  { label: "Factor levels", property: "hasFactorLevel", type: "factor_level", names: factorLevelChips, addable: false, removable: true, single: false },
];
type FactorDto = { uri: string; name: string; experiment: string; levels: { uri: string; name: string; description?: string | null }[] };
const levelItem = (f: FactorDto, l: { uri: string; name: string }) => ({ id: l.uri, type: "factor_level", label: `${f.name}: ${l.name}`, factor: f.uri });

// A level's uri is its factor's uri + "." + the level (probed: …/factor/<exp>.<factor>.<level>);
// the factor's own record confirms the level and names the experiment. Ids stay FULL: the factor
// endpoints 404 a prefixed uri (probed).
// ponytail: derives the factor from the uri shape; a level that doesn't match is refused (400), never guessed.
export async function factorOfLevel(levelId: string): Promise<FactorDto> {
  const cut = levelId.lastIndexOf(".");
  const f = cut > 0 ? ((await authedGetOne(`/core/experiments/factors/${encodeURIComponent(levelId.slice(0, cut))}`).catch(() => null))?.result as FactorDto | undefined) : undefined;
  if (!f?.levels?.some((l) => l.uri === levelId)) throw new OpenSilexError(400, `Not a factor level this app can resolve: ${levelId}`);
  return f;
}

// The one experiment a set of levels belongs to; refuses two levels of one factor (an object holds
// one level per factor) and levels from different experiments.
async function levelsExperiment(levelIds: string[]) {
  const factors = await Promise.all(levelIds.map(factorOfLevel));
  const seen = new Set<string>();
  for (const f of factors) {
    if (seen.has(f.uri)) throw new OpenSilexError(400, `Two levels of ${f.name} can't both be on a scientific object.`);
    seen.add(f.uri);
  }
  const exps = new Set(factors.map((f) => f.experiment));
  if (exps.size !== 1) throw new OpenSilexError(400, "These factor levels belong to different experiments.");
  const id = factors[0].experiment;
  return { id, label: String((await authedGetOne(`/core/experiments/${encodeURIComponent(id)}`)).result.name ?? id) };
}

// Every factor of the experiment with its levels comes back in one call — enough to name them all.
async function factorLevelChips(expId: string, uris: string[]) {
  const factors = (await authedGet(`/core/experiments/${encodeURIComponent(expId)}/factors`)).result as unknown as FactorDto[];
  const byLevel = new Map<string, ReturnType<typeof levelItem>>();
  for (const f of factors) for (const l of f.levels ?? []) byLevel.set(await compactUri(l.uri), levelItem(f, l));
  return Promise.all(uris.map(async (u) => byLevel.get(await compactUri(u)) ?? { id: u, type: "factor_level", label: u, factor: "" }));
}
const getFactor = async (id: string) => (await authedGetOne(`/core/experiments/factors/${encodeURIComponent(id)}`)).result as unknown as FactorDto;
async function factorLevelItems(factorId: string) {
  const f = await getFactor(factorId);
  return (f.levels ?? []).map((l) => levelItem(f, l));
}

// How many objects in the factor's experiment have any of these levels (OpenSILEX's factor_levels filter).
async function levelUsers(f: FactorDto, levelUris: string[]) {
  if (!levelUris.length || !f.experiment) return { n: 0, expName: "" };
  const filter = levelUris.map((u) => `factor_levels=${encodeURIComponent(u)}`).join("&");
  const n = (await authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(f.experiment)}&${filter}&page_size=1`)).metadata?.pagination?.totalCount ?? 0;
  const expName = n ? String((await authedGetOne(`/core/experiments/${encodeURIComponent(f.experiment)}`)).result.name ?? f.experiment) : "";
  return { n, expName };
}
const objectsIn = (n: number, expName: string) => `${n} scientific object${n === 1 ? "" : "s"} in ${expName}`;

// A level's name as typed: "Replicate: 3" and "3" both mean level "3" of Replicate (the app's
// label carries the factor's name, so a rename prompt starts with it).
function levelName(f: FactorDto, typed: string) {
  const t = typed.trim();
  const prefix = `${f.name}:`;
  const n = (t.toLowerCase().startsWith(prefix.toLowerCase()) ? t.slice(prefix.length) : t).trim();
  if (!n) throw new OpenSilexError(400, "A level needs a name.");
  return n;
}

// Every change to a factor's level list is a PUT of the whole factor (probed 2026-10-01: a kept
// uri keeps its objects, a level sent without one gets a new uri, a missing one is dropped from
// its objects). OpenSILEX would also take two levels of one name ("b", "b/1") and no levels at
// all — both refused here.
export async function saveLevels(f: FactorDto, levels: { uri?: string; name: string; description?: string | null }[]) {
  if (!levels.length) throw new OpenSilexError(400, "A factor needs at least one level — delete the factor instead.");
  const seen = new Set<string>();
  for (const l of levels) {
    if (seen.has(l.name.toLowerCase())) throw new OpenSilexError(400, `${f.name} already has a level named "${l.name}".`);
    seen.add(l.name.toLowerCase());
  }
  await authedPut("/core/experiments/factors", NODE_TYPES.factor.putPayload!({ ...f, levels }, f.name));
}
const localName = (property: unknown) => String(property).split(/[:#/]/).pop();

// People labels: a person by name; an account by its person's name, else its email.
export const personName = (p: Record<string, unknown>) => `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || String(p.email ?? p.uri);
export const accountItem = (a: Record<string, unknown>) => ({ id: String(a.uri), label: `${a.person_first_name ?? ""} ${a.person_last_name ?? ""}`.trim() || String(a.email ?? a.uri) });
const factsOf = (pairs: [string, unknown][]) => pairs.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([label, v]) => ({ label, value: String(v) }));

// The rows whose `field` (a list of uris or {uri, name} refs) holds `id`.
async function listedIn(rows: Record<string, unknown>[], field: string, id: string) {
  const key = await compactUri(id);
  const out: { id: string; label: string }[] = [];
  for (const r of rows) {
    const refs = Array.isArray(r[field]) ? (r[field] as (NamedRef | string)[]) : [];
    for (const ref of refs) if ((await compactUri(refUri(ref))) === key) { out.push({ id: String(r.uri), label: String(r.name ?? r.uri) }); break; }
  }
  return out;
}
// Every experiment's full record: the list has no supervisors or groups and no filter for them.
// ponytail: one GET per experiment (7 on phis-test); needs a server-side query past a few hundred.
async function experimentDetails() {
  const list = (await authedGet("/core/experiments?page_size=500")).result;
  const out: Record<string, unknown>[] = [];
  for (const e of list) out.push((await authedGetOne(`/core/experiments/${encodeURIComponent(e.uri)}`)).result);
  return out;
}

// A germplasm's kind, from its rdf_type (vocabulary:Variety or the full oeso#Variety); rank says
// which can be set on which: a species on varieties/accessions, a variety on accessions.
const GERMPLASM_RANK: Record<string, number> = { species: 3, variety: 2, accession: 1 };
export const germplasmKind = (rdfType: unknown) => {
  const k = localName(rdfType)?.toLowerCase() ?? "";
  return k in GERMPLASM_RANK ? k : undefined;
};

// OpenSILEX takes two germplasm (or devices) of one name — the second gets "/1" (probed); the app
// refuses it. `list` is the list endpoint with any filter already on it (`?` or `&` follows).
async function refuseTakenName(list: string, name: string, what: string, self?: string) {
  const want = name.trim().toLowerCase();
  if (!want) throw new OpenSilexError(400, "A name is required.");
  const rows = (await authedGet(`${list}${list.includes("?") ? "&" : "?"}name=${encodeURIComponent(`^${escapeRegex(name.trim())}$`)}&page_size=50`)).result;
  const selfKey = self ? await compactUri(self) : null;
  for (const r of rows) {
    if (String(r.name).toLowerCase() !== want || (selfKey && (await compactUri(String(r.uri))) === selfKey)) continue;
    throw new OpenSilexError(400, `There is already a ${what} named "${r.name}".`);
  }
}
// Within one germplasm type: a species and a variety may share a name.
const refuseTakenGermplasmName = (name: string, rdfType: string, self?: string) =>
  refuseTakenName(`/core/germplasm?rdf_type=${encodeURIComponent(rdfType)}`, name, germplasmKind(rdfType) ?? "germplasm", self);

// A device's place is the `to` of its latest move (probed 2026-10-01: OpenSILEX's own
// /devices?facility= answers the same way). Newest first.
const dateOf = (iso: unknown) => String(iso ?? "").slice(0, 10);
async function movesOf(deviceId: string) {
  const evs = (await authedGet(`/core/events?target=${encodeURIComponent(deviceId)}&page_size=500`)).result
    .filter((e) => /move/i.test(String(e.rdf_type_name ?? e.rdf_type)));
  const full = await Promise.all(evs.map(async (e) => (await authedGetOne(`/core/events/moves/${encodeURIComponent(e.uri)}`)).result as Record<string, any>));
  return full.sort((a, b) => String(b.end ?? b.start ?? "").localeCompare(String(a.end ?? a.start ?? "")));
}
const facilityName = async (id: unknown) => String((await authedGetOne(`/core/facilities/${encodeURIComponent(String(id))}`)).result.name ?? id);
// One move per device. A past day is stamped at noon UTC (reads the same date in every time zone);
// today gets the actual time, so two moves on one day keep their order (latest = where it is). A
// move needs targets_positions, even empty, or OpenSILEX fails (probed).
const today = () => new Date().toISOString().slice(0, 10);
const postMove = (deviceId: string, facilityId: string, date: string) =>
  authedPost("/core/events/moves", [{ rdf_type: "oeev:Move", is_instant: true, end: date === today() ? new Date().toISOString() : `${date}T12:00:00Z`, targets: [deviceId], to: facilityId, targets_positions: [] }]);

// Link selection with devices and one facility: each device not already there gets a move.
export async function moveDevices(deviceIds: string[], facilityIds: string[], date?: string) {
  if (facilityIds.length !== 1) throw new OpenSilexError(400, "A device is in one facility at a time — select one facility.");
  const day = date ?? today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new OpenSilexError(400, "The date must look like 2026-10-01.");
  const to = await compactUri(facilityIds[0]);
  let linked = 0;
  let already = 0;
  for (const id of deviceIds) {
    const here = (await movesOf(id))[0]?.location?.to;
    if (here && (await compactUri(String(here))) === to) { already++; continue; }
    await postMove(id, facilityIds[0], day);
    linked++;
  }
  return { linked, already };
}

// Link selection with germplasm only: the one highest-ranked item (a species or a variety) is set
// on all the others. Setting a variety also sets its species; setting a new species on an
// accession drops its variety (that belonged to the old species).
export async function setGermplasmParent(ids: string[]) {
  const dtos = await Promise.all(ids.map(async (id) => ({ id, dto: (await authedGetOne(`/core/germplasm/${encodeURIComponent(id)}`)).result })));
  const rank = (d: Record<string, unknown>) => GERMPLASM_RANK[germplasmKind(d.rdf_type) ?? ""] ?? 0;
  const top = Math.max(...dtos.map((d) => rank(d.dto)));
  const tops = dtos.filter((d) => rank(d.dto) === top);
  if (top < 2 || tops.length !== 1) throw new OpenSilexError(400, "Select one species or variety, and the germplasm to set it on.");
  const parent = tops[0];
  const same = async (a: unknown, b: unknown) => (a ? await compactUri(String(a)) : null) === (b ? await compactUri(String(b)) : null);
  let linked = 0;
  let already = 0;
  for (const { id, dto } of dtos) {
    if (id === parent.id) continue;
    const species = top === 3 ? parent.dto.uri : parent.dto.species;
    const variety = top === 2 ? parent.dto.uri : (await same(dto.species, species)) ? dto.variety : null;
    if ((await same(dto.species, species)) && (await same(dto.variety, variety))) { already++; continue; }
    await authedPut("/core/germplasm", updatePayloadFromDto(id, String(dto.name ?? ""), { ...dto, species, variety }, NODE_TYPES.germplasm));
    linked++;
  }
  return { linked, already };
}

// Adds/removes values of one relation on the object's copy in ONE experiment. The PUT replaces
// the copy's whole relations list (leaving parent out wiped it — probed), so everything else is
// read and sent back as-is. geometry is never sent: OpenSILEX refuses it on updates (location
// changes are move events) and omitting it keeps the location (probed 2026-09-29).
async function updateSoInExperiment(soId: string, expId: string, mod: { field: string; add?: string[]; remove?: string }): Promise<void> {
  // An inverse row lives on the OTHER object: removing child C from "Contains" of P clears C's isPartOf P.
  const inverse = SO_ROWS_PER_EXPERIMENT.find((r) => r.property === mod.field)?.inverseOf;
  if (inverse) {
    if (mod.add?.length) throw new OpenSilexError(400, "Children are added from the child's side (Link selection with the ranking list).");
    if (mod.remove) await updateSoInExperiment(mod.remove, expId, { field: inverse, remove: soId });
    return;
  }
  const copy = (await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}?experiment=${encodeURIComponent(expId)}`)).result;
  let relations = ((Array.isArray(copy.relations) ? copy.relations : []) as { property: string; value: string; inverse?: boolean }[])
    .map((r) => ({ property: r.property, value: r.value, inverse: Boolean(r.inverse) }));
  // Factor levels are in `relations` too (hasFactorLevel; `factor_level` stays null — probed
  // 2026-09-30), so they go back unchanged with everything else.
  const mine = (r: { property: string }) => localName(r.property) === mod.field;
  if (mod.remove) {
    const gone = await compactUri(mod.remove);
    const keep = await Promise.all(relations.map(async (r) => !(mine(r) && (await compactUri(r.value)) === gone)));
    relations = relations.filter((_, i) => keep[i]);
  }
  if (mod.add?.length && SO_ROWS_PER_EXPERIMENT.find((r) => r.property === mod.field)?.single) relations = relations.filter((r) => !mine(r));
  // An object holds one level per factor: a new level replaces the old one of the same factor.
  if (mod.add?.length && mod.field === "hasFactorLevel") {
    const sameFactor = new Set<string>();
    for (const uri of mod.add) for (const l of (await factorOfLevel(uri)).levels) sameFactor.add(await compactUri(l.uri));
    const drop = await Promise.all(relations.map(async (r) => mine(r) && sameFactor.has(await compactUri(r.value))));
    relations = relations.filter((_, i) => !drop[i]);
  }
  const have = new Set(await Promise.all(relations.filter(mine).map((r) => compactUri(r.value))));
  for (const uri of mod.add ?? []) {
    if (!have.has(await compactUri(uri))) relations.push({ property: `vocabulary:${mod.field}`, value: uri, inverse: false });
  }
  await authedPut("/core/scientific_objects", { uri: soId, name: copy.name, rdf_type: copy.rdf_type, experiment: expId, relations });
}
async function soRowsIn(soId: string, expId: string) {
  const copy = (await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}?experiment=${encodeURIComponent(expId)}`)).result;
  const relations = (Array.isArray(copy.relations) ? copy.relations : []) as { property: string; value: string }[];
  return Promise.all(
    SO_ROWS_PER_EXPERIMENT.map(async (row) => {
      const uris = row.inverseOf
        ? ((await authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(expId)}&parent=${encodeURIComponent(soId)}&page_size=500`)).result).map((k) => String(k.uri))
        : relations.filter((r) => localName(r.property) === row.property).map((r) => String(r.value));
      const field = row.removable ? { field: row.property, type: row.type, ...(row.addable ? { addable: true } : {}) } : {};
      if (!uris.length) return { label: row.label, ...field, items: [] };
      if (row.names) return { label: row.label, ...field, items: await row.names(expId, uris) };
      const named = (await authedPost(row.byUris!(expId), uris)).result as unknown as { uri: string; name?: string }[];
      const names = new Map(await Promise.all(named.map(async (n) => [await compactUri(String(n.uri)), String(n.name ?? n.uri)] as const)));
      const items = await Promise.all(uris.map(async (u) => {
        const id = await compactUri(u);
        return { id, type: row.type, label: names.get(id) ?? id };
      }));
      return { label: row.label, ...field, items };
    })
  );
}

// Germplasm (the addable rows) the object has in its OTHER experiments but not in `expId` — a
// value found in several experiments is offered once, from the first. Not the parent: it may not
// be in the new experiment.
async function soCarryOver(soId: string, expId: string): Promise<CarryOver[]> {
  // Ids arrive full or prefixed depending on who produced them (a POST vs a list) — compare compacted.
  const self = await compactUri(expId);
  const exps = await Promise.all((await queryItems(SO_EXPERIMENTS, soId)).map(async (e) => ({ ...e, key: await compactUri(e.id) })));
  const target = exps.find((e) => e.key === self);
  const others = exps.filter((e) => e.key !== self);
  if (!target || !others.length) return [];
  const writable = (groups: Awaited<ReturnType<typeof soRowsIn>>) => groups.filter((g) => "addable" in g && g.addable);
  const have = new Set(writable(await soRowsIn(soId, expId)).flatMap((g) => g.items.map((i) => `${(g as { field: string }).field}|${i.id}`)));
  const name = String((await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}`)).result.name ?? soId);
  const out: CarryOver[] = [];
  for (const e of others) {
    for (const g of writable(await soRowsIn(soId, e.id))) {
      const { field, type: valueType } = g as { field: string; type: string };
      for (const i of g.items) {
        if (have.has(`${field}|${i.id}`)) continue;
        have.add(`${field}|${i.id}`);
        out.push({ type: "scientific_object", id: soId, label: name, experiment: expId, experimentLabel: target.label, field, value: i.id, valueType, valueLabel: i.label, from: e.label });
      }
    }
  }
  return out;
}

// The objects that are part of `soId` in `expId` (the parent filter works per experiment —
// probed) and lack some of `values` in that row there.
async function soChildOffer(soId: string, expId: string, field: string, values: string[]): Promise<CarryOver[]> {
  const kids = (await authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(expId)}&parent=${encodeURIComponent(soId)}&page_size=500`)).result;
  if (!kids.length) return [];
  const self = await compactUri(expId);
  const exp = (await Promise.all((await queryItems(SO_EXPERIMENTS, soId)).map(async (e) => ({ ...e, key: await compactUri(e.id) })))).find((e) => e.key === self);
  const parentLabel = String((await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}`)).result.name ?? soId);
  const row = (groups: Awaited<ReturnType<typeof soRowsIn>>) => groups.find((g) => "field" in g && g.field === field);
  const named = row(await soRowsIn(soId, expId));
  const out: CarryOver[] = [];
  for (const kid of kids) {
    const have = new Set((row(await soRowsIn(String(kid.uri), expId))?.items ?? []).map((i) => i.id));
    for (const v of values) {
      const id = await compactUri(v);
      if (have.has(id)) continue;
      const item = named?.items.find((i) => i.id === id);
      out.push({
        type: "scientific_object", id: String(kid.uri), label: String(kid.name ?? kid.uri), experiment: expId, experimentLabel: exp?.label ?? expId,
        field, value: id, valueType: (named as { type?: string } | undefined)?.type ?? "germplasm", valueLabel: item?.label ?? id, from: parentLabel, parent: soId,
      });
    }
  }
  return out;
}

const SO_EXPERIMENTS: QueryRelation = {
  label: "In experiments",
  field: "experiment",
  type: "experiment",
  url: (id) => `/core/scientific_objects/${encodeURIComponent(id)}/experiments`,
  // `name`: what the object is called in that experiment (each copy has its own — probed).
  item: (r) => (r.experiment && r.experiment_name ? { id: String(r.experiment), label: String(r.experiment_name), ...(r.name != null ? { name: String(r.name) } : {}) } : null),
};

// A scientific object's name lives on each copy: renaming one experiment's copy leaves the global
// copy and its other experiments alone (probed 2026-10-02). Without `expId` the only candidate is
// used — the global copy for an object in no experiment, else its one experiment; several ask.
// In exactly one experiment the global copy is renamed too (user, 2026-10-02), so search — which
// reads global names — finds the new one. A taken name in that experiment is refused here
// (OpenSILEX's own refusal is a Java dump). The PUT replaces the copy's relations, so they go
// back as they are (like updateSoInExperiment).
async function renameSoCopy(soId: string, name: string, expId?: string) {
  const copy = (await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}${expId ? `?experiment=${encodeURIComponent(expId)}` : ""}`)).result;
  const relations = ((Array.isArray(copy.relations) ? copy.relations : []) as { property: string; value: string; inverse?: boolean }[])
    .map((r) => ({ property: r.property, value: r.value, inverse: Boolean(r.inverse) }));
  await authedPut("/core/scientific_objects", { uri: soId, name, rdf_type: copy.rdf_type, ...(expId ? { experiment: expId } : {}), relations });
}
async function renameSo(soId: string, name: string, expId?: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new OpenSilexError(400, "A name is required.");
  const exps = await queryItems(SO_EXPERIMENTS, soId);
  if (!expId && exps.length > 1) {
    throw new OpenSilexError(400, `It has its own name in each of its experiments (${exps.map((e) => e.label).join(", ")}). Use Rename in that experiment's box below.`);
  }
  const want = expId ? await compactUri(expId) : null;
  const keyed = await Promise.all(exps.map(async (e) => ({ ...e, key: await compactUri(e.id) })));
  const exp = want ? keyed.find((e) => e.key === want) : exps[0];
  if (want && !exp) throw new OpenSilexError(400, "It isn't in that experiment.");
  if (exp) await refuseTakenName(`/core/scientific_objects?experiment=${encodeURIComponent(exp.id)}`, trimmed, `scientific object in ${exp.label}`, soId);
  await renameSoCopy(soId, trimmed, exp?.id);
  if (exp && exps.length === 1) await renameSoCopy(soId, trimmed);
  return trimmed;
}
// Only for the detail pane: link/unlink/delete only need the experiment ids (SO_EXPERIMENTS).
const SO_EXPERIMENTS_DETAIL: QueryRelation = {
  ...SO_EXPERIMENTS,
  itemGroups: soRowsIn,
  emptyText: "Not in any experiment. Germplasm and parent can only be set inside an experiment.",
};

const EXPERIMENT_SOS: QueryRelation = {
  label: "Scientific objects",
  field: "scientific_object",
  type: "scientific_object",
  url: (id) => `/core/scientific_objects?experiment=${encodeURIComponent(id)}&page_size=500`,
  blocksDelete: true,
};

// Which side (if either) links typeA<->typeB through contextLinks, and under which key.
export function contextLinkFor(typeA: string, typeB: string): { ownerType: string; field: string; ctx: ContextLink } | null {
  for (const [ownerType, otherType] of [[typeA, typeB], [typeB, typeA]]) {
    const entry = Object.entries(NODE_TYPES[ownerType]?.contextLinks ?? {}).find(([, c]) => c.otherType === otherType);
    if (entry) return { ownerType, field: entry[0], ctx: entry[1] };
  }
  return null;
}

const plural = (n: number, one: string) => `${n.toLocaleString("en")} ${one}${n === 1 ? "" : "s"}`;
// A scientific object's measured values, counted now, with where they came from. The object goes in
// the body: as a query parameter `targets` is ignored and everything is counted (probed 2026-10-05).
async function valuesOf(id: string) {
  const count = Number((await authedPost("/core/data/count?count_limit=10000000", [id])).result);
  if (!count) return { count, text: "" };
  const sources = (await authedPost("/core/data/provenances/by_targets", [id])).result as unknown as { name?: string; uri: string }[];
  const names = sources.map((p) => String(p.name ?? p.uri));
  return { count, text: `${plural(count, "measured value")} (from ${names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and ")})` };
}

const variableValueCount = async (id: string) =>
  Number((await authedPost(`/core/data/count?variables=${encodeURIComponent(id)}&count_limit=10000000`, [])).result) || 0;
// The VariableUpdateDTO from the GetDTO: related resources go back as their uris (probed: the whole
// record must be sent; entity, characteristic, method and unit are required).
function variablePayload(dto: Record<string, unknown>, name: string) {
  const uri = (x: unknown) => (x && typeof x === "object" ? (x as { uri?: unknown }).uri : x);
  const out: Record<string, unknown> = { uri: dto.uri, name };
  for (const k of ["alternative_name", "description", "entity", "entity_of_interest", "characteristic", "trait", "trait_name", "method", "unit", "datatype", "time_interval", "sampling_interval"]) {
    const v = uri(dto[k]);
    if (v != null) out[k] = v;
  }
  for (const k of ["species", "exact_match", "close_match", "broad_match", "narrow_match"]) {
    if (Array.isArray(dto[k])) out[k] = (dto[k] as unknown[]).map(uri);
  }
  return out;
}

// What a group can be shared with (each holds the group in its own `groups` field).
const SHARE_LABEL = { experiment: "experiments", germplasm: "germplasm", organization: "organizations", site: "sites" } as const;
// A provenance (where a batch of values came from: one per import). Its values counted over every experiment.
const provenanceValueCount = async (id: string) =>
  Number((await authedPost(`/core/data/count?provenances=${encodeURIComponent(id)}&count_limit=10000000`, [])).result) || 0;
const DATATYPES: Record<string, string> = {
  "http://www.w3.org/2001/XMLSchema#decimal": "decimal numbers", "http://www.w3.org/2001/XMLSchema#integer": "whole numbers",
  "http://www.w3.org/2001/XMLSchema#string": "text", "http://www.w3.org/2001/XMLSchema#boolean": "yes/no",
  "http://www.w3.org/2001/XMLSchema#date": "dates", "http://www.w3.org/2001/XMLSchema#dateTime": "dates and times",
};
// An entity, characteristic, method or unit: its page lists the variables made with it.
function variablePart(field: string, path: string, more: (dto: Record<string, unknown>) => [string, unknown][] = () => []): NodeConfig {
  return {
    getUrl: (id) => `/core/${path}/${encodeURIComponent(id)}`,
    putUrl: "",
    deleteUrl: () => "",
    relationGroups: [],
    updateLinkFields: [],
    actions: [],
    facts: (dto) => factsOf([...more(dto), ["Description", dto.description]]),
    queryRelations: [{ label: "Variables", type: "variable", url: (id) => `/core/variables?${field}=${encodeURIComponent(id)}&page_size=500` }],
  };
}

export const NODE_TYPES: Record<string, NodeConfig> = {
  facility: {
    getUrl: (id) => `/core/facilities/${encodeURIComponent(id)}`,
    putUrl: "/core/facilities",
    deleteUrl: (id) => `/core/facilities/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Organizations", field: "organizations", type: "organization" },
      { label: "Sites", field: "sites", type: "site" },
      { label: "Devices", field: "devices", type: "device" },
    ],
    updateLinkFields: ["organizations", "sites"],
    queryRelations: [
      { label: "Devices located here", type: "device", url: (id) => `/core/devices?facility=${encodeURIComponent(id)}&page_size=500` },
    ],
    // OpenSILEX deletes a facility devices were moved to and leaves their moves pointing nowhere (probed).
    deleteBlockedBy: async (_dto, id) => {
      const devs = (await authedGet(`/core/devices?facility=${encodeURIComponent(id)}&page_size=500`)).result;
      return devs.length ? `has devices located here: ${devs.map((d) => String(d.name ?? d.uri)).join(", ")}. Move them to another facility first.` : null;
    },
  },
  // A device's place and history are its moves (events). Deleting a device leaves its moves
  // pointing at nothing (probed), so they go first and the confirm says so.
  device: {
    getUrl: (id) => `/core/devices/${encodeURIComponent(id)}`,
    putUrl: "/core/devices",
    deleteUrl: (id) => `/core/devices/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    facts: (d) => factsOf([["Type", d.rdf_type_name], ["Brand", d.brand], ["Model", d.constructor_model], ["Serial number", d.serial_number], ["In use since", d.start_up], ["Removed", d.removal]]),
    rename: async (id, name) => {
      await refuseTakenName("/core/devices", name, "device", id);
      await updateNode(NODE_TYPES.device, id, { name: name.trim() });
      return name.trim();
    },
    // From a selected facility: created, then moved there today.
    create: async (p) => {
      const { facility, ...fields } = p;
      const name = String(fields.name ?? "").trim();
      await refuseTakenName("/core/devices", name, "device");
      const made = (await authedPost("/core/devices", { ...fields, name })).result as unknown;
      const uri = String(Array.isArray(made) ? made[0] : made);
      if (facility) await postMove(uri, String(facility), today());
      return { id: uri, label: name };
    },
    // Device -> facility is a move (today, unless /api/link's date says otherwise) — so a new
    // facility made from a selected device, or "Link existing", moves it there too.
    contextLinks: {
      location: {
        otherType: "facility",
        current: async (id) => { const to = (await movesOf(id))[0]?.location?.to; return to ? [String(to)] : []; },
        link: async (id, facilityId) => { await moveDevices([id], [facilityId]); },
        unlink: async () => { throw new OpenSilexError(400, "A device leaves a facility by moving to another one — select it with the new facility and Link selection."); },
      },
      // One person in charge: setting another replaces it; clearing is leaving the field out of the update (probed 2026-10-07).
      person_in_charge: {
        otherType: "person",
        current: async (id) => { const p = (await authedGetOne(`/core/devices/${encodeURIComponent(id)}`)).result.person_in_charge; return p ? [String(p)] : []; },
        link: async (id, personId) => { await setPersonInCharge(id, personId); },
        unlink: async (id) => { await setPersonInCharge(id, null); },
      },
    },
    deleteRemovesLinks: true,
    deleteFirst: async (id) => (await movesOf(id)).map((m) => `/core/events/moves/${encodeURIComponent(m.uri)}`),
    deleteWarning: async (id) => {
      const n = (await movesOf(id)).length;
      return n ? `Its ${n} move${n === 1 ? " is" : "s are"} deleted with it.` : "";
    },
    queryRelations: [
      { label: "Location", type: "facility", url: () => "", load: async (id) => {
        const to = (await movesOf(id))[0]?.location?.to;
        return to ? [{ id: String(to), label: await facilityName(to) }] : [];
      } },
      { label: "Person in charge", type: "person", url: () => "", load: async (id) => {
        const p = (await authedGetOne(`/core/devices/${encodeURIComponent(id)}`)).result.person_in_charge;
        return p ? [{ id: String(p), label: personName((await authedGetOne(`/security/persons/${encodeURIComponent(String(p))}`)).result) }] : [];
      } },
      { label: "History", type: "event", url: () => "", load: async (id) =>
        Promise.all((await movesOf(id)).map(async (m) => ({ id: String(m.uri), label: `${dateOf(m.end ?? m.start)} · moved to ${m.location?.to ? await facilityName(m.location.to) : "?"}` }))) },
    ],
  },
  // ponytail: every event is read as a move — the only kind in PHIS today; another kind needs its own getUrl.
  event: {
    getUrl: (id) => `/core/events/moves/${encodeURIComponent(id)}`,
    putUrl: "",
    deleteUrl: (id) => `/core/events/moves/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["delete"],
    deleteRemovesLinks: true,
    facts: (e) => factsOf([["Date", dateOf(e.end ?? e.start)], ["Description", e.description]]),
    queryRelations: [
      { label: "Device", type: "device", url: () => "", load: async (id) => {
        const targets = ((await authedGetOne(`/core/events/moves/${encodeURIComponent(id)}`)).result.targets ?? []) as string[];
        return Promise.all(targets.map(async (t) => ({ id: t, label: String((await authedGetOne(`/core/devices/${encodeURIComponent(t)}`)).result.name ?? t) })));
      } },
      ...(["to", "from"] as const).map((end) => ({ label: end === "to" ? "To" : "From", type: "facility", url: () => "", load: async (id: string) => {
        const f = ((await authedGetOne(`/core/events/moves/${encodeURIComponent(id)}`)).result.location as Record<string, unknown> | null)?.[end];
        return f ? [{ id: String(f), label: await facilityName(f) }] : [];
      } })),
    ],
  },
  organization: {
    getUrl: (id) => `/core/organisations/${encodeURIComponent(id)}`,
    putUrl: "/core/organisations",
    deleteUrl: (id) => `/core/organisations/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Parent organizations", field: "parents", type: "organization" },
      { label: "Child organizations", field: "children", type: "organization" },
      { label: "Facilities", field: "facilities", type: "facility" },
      { label: "Sites", field: "sites", type: "site" },
      { label: "Experiments", field: "experiments", type: "experiment" },
      { label: "Shared with", field: "groups", type: "group" },
    ],
    // children/sites/experiments are read-only on OrganizationUpdateDTO (derived from the
    // other side of the relation) — parents, facilities and the groups it is shared with are real settable fields.
    updateLinkFields: ["parents", "facilities", "groups"],
  },
  // Supervisors/factors are plain uri strings in the GetDTO, not {uri, name} refs, so their chips
  // show the uri until persons get a label lookup. EVERY relation field is settable on its update
  // DTO (= ExperimentCreationDTO), so all six are updateLinkFields — anything left out would be
  // treated as derived and dropped from the full-replace PUT, wiping it.
  experiment: {
    getUrl: (id) => `/core/experiments/${encodeURIComponent(id)}`,
    putUrl: "/core/experiments",
    deleteUrl: (id) => `/core/experiments/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Organizations", field: "organisations", type: "organization" },
      { label: "Facilities", field: "facilities", type: "facility" },
      { label: "Projects", field: "projects", type: "project" },
      { label: "Scientific supervisors", field: "scientific_supervisors", type: "person" },
      { label: "Technical supervisors", field: "technical_supervisors", type: "person" },
      { label: "Shared with", field: "groups", type: "group" },
    ],
    // `factors` stays in the PUT (or it'd be wiped) but is shown by name through the query below.
    updateLinkFields: ["organisations", "facilities", "projects", "scientific_supervisors", "technical_supervisors", "factors", "groups"],
    deleteRemovesLinks: true,
    visibility: true,
    structure: experimentStructure,
    queryRelations: [
      EXPERIMENT_SOS,
      { label: "Factors", type: "factor", url: (id) => `/core/experiments/${encodeURIComponent(id)}/factors` },
      // Derived by OpenSILEX from its objects' germplasm (not settable on the experiment).
      { label: "Species", type: "germplasm", url: (id) => `/core/experiments/${encodeURIComponent(id)}/species`, compactIds: true },
    ],
    contextLinks: {
      scientific_object: {
        otherType: "scientific_object",
        current: async (expId) => (await queryItems(EXPERIMENT_SOS, expId)).map((i) => i.id),
        link: (expId, soId) => addSoToExperiment(soId, expId),
        unlink: (expId, soId) => removeSoFromExperiment(soId, expId),
        carryOver: (expId, soId) => soCarryOver(soId, expId),
      },
    },
  },
  // Read via the GLOBAL copy (no ?experiment=), which carries name/type. Deleting: one call per
  // experiment copy (deleteFirst), then the global copy (deleteUrl). Its experiments come
  // from /{uri}/experiments: one row per context the object lives in — each real experiment,
  // plus the global graph itself (experiment "…set/scientific-object", no name), skipped.
  scientific_object: {
    getUrl: (id) => `/core/scientific_objects/${encodeURIComponent(id)}`,
    putUrl: "/core/scientific_objects",
    deleteUrl: (id) => `/core/scientific_objects/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    deleteRemovesLinks: true,
    rename: renameSo,
    contextLinks: {
      experiment: {
        otherType: "experiment",
        current: async (soId) => (await queryItems(SO_EXPERIMENTS, soId)).map((i) => i.id),
        link: (soId, expId) => addSoToExperiment(soId, expId),
        unlink: (soId, expId) => removeSoFromExperiment(soId, expId),
        carryOver: (soId, expId) => soCarryOver(soId, expId),
      },
    },
    deleteFirst: async (id) =>
      (await queryItems(SO_EXPERIMENTS, id)).map(
        (e) => `/core/scientific_objects/${encodeURIComponent(id)}?experiment=${encodeURIComponent(e.id)}`
      ),
    queryRelations: [SO_EXPERIMENTS_DETAIL],
    // An object given a position gets a Move event, and OpenSILEX refuses deleting it while one
    // exists ("object has associated moves" — probed). Decided with the user: the app doesn't
    // delete location history; it explains and points to PHIS.
    // Measured values: OpenSILEX refuses too ("object has associated data" — probed). They're research
    // data, so they never go as a side effect of a delete (decided with the user, 2026-10-05): the delete
    // is blocked, and deleting the values is offered as its own step (deleteBlockFix).
    deleteBlockedBy: async (dto, id) => {
      if ((dto.location as { geojson?: unknown } | null)?.geojson) {
        return "has a location history in PHIS (where it was placed, and when). OpenSILEX won't delete an object that has one, and this app doesn't delete location history. Delete it in PHIS instead — open the object there; its location history is under Events and Positions.";
      }
      const v = await valuesOf(id);
      return v.count ? `has ${v.text}. Delete them first.` : null;
    },
    deleteBlockFix: {
      check: async (id, dto) => {
        if ((dto.location as { geojson?: unknown } | null)?.geojson) return null;
        const v = await valuesOf(id);
        return v.count ? {
          label: `Delete its ${plural(v.count, "measured value")}`,
          confirm: `Delete ${String(dto.name ?? id)}'s ${v.text}? Measured values are research data: they can't be recovered.`,
        } : null;
      },
      run: async (id) => { await authedDelete(`/core/data?target=${encodeURIComponent(id)}`); },
    },
    inExperiment: {
      fields: SO_ROWS_PER_EXPERIMENT.filter((r) => r.removable).map((r) => r.property),
      byType: { ...Object.fromEntries(SO_ROWS_PER_EXPERIMENT.filter((r) => r.addable).map((r) => [r.type, r.property])), factor_level: "hasFactorLevel" },
      parentField: "isPartOf",
      experimentsOf: (id) => queryItems(SO_EXPERIMENTS, id),
      fixedExperiment: { factor_level: levelsExperiment },
      update: updateSoInExperiment,
      childOffer: soChildOffer,
      valuesIn: async (id, expId, field) => ((await soRowsIn(id, expId)).find((g) => "field" in g && g.field === field)?.items ?? []).map((i) => i.id),
    },
  },
  // A project holds no link to its experiments — each experiment's `projects` field does — so
  // they come from a query, and link/unlink goes through the experiment's side (linkFieldFor).
  // Deleting a project drops it from those experiments' `projects` (probed live), so no unlink
  // step first. Persons are bare uri strings, like an experiment's supervisors.
  project: {
    getUrl: (id) => `/core/projects/${encodeURIComponent(id)}`,
    putUrl: "/core/projects",
    deleteUrl: (id) => `/core/projects/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Related projects", field: "related_projects", type: "project" },
      { label: "Coordinators", field: "coordinators", type: "person" },
      { label: "Scientific contacts", field: "scientific_contacts", type: "person" },
      { label: "Administrative contacts", field: "administrative_contacts", type: "person" },
    ],
    updateLinkFields: ["related_projects", "coordinators", "scientific_contacts", "administrative_contacts"],
    deleteRemovesLinks: true,
    queryRelations: [
      { label: "Experiments", type: "experiment", url: (id) => `/core/experiments?projects=${encodeURIComponent(id)}&page_size=500` },
    ],
  },
  // The record itself is read-only here (no rename/delete). Species/variety/accession are single uris (+ *_name), not ref arrays.
  // Probed live on throwaways: ?species=X returns X's members plus X itself (skipSelf), and
  // /{uri}/experiments works (a species reaches experiments through its accessions). Which
  // scientific objects use a germplasm has no query yet: /scientific_objects?germplasm= is
  // ignored by OpenSILEX, and the hasGermplasm relation sits only on the experiment copy.
  germplasm: {
    getUrl: (id) => `/core/germplasm/${encodeURIComponent(id)}`,
    putUrl: "/core/germplasm",
    deleteUrl: (id) => `/core/germplasm/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Species", field: "species", type: "germplasm", nameField: "species_name", kind: "species" },
      { label: "Variety", field: "variety", type: "germplasm", nameField: "variety_name", kind: "variety" },
      { label: "Accession", field: "accession", type: "germplasm", nameField: "accession_name", kind: "accession" },
      { label: "Shared with", field: "groups", type: "group" },
    ],
    updateLinkFields: ["groups"],
    // Species/variety are set through Link selection (setGermplasmParent), not unlinked: a
    // variety can't be without a species (probed).
    actions: ["rename", "delete", "link"],
    visibility: true,
    // A variety's code (TraitFinder's G_alias, set by the import).
    facts: (d) => factsOf([["Code", d.code]]),
    // OpenSILEX refuses deleting germplasm in use (probed) — said before the user tries.
    deleteBlockedBy: async (dto, id) => {
      const exps = (await authedGet(`/core/germplasm/${encodeURIComponent(id)}/experiments?page_size=500`)).result;
      if (exps.length) return `is on scientific objects in ${exps.map((e) => String(e.name ?? e.uri)).join(", ")}. Remove it from them first.`;
      if (germplasmKind(dto.rdf_type) !== "species") return null;
      const self = await compactUri(id);
      const kids = [];
      for (const k of (await authedGet(`/core/germplasm?species=${encodeURIComponent(id)}&page_size=500`)).result) if ((await compactUri(String(k.uri))) !== self) kids.push(String(k.name ?? k.uri));
      return kids.length ? `has varieties or accessions: ${kids.join(", ")}. Delete them or give them another species first.` : null;
    },
    rename: async (id, name) => {
      const dto = (await authedGetOne(`/core/germplasm/${encodeURIComponent(id)}`)).result;
      await refuseTakenGermplasmName(name, String(dto.rdf_type), id);
      await updateNode(NODE_TYPES.germplasm, id, { name: name.trim() });
      return name.trim();
    },
    // New germplasm is always public: admin-created germplasm is hidden from Feide users otherwise.
    create: async (p) => {
      const rdfType = String(p.rdf_type ?? "");
      const kind = germplasmKind(rdfType);
      if (!kind || !rdfType.startsWith("vocabulary:")) throw new OpenSilexError(400, "Pick a type: species, variety or accession.");
      if (kind !== "species" && !p.species) throw new OpenSilexError(400, `A${kind === "accession" ? "n" : ""} ${kind} needs a species.`);
      const name = String(p.name ?? "").trim();
      await refuseTakenGermplasmName(name, rdfType);
      const made = (await authedPost("/core/germplasm", { name, rdf_type: rdfType, ...(kind !== "species" ? { species: p.species } : {}), is_public: true })).result as unknown;
      return { id: await compactUri(String(Array.isArray(made) ? made[0] : made)), label: name, kind };
    },
    queryRelations: [
      { label: "Varieties and accessions", type: "germplasm", url: (id) => `/core/germplasm?species=${encodeURIComponent(id)}&page_size=500`, skipSelf: true,
        item: (r) => ({ id: String(r.uri), label: String(r.name ?? r.uri), kind: germplasmKind(r.rdf_type) }) },
      { label: "Experiments", type: "experiment", url: (id) => `/core/germplasm/${encodeURIComponent(id)}/experiments?page_size=500` },
      { label: "In germplasm groups", type: "germplasm_group", url: () => "", emptyText: "In no germplasm group.", load: async (id) =>
        (await authedPost(`/core/germplasm_group/search?germplasm=${encodeURIComponent(id)}&page_size=200`, {}) as unknown as { result: Record<string, unknown>[] }).result
          .map((g) => ({ id: String(g.uri), label: String(g.name ?? g.uri) })) },
    ],
  },
  // A factor belongs to one experiment; its levels are listed as selectable items. Rename sends
  // the levels back as objects (putPayload); delete cascades to the objects using its levels,
  // so the confirm says how many (deleteWarning).
  factor: {
    getUrl: (id) => `/core/experiments/factors/${encodeURIComponent(id)}`,
    putUrl: "/core/experiments/factors",
    deleteUrl: (id) => `/core/experiments/factors/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete"],
    // The PUT replaces the whole factor (FactorUpdateDTO), so everything it holds goes back.
    putPayload: (dto, name) => ({
      uri: dto.uri, name, experiment: dto.experiment,
      category: dto.category, description: dto.description,
      exact_match: dto.exact_match, close_match: dto.close_match, broad_match: dto.broad_match, narrow_match: dto.narrow_match,
      levels: ((dto.levels as FactorDto["levels"] | undefined) ?? []).map((l) => ({ uri: l.uri, name: l.name, description: l.description ?? null })),
    }),
    deleteRemovesLinks: true,
    deleteWarning: async (_id, dto) => {
      const f = dto as unknown as FactorDto;
      const { n, expName } = await levelUsers(f, (f.levels ?? []).map((l) => l.uri));
      return n ? `It also removes its level from ${objectsIn(n, expName)}.` : "No scientific object uses it.";
    },
    queryRelations: [
      { label: "Experiment", type: "experiment", url: (id) => `/core/experiments/factors/${encodeURIComponent(id)}/experiments` },
      { label: "Levels", type: "factor_level", url: (id) => `/core/experiments/factors/${encodeURIComponent(id)}/levels`, load: factorLevelItems },
    ],
  },
  // A factor's level: only uri + name in OpenSILEX. A type of its own so it can be opened (its
  // factor, experiment and the objects that have it) and set on scientific objects (their
  // inExperiment.byType); its factor/experiment come from factorOfLevel. It lives inside its
  // factor, so rename/delete/create save the factor (saveLevels).
  factor_level: {
    getUrl: (id) => `/core/experiments/factors/levels/${encodeURIComponent(id)}`,
    putUrl: "",
    deleteUrl: () => "",
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete", "link"],
    rename: async (id, typed) => {
      const f = await factorOfLevel(id);
      const name = levelName(f, typed);
      await saveLevels(f, f.levels.map((l) => (l.uri === id ? { ...l, name } : l)));
      return `${f.name}: ${name}`;
    },
    remove: async (id) => {
      const f = await factorOfLevel(id);
      await saveLevels(f, f.levels.filter((l) => l.uri !== id));
    },
    create: async (payload) => {
      const f = await getFactor(String(payload.factor));
      const name = levelName(f, String(payload.name));
      await saveLevels(f, [...f.levels, { name }]);
      const after = await getFactor(f.uri);
      const made = after.levels.find((l) => l.name === name && !f.levels.some((o) => o.uri === l.uri));
      if (!made) throw new OpenSilexError(502, `Saved, but ${f.name} doesn't list level "${name}".`);
      return levelItem(after, made);
    },
    deleteRemovesLinks: true,
    deleteWarning: async (id) => {
      const { n, expName } = await levelUsers(await factorOfLevel(id), [id]);
      return n ? `It also removes it from ${objectsIn(n, expName)}.` : "No scientific object has it.";
    },
    queryRelations: [
      { label: "Factor", type: "factor", url: () => "", load: async (id) => { const f = await factorOfLevel(id); return [{ id: f.uri, label: f.name }]; } },
      { label: "Experiment", type: "experiment", url: () => "", load: async (id) => {
        const f = await factorOfLevel(id);
        return [{ id: f.experiment, label: String((await authedGetOne(`/core/experiments/${encodeURIComponent(f.experiment)}`)).result.name ?? f.experiment) }];
      } },
      // The objects that have this level, through OpenSILEX's own factor_levels filter (probed).
      { label: "Scientific objects", type: "scientific_object", url: () => "", load: async (id) => {
        const f = await factorOfLevel(id);
        const rows = (await authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(f.experiment)}&factor_levels=${encodeURIComponent(id)}&page_size=500`)).result;
        return rows.map((r) => ({ id: String(r.uri), label: String(r.name ?? r.uri) }));
      } },
    ],
  },
  // People: who is who, and what links them — a person to an account, an account to groups (each membership
  // with a profile = its rights), a group to what is shared with it. Probed on phis-test 2026-10-01. The
  // name can change and persons can be made (PHIS has no delete for them); "link" means a person can be added to an
  // experiment or project in a role the user picks (the experiment/project owns the field — see PERSON_ROLES and
  // /api/link), or to an account.
  person: {
    getUrl: (id) => `/security/persons/${encodeURIComponent(id)}`,
    putUrl: "/security/persons",
    deleteUrl: () => "",
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "link"],
    putPayload: (dto, name) => {
      const { first, last } = splitName(name);
      return personPayload(dto, { first_name: first, last_name: last });
    },
    // The new name is "First Last" (everything before the last space is the first name).
    rename: async (id, name) => {
      const { first, last } = splitName(name);
      await updateNode(NODE_TYPES.person, id, { name: `${first} ${last}` });
      return `${first} ${last}`;
    },
    // First name is the form's name; the account (when made from one) supplies the email if none is given.
    create: async (p) => {
      const first = String(p.name ?? "").trim(), last = String(p.last_name ?? "").trim();
      if (!first || !last) throw new OpenSilexError(400, "A first and a last name are required.");
      let email = String(p.email ?? "").trim();
      const account = p.account ? String(p.account) : "";
      if (account) {
        const a = (await authedGetOne(`/security/accounts/${encodeURIComponent(account)}`)).result;
        if (a.linked_person) throw new OpenSilexError(400, `${a.email} already has a person.`);
        email ||= String(a.email ?? "");
      }
      if (!email) throw new OpenSilexError(400, "An email is required (or select the account this person belongs to).");
      const made = (await authedPost("/security/persons", { first_name: first, last_name: last, email, ...(p.affiliation ? { affiliation: p.affiliation } : {}), ...(account ? { account } : {}) })).result as unknown;
      return { id: String(Array.isArray(made) ? made[0] : made), label: `${first} ${last}` };
    },
    // A person's account is set once (probed: PHIS keeps it through updates), from either side of the selection.
    contextLinks: {
      account: {
        otherType: "account",
        current: async (id) => { const a = (await authedGetOne(`/security/persons/${encodeURIComponent(id)}`)).result.account; return a ? [String(a)] : []; },
        link: async (id, accountId) => {
          const person = (await authedGetOne(`/security/persons/${encodeURIComponent(id)}`)).result;
          if (person.account) throw new OpenSilexError(400, "This person already has an account, and an account can't be changed here.");
          const acc = (await authedGetOne(`/security/accounts/${encodeURIComponent(accountId)}`)).result;
          if (acc.linked_person) throw new OpenSilexError(400, `${acc.email} already has a person.`);
          await authedPut("/security/persons", personPayload(person, { account: accountId }));
        },
        unlink: async () => { throw new OpenSilexError(400, "A person's account can't be unset in this app."); },
      },
    },
    deleteUrl: () => "",
    facts: (p) => factsOf([["Email", p.email], ["Affiliation", p.affiliation], ["ORCID", p.orcid]]),
    queryRelations: [
      { label: "Account", type: "account", url: () => "", load: async (id) => {
        const acc = (await authedGetOne(`/security/persons/${encodeURIComponent(id)}`)).result.account;
        return acc ? [accountItem((await authedGetOne(`/security/accounts/${encodeURIComponent(String(acc))}`)).result)] : [];
      } },
      { label: "Scientific supervisor of", type: "experiment", url: () => "", load: async (id) => listedIn(await experimentDetails(), "scientific_supervisors", id) },
      { label: "Technical supervisor of", type: "experiment", url: () => "", load: async (id) => listedIn(await experimentDetails(), "technical_supervisors", id) },
      ...([["Coordinator of", "coordinators"], ["Scientific contact of", "scientific_contacts"], ["Administrative contact of", "administrative_contacts"]] as const).map(([label, field]) => ({
        label, type: "project", url: () => "", load: async (id: string) => listedIn((await authedGet("/core/projects?page_size=500")).result, field, id),
      })),
    ],
  },
  // What is measured: a variable = entity + characteristic + method + unit, each its own resource
  // shared by many variables. Created here or by the import; only the NAME is editable (probed
  // 2026-10-07: the uri stays, and PHIS lets a unit or entity change even under existing values,
  // silently relabelling the numbers — so those are never offered). Deleting is refused while it has values.
  variable: {
    getUrl: (id) => `/core/variables/${encodeURIComponent(id)}`,
    putUrl: "/core/variables",
    putPayload: variablePayload,
    deleteUrl: (id) => `/core/variables/${encodeURIComponent(id)}`,
    deleteRemovesLinks: true, // the four parts are shared resources that stay; nothing to unlink first
    rename: async (id, name) => {
      await refuseTakenName("/core/variables", name, "variable", id);
      await updateNode(NODE_TYPES.variable, id, { name: name.trim() });
      return name.trim();
    },
    create: async (p) => {
      const name = String(p.name ?? "").trim();
      await refuseTakenName("/core/variables", name, "variable");
      const made = (await authedPost("/core/variables", { ...p, name, datatype: "http://www.w3.org/2001/XMLSchema#decimal" })).result as unknown;
      return { id: String(Array.isArray(made) ? made[0] : made), label: name };
    },
    deleteBlockedBy: async (_dto, id) => {
      const n = await variableValueCount(id);
      return n ? `has ${plural(n, "measured value")}. Measured values are research data, so this app doesn't delete a variable's values in bulk — delete them in PHIS if you really mean to.` : null;
    },
    relationGroups: [
      { label: "Entity", field: "entity", type: "entity" },
      { label: "Characteristic", field: "characteristic", type: "characteristic" },
      { label: "Method", field: "method", type: "method" },
      { label: "Unit", field: "unit", type: "unit" },
    ],
    updateLinkFields: [],
    actions: ["rename", "delete", "link"], // link: into a variable group (the group owns the field); the variable has no link fields of its own
    facts: (v) => factsOf([["Values", DATATYPES[String(v.datatype)] ?? v.datatype], ["Description", v.description]]),
    queryRelations: [
      { label: "In variable groups", type: "variable_group", url: (id) => `/core/variables_group?variableUri=${encodeURIComponent(id)}&page_size=200`, emptyText: "In no variable group." },
    ],
  },
  // Made by the import (one per import). Probed 2026-10-07: renaming keeps the uri and the values; PHIS refuses
  // deleting one that still has values; DELETE /core/data?provenance= removes exactly that provenance's values.
  provenance: {
    getUrl: (id) => `/core/provenances/${encodeURIComponent(id)}`,
    putUrl: "/core/provenances",
    putPayload: (dto, name) => ({
      uri: dto.uri, name, description: dto.description ?? undefined, prov_activity: dto.prov_activity ?? undefined, prov_agent: dto.prov_agent ?? undefined,
    }),
    deleteUrl: (id) => `/core/provenances/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete"],
    facts: (p) => {
      const act = (p.prov_activity as { start_date?: string; end_date?: string }[] | null)?.[0];
      const pub = p.publisher as { email?: string } | null;
      return factsOf([["Description", p.description], ["Period", act?.start_date ? `${dateOf(act.start_date)} to ${dateOf(act.end_date ?? act.start_date)}` : ""], ["Published by", pub?.email]]);
    },
    deleteBlockedBy: async (_dto, id) => {
      const n = await provenanceValueCount(id);
      return n ? `has ${plural(n, "measured value")}. Delete them first.` : null;
    },
    deleteBlockFix: {
      check: async (id, dto) => {
        const n = await provenanceValueCount(id);
        return n ? {
          label: `Delete its ${plural(n, "measured value")}`,
          confirm: `Delete all ${plural(n, "measured value")} of ${String(dto.name ?? id)}, in every experiment? This undoes the import that made them. Measured values are research data: they can't be recovered.`,
        } : null;
      },
      run: async (id) => { await authedDelete(`/core/data?provenance=${encodeURIComponent(id)}`); },
    },
  },
  // A named set of variables. Probed 2026-10-08: the members are the group's own `variables` field (an update REPLACES the list),
  // deleting the group leaves the variables alone, and the list can be filtered by member (?variableUri=).
  variable_group: {
    getUrl: (id) => `/core/variables_group/${encodeURIComponent(id)}`,
    putUrl: "/core/variables_group",
    deleteUrl: (id) => `/core/variables_group/${encodeURIComponent(id)}`,
    relationGroups: [{ label: "Variables", field: "variables", type: "variable" }],
    updateLinkFields: ["variables"],
    deleteRemovesLinks: true, // only the grouping goes; the variables stay
    rename: async (id, name) => {
      await refuseTakenName("/core/variables_group", name, "variable group", id);
      await updateNode(NODE_TYPES.variable_group, id, { name: name.trim() });
      return name.trim();
    },
    create: async (p) => {
      const name = String(p.name ?? "").trim();
      await refuseTakenName("/core/variables_group", name, "variable group");
      const made = (await authedPost("/core/variables_group", { ...p, name })).result as unknown;
      return { id: String(Array.isArray(made) ? made[0] : made), label: name };
    },
    facts: (g) => factsOf([["Description", typeof g.description === "string" ? g.description.trim() : null]]),
  },
  // A named set of germplasm. Probed 2026-10-08: the record only says how many (`germplasm_count`); the members come from
  // `/germplasm` and are written back as `germplasm_list`, which an update REPLACES. Deleting the group leaves the germplasm alone.
  germplasm_group: {
    getUrl: (id) => `/core/germplasm_group/${encodeURIComponent(id)}`,
    putUrl: "/core/germplasm_group",
    deleteUrl: (id) => `/core/germplasm_group/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    deleteRemovesLinks: true,
    rename: async (id, name) => {
      await refuseTakenGermplasmGroupName(name, id);
      const dto = (await authedGetOne(`/core/germplasm_group/${encodeURIComponent(id)}`)).result;
      await putGermplasmGroup(dto, name.trim(), (await germplasmGroupMembers(id)).map((m) => String(m.uri)));
      return name.trim();
    },
    create: async (p) => {
      const name = String(p.name ?? "").trim();
      await refuseTakenGermplasmGroupName(name);
      const made = (await authedPost("/core/germplasm_group", { ...p, name })).result as unknown;
      return { id: String(Array.isArray(made) ? made[0] : made), label: name };
    },
    contextLinks: {
      member: {
        otherType: "germplasm",
        current: async (id) => Promise.all((await germplasmGroupMembers(id)).map((m) => compactUri(String(m.uri)))),
        link: async (id, germplasmId) => {
          const dto = (await authedGetOne(`/core/germplasm_group/${encodeURIComponent(id)}`)).result;
          const have = (await germplasmGroupMembers(id)).map((m) => String(m.uri));
          await putGermplasmGroup(dto, String(dto.name ?? ""), [...have, germplasmId]);
        },
        unlink: async (id, germplasmId) => {
          const dto = (await authedGetOne(`/core/germplasm_group/${encodeURIComponent(id)}`)).result;
          const drop = await compactUri(germplasmId);
          const keep: string[] = [];
          for (const m of await germplasmGroupMembers(id)) if ((await compactUri(String(m.uri))) !== drop) keep.push(String(m.uri));
          await putGermplasmGroup(dto, String(dto.name ?? ""), keep);
        },
      },
    },
    facts: (g) => factsOf([["Description", typeof g.description === "string" ? g.description.trim() : null]]),
    queryRelations: [
      { label: "Germplasm", type: "germplasm", field: "member", url: () => "", emptyText: "No germplasm in this group yet.", load: async (id) =>
        Promise.all((await germplasmGroupMembers(id)).map(async (m) => ({ id: await compactUri(String(m.uri)), label: String(m.name ?? m.uri), kind: germplasmKind(m.rdf_type) }))) },
    ],
  },
  entity: variablePart("entity", "entities"),
  characteristic: variablePart("characteristic", "characteristics"),
  method: variablePart("method", "methods"),
  unit: variablePart("unit", "units", (u) => [["Symbol", u.symbol]]),
  account: {
    getUrl: (id) => `/security/accounts/${encodeURIComponent(id)}`,
    putUrl: "",
    deleteUrl: () => "",
    relationGroups: [],
    updateLinkFields: [],
    actions: ["link"], // only to a person, set from the person's side (person.contextLinks)
    facts: (a) => factsOf([["Email", a.email], ["Admin", a.admin ? "yes" : "no"], ["Enabled", a.enable ? "yes" : "no"]]),
    queryRelations: [
      { label: "Person", type: "person", url: () => "", load: async (id) => {
        const p = (await authedGetOne(`/security/accounts/${encodeURIComponent(id)}`)).result.linked_person;
        if (!p) return [];
        const person = (await authedGetOne(`/security/persons/${encodeURIComponent(String(p))}`)).result;
        return [{ id: String(person.uri), label: personName(person) }];
      } },
      // The account's groups, each with the profile (role) it has there.
      { label: "Groups", type: "group", url: () => "", load: async (id) => {
        const key = await compactUri(id);
        return Promise.all((await authedGet(`/security/accounts/${encodeURIComponent(id)}/groups`)).result.map(async (g) => {
          const ups = ((await authedGetOne(`/security/groups/${encodeURIComponent(g.uri)}`)).result.user_profiles ?? []) as { user_uri: string; profile_name?: string }[];
          let role = "";
          for (const up of ups) if ((await compactUri(up.user_uri)) === key) role = up.profile_name ?? "";
          return { id: String(g.uri), label: role ? `${g.name} · ${role}` : String(g.name) };
        }));
      } },
    ],
  },
  // Probed 2026-10-07: a group's `user_profiles` (account + profile pairs) is REPLACED as a whole by every update
  // (leave it out and everyone is removed), one account may hold two profiles, a group can be created without members, and
  // deleting a group removes the sharing it gave (experiments stop being shared) even while it has members.
  group: {
    getUrl: (id) => `/security/groups/${encodeURIComponent(id)}`,
    putUrl: "/security/groups",
    putPayload: (dto, name) => groupPayload(dto, name),
    deleteUrl: (id) => `/security/groups/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete", "link"],
    deleteRemovesLinks: true,
    rename: async (id, name) => {
      await refuseTakenName("/security/groups", name, "group", id);
      await updateNode(NODE_TYPES.group, id, { name: name.trim() });
      return name.trim();
    },
    deleteWarning: async (id, dto) => {
      const members = new Set(((dto.user_profiles ?? []) as { user_uri: string }[]).map((u) => u.user_uri)).size;
      const shared = await sharedWith(id);
      const total = shared.reduce((n, s) => n + s.items.length, 0);
      const what = shared.filter((s) => s.items.length).map((s) => (s.type === "germplasm" ? `${s.items.length} germplasm` : plural(s.items.length, s.type)));
      const parts = [members ? `its ${plural(members, "member")} ${members === 1 ? "loses" : "lose"} the access it gives` : "", total ? `${what.join(", ")} ${total === 1 ? "stops" : "stop"} being shared` : ""].filter(Boolean);
      return parts.length ? `${parts.join(" and ")}.`.replace(/^./, (c) => c.toUpperCase()) : "";
    },
    // A member is an (account, profile) pair; the profile is the user's choice (never defaulted), so linking goes
    // through /api/link's `profile`, and this only removes: every pair the account has in the group.
    contextLinks: {
      member: {
        otherType: "account",
        current: async (id) => [...new Set(((await authedGetOne(`/security/groups/${encodeURIComponent(id)}`)).result.user_profiles as { user_uri: string }[] ?? []).map((u) => u.user_uri))],
        link: async () => { throw new OpenSilexError(400, "Say which profile: select the group and the people, then use the “Add … to … as …” buttons."); },
        unlink: async (id, accountId) => { await removeGroupMember(id, accountId); },
      },
    },
    facts: (g) => factsOf([["Description", typeof g.description === "string" ? g.description.trim() : null]]),
    queryRelations: [
      { label: "Members", type: "account", field: "member", url: () => "", load: async (id) => {
        const ups = ((await authedGetOne(`/security/groups/${encodeURIComponent(id)}`)).result.user_profiles ?? []) as { user_uri: string; user_name?: string; profile_name?: string }[];
        const names = new Map((await authedGet("/security/accounts?page_size=500")).result.map((a) => [String(a.uri), accountItem(a).label]));
        return ups.map((up) => ({ id: up.user_uri, label: `${names.get(up.user_uri) ?? up.user_name ?? up.user_uri}${up.profile_name ? ` · ${up.profile_name}` : ""}` }));
      } },
      ...(["experiment", "germplasm", "organization", "site"] as const).map((type) => ({
        label: `Shared ${SHARE_LABEL[type]}`, type, url: () => "",
        load: async (id: string) => (await sharedWith(id)).find((s) => s.type === type)!.items,
      })),
    ],
  },
  // A profile = a name + the list of rights it holds (edited in the page's tick-box editor, see routes/profile-rights.ts).
  // Probed 2026-10-07: an update replaces the whole list; deleting a profile that groups use silently REMOVES those members
  // from their groups — so the delete is blocked while any group uses it, with the way forward.
  profile: {
    getUrl: (id) => `/security/profiles/${encodeURIComponent(id)}`,
    putUrl: "/security/profiles",
    putPayload: (dto, name) => ({ uri: dto.uri, name, credentials: dto.credentials ?? [] }),
    deleteUrl: (id) => `/security/profiles/${encodeURIComponent(id)}`,
    relationGroups: [],
    updateLinkFields: [],
    actions: ["rename", "delete"],
    rename: async (id, name) => {
      await refuseTakenName("/security/profiles", name, "profile", id);
      await updateNode(NODE_TYPES.profile, id, { name: name.trim() });
      return name.trim();
    },
    // Starts empty, or with the rights of another profile (the tedious part of making one by hand).
    create: async (p) => {
      const name = String(p.name ?? "").trim();
      await refuseTakenName("/security/profiles", name, "profile");
      const credentials = p.copy_from ? (((await authedGetOne(`/security/profiles/${encodeURIComponent(String(p.copy_from))}`)).result.credentials ?? []) as string[]) : [];
      const made = (await authedPost("/security/profiles", { name, credentials })).result as unknown;
      return { id: String(Array.isArray(made) ? made[0] : made), label: name };
    },
    deleteBlockedBy: async (_dto, id) => {
      const key = await compactUri(id);
      const used: string[] = [];
      let people = 0;
      for (const g of (await authedGet("/security/groups?page_size=500")).result) {
        const mine = new Set<string>();
        for (const u of (g.user_profiles ?? []) as { user_uri: string; profile_uri: string }[]) if ((await compactUri(u.profile_uri)) === key) mine.add(u.user_uri);
        if (mine.size) { used.push(String(g.name ?? g.uri)); people += mine.size; }
      }
      return used.length ? `is the profile of ${people} ${people === 1 ? "person" : "people"} in ${used.join(", ")}, and deleting it would silently remove them from ${used.length === 1 ? "that group" : "those groups"}. Give them another profile first: select the group and the people, use Unlink selection, then add them with the profile you want.` : null;
    },
    facts: (p) => factsOf([["Rights", Array.isArray(p.credentials) ? `${p.credentials.length}` : null]]),
    queryRelations: [
      { label: "Used in groups", type: "group", url: () => "", load: async (id) => {
        const key = await compactUri(id);
        const out: { id: string; label: string }[] = [];
        for (const g of (await authedGet("/security/groups?page_size=500")).result) {
          const ups = (g.user_profiles ?? []) as { profile_uri: string }[];
          for (const up of ups) if ((await compactUri(up.profile_uri)) === key) { out.push({ id: String(g.uri), label: String(g.name ?? g.uri) }); break; }
        }
        return out;
      } },
    ],
  },
  site: {
    getUrl: (id) => `/core/sites/${encodeURIComponent(id)}`,
    putUrl: "/core/sites",
    deleteUrl: (id) => `/core/sites/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Organizations", field: "organizations", type: "organization" },
      { label: "Facilities", field: "facilities", type: "facility" },
      { label: "Shared with", field: "groups", type: "group" },
    ],
    // Unlike an organization's derived `sites`, these are real SiteUpdateDTO fields —
    // so org<->site links (and the groups it is shared with) are owned (and unlinkable) from the site's side.
    updateLinkFields: ["organizations", "facilities", "groups"],
  },
};

type NamedRef = { uri: string; name?: string };

// Relation fields hold {uri, name} refs on most DTOs, bare uri strings on some (an experiment's
// supervisors/factors) — every reader goes through this so both shapes work.
export function refUri(r: NamedRef | string): string {
  return typeof r === "string" ? r : r.uri;
}

// `field` is only included for relation groups the type can actually unlink (a subset of
// updateLinkFields — see below) — the frontend uses its presence to decide whether an "Unlink"
// action makes sense for that group at all, without needing to know any DTO field names itself.
export function relationsFromDto(dto: Record<string, unknown>, config: NodeConfig) {
  return config.relationGroups.flatMap((rg) => {
    const refs = dto[rg.field];
    // Most relation fields are {uri, name} refs; some (an experiment's supervisors/factors) are
    // bare uri strings; a few hold ONE uri with its label in nameField (a germplasm's species).
    // A variable's parts are one {uri, name} each.
    const list = Array.isArray(refs) ? (refs as (NamedRef | string)[])
      : typeof refs === "string" ? [{ uri: refs, name: rg.nameField ? (dto[rg.nameField] as string | undefined) : undefined }]
      : refs && typeof refs === "object" && "uri" in refs ? [refs as NamedRef] : [];
    const items = list.map((r) => (typeof r === "string" ? { uri: r } : r)).map((r) => ({
      id: String(r.uri),
      type: rg.type,
      label: String(r.name ?? r.uri),
      ...(rg.kind ? { kind: rg.kind } : {}),
    }));
    if (!items.length) return [];
    const unlinkable = config.updateLinkFields.includes(rg.field);
    return [{ label: rg.label, field: unlinkable ? rg.field : undefined, items }];
  });
}

export type QueryRelation = NonNullable<NodeConfig["queryRelations"]>[number];

export async function queryItems(q: QueryRelation, id: string) {
  if (q.load) return (await q.load(id)).map((it) => ({ ...it, type: q.type }));
  let rows = (await authedGet(q.url(id))).result;
  // Uris come back full or prefixed (phis:id/...) depending on the endpoint, so compare compacted.
  if (q.compactIds || q.skipSelf) rows = await Promise.all(rows.map(async (r) => ({ ...r, uri: await compactUri(String(r.uri)) })));
  if (q.skipSelf) {
    const self = await compactUri(id);
    rows = rows.filter((r) => r.uri !== self);
  }
  return rows
    .map((r) => (q.item ? q.item(r) : { id: String(r.uri), label: String(r.name ?? r.uri) }))
    .filter((it): it is { id: string; label: string } => it !== null)
    .map((it) => ({ ...it, type: q.type }));
}

// relationsFromDto plus any queryRelations groups — what node-detail (and an unlink response,
// which replaces the frontend's cached relations wholesale) returns.
async function setPersonInCharge(deviceId: string, personId: string | null) {
  const dto = (await authedGetOne(`/core/devices/${encodeURIComponent(deviceId)}`)).result;
  const body = updatePayloadFromDto(deviceId, String(dto.name ?? ""), dto, NODE_TYPES.device, {});
  delete body.person_in_charge;
  await authedPut("/core/devices", personId ? { ...body, person_in_charge: personId } : body);
}
// What is shared with a group: each type holds the group in its own `groups` field, and the lists don't carry it
// (except germplasm's), so experiments, organizations and sites are read in full.
// ponytail: one GET per experiment/organization/site (a handful on phis-test); needs a server-side query past a few hundred.
// One scan per page view: the group page asks for each type's list and for the delete warning at the same moment, and every
// scan reads whole records from PHIS (phis-test's OpenSILEX was OOM-killed when this ran five times at once), so
// concurrent and immediately repeated asks share one result, and the records are read one at a time.
const sharedCache = new Map<string, { at: number; scan: ReturnType<typeof scanShared> }>();
export const _resetSharedCacheForTests = () => sharedCache.clear();
function sharedWith(groupId: string) {
  const hit = sharedCache.get(groupId);
  if (hit && Date.now() - hit.at < 4000) return hit.scan;
  const scan = scanShared(groupId);
  sharedCache.set(groupId, { at: Date.now(), scan });
  scan.catch(() => sharedCache.delete(groupId));
  return scan;
}
async function scanShared(groupId: string) {
  const full = async (list: string, one: string) => {
    const out: Record<string, unknown>[] = [];
    for (const r of (await authedGet(list)).result) out.push((await authedGetOne(`${one}/${encodeURIComponent(r.uri)}`)).result);
    return out;
  };
  const rows: [keyof typeof SHARE_LABEL, Record<string, unknown>[]][] = [
    ["experiment", await experimentDetails()],
    ["germplasm", (await authedGet("/core/germplasm?page_size=500")).result],
    ["organization", await full("/core/organisations?page_size=500", "/core/organisations")],
    ["site", await full("/core/sites?page_size=500", "/core/sites")],
  ];
  const out = [];
  for (const [type, list] of rows) out.push({ type, label: SHARE_LABEL[type], items: await listedIn(list, "groups", groupId) });
  return out;
}
// A germplasm group's members: its record only counts them, so they are read page by page.
async function germplasmGroupMembers(id: string) {
  const out: Record<string, unknown>[] = [];
  for (let page = 0; ; page++) {
    const rows = (await authedGet(`/core/germplasm_group/${encodeURIComponent(id)}/germplasm?page_size=500&page=${page}`)).result;
    out.push(...rows);
    if (rows.length < 500) return out;
  }
}
// The update replaces the whole member list, so it always goes back complete (duplicates in either spelling of a uri dropped).
async function putGermplasmGroup(dto: Record<string, unknown>, name: string, members: string[]) {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const m of members) {
    const key = await compactUri(m);
    if (!seen.has(key)) { seen.add(key); list.push(m); }
  }
  await authedPut("/core/germplasm_group", { uri: dto.uri, name, description: dto.description ?? "", germplasm_list: list });
}
// Germplasm groups have no GET list: the name filter lives on the search (POST).
async function refuseTakenGermplasmGroupName(name: string, self?: string) {
  const want = name.trim().toLowerCase();
  if (!want) throw new OpenSilexError(400, "A name is required.");
  const rows = (await authedPost(`/core/germplasm_group/search?name=${encodeURIComponent(`^${escapeRegex(name.trim())}$`)}&page_size=50`, {}) as unknown as { result: Record<string, unknown>[] }).result;
  const selfKey = self ? await compactUri(self) : null;
  for (const r of rows) {
    if (String(r.name).toLowerCase() !== want || (selfKey && (await compactUri(String(r.uri))) === selfKey)) continue;
    throw new OpenSilexError(400, `There is already a germplasm group named "${r.name}".`);
  }
}
type Pair = { user_uri: string; profile_uri: string };
const pairsOf = (dto: Record<string, unknown>): Pair[] => ((dto.user_profiles ?? []) as Pair[]).map((u) => ({ user_uri: u.user_uri, profile_uri: u.profile_uri }));
function groupPayload(dto: Record<string, unknown>, name: string, pairs: Pair[] = pairsOf(dto)) {
  return { uri: dto.uri, name, description: dto.description ?? "", user_profiles: pairs };
}
// Adds accounts to a group with one profile: only pairs that aren't there already; counts both.
export async function addGroupMembers(groupId: string, accountIds: string[], profileId: string) {
  const dto = (await authedGetOne(`/security/groups/${encodeURIComponent(groupId)}`)).result;
  const pairs = pairsOf(dto);
  const have = new Set(await Promise.all(pairs.map(async (p) => `${await compactUri(p.user_uri)}|${await compactUri(p.profile_uri)}`)));
  const profile = await compactUri(profileId);
  let linked = 0, already = 0;
  for (const a of accountIds) {
    const key = `${await compactUri(a)}|${profile}`;
    if (have.has(key)) { already++; continue; }
    pairs.push({ user_uri: a, profile_uri: profileId });
    have.add(key);
    linked++;
  }
  if (linked) await authedPut("/security/groups", groupPayload(dto, String(dto.name ?? ""), pairs));
  return { linked, already };
}
async function removeGroupMember(groupId: string, accountId: string) {
  const dto = (await authedGetOne(`/security/groups/${encodeURIComponent(groupId)}`)).result;
  const key = await compactUri(accountId);
  const keep: Pair[] = [];
  for (const p of pairsOf(dto)) if ((await compactUri(p.user_uri)) !== key) keep.push(p);
  await authedPut("/security/groups", groupPayload(dto, String(dto.name ?? ""), keep));
}
const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) throw new OpenSilexError(400, "Give a first and a last name, e.g. Ann Lee.");
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
};
// The PersonDTO from the GetDTO (they match; probed 2026-10-07), with some fields changed. PHIS keeps an account
// link once set: leaving `account` out of an update does NOT unlink it.
function personPayload(dto: Record<string, unknown>, changes: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { uri: dto.uri };
  for (const k of ["first_name", "last_name", "email", "affiliation", "phone_number", "orcid", "account"]) if (dto[k] != null) out[k] = dto[k];
  return { ...out, ...changes };
}
// Supervisors and contacts are stored as bare uris, so their chips would read as uris: name them from the persons list.
async function personLabels() {
  const names = new Map<string, string>();
  try {
    for (const p of (await authedGet("/security/persons?page_size=500")).result) names.set(await compactUri(String(p.uri)), personName(p));
  } catch { /* names are a nicety: the uri stays when the list can't be read */ }
  return names;
}
async function groupLabels() {
  const names = new Map<string, string>();
  try {
    for (const g of (await authedGet("/security/groups?page_size=500")).result) names.set(await compactUri(String(g.uri)), String(g.name ?? g.uri));
  } catch { /* the uri stays */ }
  return names;
}
export async function relationsFor(id: string, dto: Record<string, unknown>, config: NodeConfig) {
  const groups: { label: string; field?: string; blocksDelete?: true; emptyText?: string; items: { id: string; type: string; label: string }[] }[] = relationsFromDto(dto, config);
  for (const q of config.queryRelations ?? []) {
    let items: { id: string; type: string; label: string; groups?: unknown[] }[] = await queryItems(q, id);
    if (q.itemGroups) items = await Promise.all(items.map(async (it) => ({ ...it, groups: await q.itemGroups!(id, it.id) })));
    if (items.length || q.emptyText) {
      groups.push({ label: q.label, ...(q.field ? { field: q.field } : {}), items, ...(q.blocksDelete ? { blocksDelete: true } : {}), ...(items.length ? {} : { emptyText: q.emptyText }) });
    }
  }
  for (const [type, labels] of [["person", personLabels], ["group", groupLabels]] as const) {
    if (!groups.some((g) => g.items.some((it) => it.type === type && it.label === it.id))) continue;
    const names = await labels();
    for (const g of groups) for (const it of g.items) if (it.type === type && it.label === it.id) it.label = names.get(await compactUri(it.id)) ?? it.label;
  }
  return groups;
}

// Builds the full-DTO PUT payload from the CURRENT dto, optionally adding one or more uris to
// (or dropping one uri from) one field before sending it back. Every OpenSILEX update is a
// full replace, so the WHOLE current dto goes back — not just name + link fields, which
// silently wiped address/description/rdf_type on every rename/link/unlink (confirmed live
// against real sites/facilities). GetDTOs return relations as {uri, name} objects where the
// UpdateDTO wants plain uri strings (link fields, but also groups/variableGroups), so any
// array of {uri} objects is flattened. Derived relations (relationGroups not in
// updateLinkFields, e.g. an org's children/sites) are dropped; other get-only extras
// (publisher, geometry, ...) go along and OpenSILEX ignores them (checked live). `link` and `unlink` are mutually exclusive
// in practice (one call does one thing). `link.uris` lets several items of the same type get
// batched into one PUT — e.g. 4 selected facilities + 1 organization is one PUT to the org.
export function updatePayloadFromDto(
  id: string,
  name: string,
  dto: Record<string, unknown>,
  config: NodeConfig,
  mod?: { unlink?: { field: string; uri: string }; link?: { field: string; uris: string[] }; isPublic?: boolean }
) {
  // OpenSILEX (1.5.4.7) bug, found live: a PUT carrying `address` creates a NEW location
  // ObservationCollection instead of reusing the node's existing one, and the duplicate then
  // 500s every GET of that type ("Multiple objects for the same URI") — the whole Sites list
  // broke from one test PUT. Omitting `address` instead silently wipes it. Neither is safe, so
  // refuse outright for any node that has one; nothing to preserve = nothing to break.
  // ponytail: blocks edits on addressed nodes entirely; revisit if OpenSILEX fixes site PUT.
  if (dto.address) {
    throw new OpenSilexError(409, "Editing a node with an address is disabled: OpenSILEX's update endpoint either wipes the address or corrupts the node. Edit it in PHIS directly.");
  }
  // A single-uri group (nameField: a germplasm's species) is the node's own field, not derived.
  const derived = new Set(config.relationGroups.filter((rg) => !rg.nameField).map((rg) => rg.field).filter((f) => !config.updateLinkFields.includes(f)));
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (derived.has(k)) continue;
    const isRefArray = Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === "object" && "uri" in r);
    payload[k] = isRefArray ? (v as NamedRef[]).map((r) => r.uri) : v;
  }
  payload.uri = id;
  payload.name = name;
  if (mod?.isPublic !== undefined) payload.is_public = mod.isPublic;
  for (const field of config.updateLinkFields) {
    let uris = (Array.isArray(dto[field]) ? (dto[field] as (NamedRef | string)[]) : []).map(refUri);
    if (mod?.unlink && mod.unlink.field === field) uris = uris.filter((u) => u !== mod.unlink!.uri);
    if (mod?.link && mod.link.field === field) uris = [...new Set([...uris, ...mod.link.uris])];
    payload[field] = uris;
  }
  return payload;
}

// Every DTO edit (rename, link, unlink) is this read-then-full-replace-PUT — see
// updatePayloadFromDto. Read fresh on every call so two changes to one node never clobber each
// other. Returns the DTO as it was before the PUT.
export async function updateNode(
  config: NodeConfig,
  id: string,
  mod: { name?: string; unlink?: { field: string; uri: string }; link?: { field: string; uris: string[] }; isPublic?: boolean }
) {
  const current = (await authedGetOne(config.getUrl(id))).result;
  const name = mod.name ?? String(current.name ?? "");
  await authedPut(config.putUrl, config.putPayload ? config.putPayload(current, name) : updatePayloadFromDto(id, name, current, config, mod));
  return current;
}

// How typeA<->typeB is linked, if at all: an operation (contextLinks) first, else a DTO field.
export type ResolvedLink = { ownerType: string; field: string; ctx?: ContextLink };
export function resolveLink(typeA: string, typeB: string): ResolvedLink | null {
  return contextLinkFor(typeA, typeB) ?? linkFieldFor(typeA, typeB);
}

// Links every owner to every other id through a resolved link — one PUT per owner for a DTO
// field (all otherIds batched), one operation per pair for a contextLink. Counts pairs that
// were genuinely new vs already there, so callers can tell a no-op apart from a link.
export async function applyLink(r: ResolvedLink, ownerIds: string[], otherIds: string[]) {
  let linked = 0;
  let already = 0;
  const carryOver: CarryOver[] = [];
  for (const ownerId of ownerIds) {
    const existing = new Set(r.ctx ? await r.ctx.current(ownerId) : []);
    if (!r.ctx) {
      const before = await updateNode(NODE_TYPES[r.ownerType], ownerId, { link: { field: r.field, uris: otherIds } });
      (Array.isArray(before[r.field]) ? (before[r.field] as (NamedRef | string)[]) : []).forEach((u) => existing.add(refUri(u)));
    }
    for (const otherId of otherIds) {
      if (existing.has(otherId)) { already++; continue; }
      if (r.ctx) {
        await r.ctx.link(ownerId, otherId);
        if (r.ctx.carryOver) carryOver.push(...(await r.ctx.carryOver(ownerId, otherId)));
      }
      linked++;
    }
  }
  return { linked, already, carryOver };
}

// Given two node types, finds which one (if either) can hold a real link to the other via its
// own settable fields — i.e. an entry in its relationGroups pointing at the other type, where
// that entry's field is also in its own updateLinkFields. Prefers `typeA` owning the link when
// both sides could (arbitrary but deterministic — either side produces the same underlying
// relation for the type pairs wired so far). Returns null for same-type pairs (e.g. two
// organizations) — which one is the "parent" is ambiguous from the pair alone, not handled yet.
export function linkFieldFor(typeA: string, typeB: string): { ownerType: string; field: string } | null {
  if (typeA === typeB) return null;
  for (const [ownerType, otherType] of [
    [typeA, typeB],
    [typeB, typeA],
  ]) {
    const config = NODE_TYPES[ownerType];
    if (!config) continue;
    const rg = config.relationGroups.find((r) => r.type === otherType && config.updateLinkFields.includes(r.field));
    if (rg) return { ownerType, field: rg.field };
  }
  return null;
}
