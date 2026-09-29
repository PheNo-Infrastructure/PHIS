import { OpenSilexError, authedGet, authedGetOne, authedPost, authedPut, authedDelete, compactUri } from "./opensilex.ts";

// View/edit/delete config, one entry per type — same reasoning as CREATABLE in creation.js:
// adding a type is "add one entry here," not a new code path. Unlike CREATABLE this doesn't
// need to be shared with the browser (the frontend never sees DTO field names, only the
// {label, items} shape the backend already translated), so it stays plain TS, not inlined JS.
// nameField: for a single-uri field (a germplasm's `species`), the DTO field holding its label
// (`species_name`).
export type RelationGroup = { label: string; field: string; type: string; nameField?: string };

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
  // scientific object can be deleted but not renamed/linked yet (its writes need experiment
  // context).
  actions?: Action[];
  // Delete goes ahead with links still in place — OpenSILEX drops them with the node (confirmed
  // for sites and experiments) — so the confirm names them instead of routing to unlink mode.
  deleteRemovesLinks?: true;
  // DELETE calls to make before deleteUrl — e.g. a scientific object's per-experiment copies
  // (OpenSILEX refuses deleting the global copy while any experiment copy exists — probed).
  deleteFirst?: (id: string) => Promise<string[]>;
  // Links that are an OPERATION, not a field on either DTO — keyed by the relation-group field
  // name the detail pane uses for them. A scientific object "in" an experiment is its own copy
  // in that experiment's graph (probed live): linking POSTs a copy there, unlinking deletes
  // that copy (the object's other experiments and its global copy stay). Registered on BOTH
  // types so either side's detail pane / selection can drive it.
  contextLinks?: Record<string, ContextLink>;
  // Relation groups that aren't a field on the node's own DTO but come from a query — e.g. an
  // experiment's scientific objects (each SO points at its experiment, not the reverse).
  // Read-only in the detail pane (no `field`, so no Unlink). `item` maps a result row to a
  // chip (default: the row's own uri/name), or null to skip it.
  queryRelations?: {
    label: string;
    type: string;
    url: (id: string) => string;
    item?: (row: Record<string, unknown>) => { id: string; label: string } | null;
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
    itemGroups?: (id: string, itemId: string) => Promise<{ label: string; items: { id: string; type: string; label: string }[] }[]>;
    // Shown instead of hiding the group when it's empty.
    emptyText?: string;
  }[];
};

export type ContextLink = {
  otherType: string;
  current: (id: string) => Promise<string[]>; // ids of the other side currently linked
  link: (id: string, otherId: string) => Promise<void>;
  unlink: (id: string, otherId: string) => Promise<void>;
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
// experiment. `property` is the relation's local name; `byUris` names the values in one call.
// Factor levels would be one more entry.
const SO_ROWS_PER_EXPERIMENT = [
  { label: "Germplasm", property: "hasGermplasm", type: "germplasm", byUris: () => "/core/germplasm/by_uris" },
  { label: "Part of", property: "isPartOf", type: "scientific_object", byUris: (expId: string) => `/core/scientific_objects/by_uris?experiment=${encodeURIComponent(expId)}` },
];
async function soRowsIn(soId: string, expId: string) {
  const copy = (await authedGetOne(`/core/scientific_objects/${encodeURIComponent(soId)}?experiment=${encodeURIComponent(expId)}`)).result;
  const relations = (Array.isArray(copy.relations) ? copy.relations : []) as { property: string; value: string }[];
  return Promise.all(
    SO_ROWS_PER_EXPERIMENT.map(async (row) => {
      const uris = relations.filter((r) => String(r.property).split(/[:#/]/).pop() === row.property).map((r) => String(r.value));
      if (!uris.length) return { label: row.label, items: [] };
      const named = (await authedPost(row.byUris(expId), uris)).result as unknown as { uri: string; name?: string }[];
      const names = new Map(await Promise.all(named.map(async (n) => [await compactUri(String(n.uri)), String(n.name ?? n.uri)] as const)));
      const items = await Promise.all(uris.map(async (u) => {
        const id = await compactUri(u);
        return { id, type: row.type, label: names.get(id) ?? id };
      }));
      return { label: row.label, items };
    })
  );
}

const SO_EXPERIMENTS: QueryRelation = {
  label: "In experiments",
  field: "experiment",
  type: "experiment",
  url: (id) => `/core/scientific_objects/${encodeURIComponent(id)}/experiments`,
  item: (r) => (r.experiment && r.experiment_name ? { id: String(r.experiment), label: String(r.experiment_name) } : null),
};
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
    ],
    // children/sites/experiments are read-only on OrganizationUpdateDTO (derived from the
    // other side of the relation) — only parents and facilities are real settable fields.
    updateLinkFields: ["parents", "facilities"],
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
      { label: "Factors", field: "factors", type: "factor" },
    ],
    updateLinkFields: ["organisations", "facilities", "projects", "scientific_supervisors", "technical_supervisors", "factors"],
    deleteRemovesLinks: true,
    queryRelations: [
      EXPERIMENT_SOS,
      // Derived by OpenSILEX from its objects' germplasm (not settable on the experiment).
      { label: "Species", type: "germplasm", url: (id) => `/core/experiments/${encodeURIComponent(id)}/species`, compactIds: true },
    ],
    contextLinks: {
      scientific_object: {
        otherType: "scientific_object",
        current: async (expId) => (await queryItems(EXPERIMENT_SOS, expId)).map((i) => i.id),
        link: (expId, soId) => addSoToExperiment(soId, expId),
        unlink: (expId, soId) => removeSoFromExperiment(soId, expId),
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
    actions: ["delete", "link"],
    deleteRemovesLinks: true,
    contextLinks: {
      experiment: {
        otherType: "experiment",
        current: async (soId) => (await queryItems(SO_EXPERIMENTS, soId)).map((i) => i.id),
        link: (soId, expId) => addSoToExperiment(soId, expId),
        unlink: (soId, expId) => removeSoFromExperiment(soId, expId),
      },
    },
    deleteFirst: async (id) =>
      (await queryItems(SO_EXPERIMENTS, id)).map(
        (e) => `/core/scientific_objects/${encodeURIComponent(id)}?experiment=${encodeURIComponent(e.id)}`
      ),
    queryRelations: [SO_EXPERIMENTS_DETAIL],
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
  // View-only for now. Species/variety/accession are single uris (+ *_name), not ref arrays.
  // Probed live on throwaways: ?species=X returns X's members plus X itself (skipSelf), and
  // /{uri}/experiments works (a species reaches experiments through its accessions). Which
  // scientific objects use a germplasm has no query yet: /scientific_objects?germplasm= is
  // ignored by OpenSILEX, and the hasGermplasm relation sits only on the experiment copy.
  germplasm: {
    getUrl: (id) => `/core/germplasm/${encodeURIComponent(id)}`,
    putUrl: "/core/germplasm",
    deleteUrl: (id) => `/core/germplasm/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Species", field: "species", type: "germplasm", nameField: "species_name" },
      { label: "Variety", field: "variety", type: "germplasm", nameField: "variety_name" },
      { label: "Accession", field: "accession", type: "germplasm", nameField: "accession_name" },
    ],
    updateLinkFields: [],
    actions: [],
    queryRelations: [
      { label: "Varieties and accessions", type: "germplasm", url: (id) => `/core/germplasm?species=${encodeURIComponent(id)}&page_size=500`, skipSelf: true },
      { label: "Experiments", type: "experiment", url: (id) => `/core/germplasm/${encodeURIComponent(id)}/experiments?page_size=500` },
    ],
  },
  site: {
    getUrl: (id) => `/core/sites/${encodeURIComponent(id)}`,
    putUrl: "/core/sites",
    deleteUrl: (id) => `/core/sites/${encodeURIComponent(id)}`,
    relationGroups: [
      { label: "Organizations", field: "organizations", type: "organization" },
      { label: "Facilities", field: "facilities", type: "facility" },
    ],
    // Unlike an organization's derived `sites`, both of these are real SiteUpdateDTO fields —
    // so org<->site links are owned (and unlinkable) from the site's side.
    updateLinkFields: ["organizations", "facilities"],
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
    const list = Array.isArray(refs) ? (refs as (NamedRef | string)[]) : typeof refs === "string" ? [{ uri: refs, name: rg.nameField ? (dto[rg.nameField] as string | undefined) : undefined }] : [];
    const items = list.map((r) => (typeof r === "string" ? { uri: r } : r)).map((r) => ({
      id: String(r.uri),
      type: rg.type,
      label: String(r.name ?? r.uri),
    }));
    if (!items.length) return [];
    const unlinkable = config.updateLinkFields.includes(rg.field);
    return [{ label: rg.label, field: unlinkable ? rg.field : undefined, items }];
  });
}

export type QueryRelation = NonNullable<NodeConfig["queryRelations"]>[number];

export async function queryItems(q: QueryRelation, id: string) {
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
export async function relationsFor(id: string, dto: Record<string, unknown>, config: NodeConfig) {
  const groups: { label: string; field?: string; blocksDelete?: true; emptyText?: string; items: { id: string; type: string; label: string }[] }[] = relationsFromDto(dto, config);
  for (const q of config.queryRelations ?? []) {
    let items: { id: string; type: string; label: string; groups?: unknown[] }[] = await queryItems(q, id);
    if (q.itemGroups) items = await Promise.all(items.map(async (it) => ({ ...it, groups: await q.itemGroups!(id, it.id) })));
    if (items.length || q.emptyText) {
      groups.push({ label: q.label, ...(q.field ? { field: q.field } : {}), items, ...(q.blocksDelete ? { blocksDelete: true } : {}), ...(items.length ? {} : { emptyText: q.emptyText }) });
    }
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
  mod?: { unlink?: { field: string; uri: string }; link?: { field: string; uris: string[] } }
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
  const derived = new Set(config.relationGroups.map((rg) => rg.field).filter((f) => !config.updateLinkFields.includes(f)));
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto)) {
    if (derived.has(k)) continue;
    const isRefArray = Array.isArray(v) && v.length > 0 && v.every((r) => r && typeof r === "object" && "uri" in r);
    payload[k] = isRefArray ? (v as NamedRef[]).map((r) => r.uri) : v;
  }
  payload.uri = id;
  payload.name = name;
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
  mod: { name?: string; unlink?: { field: string; uri: string }; link?: { field: string; uris: string[] } }
) {
  const current = (await authedGetOne(config.getUrl(id))).result;
  await authedPut(config.putUrl, updatePayloadFromDto(id, mod.name ?? String(current.name ?? ""), current, config, mod));
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
  for (const ownerId of ownerIds) {
    const existing = new Set(r.ctx ? await r.ctx.current(ownerId) : []);
    if (!r.ctx) {
      const before = await updateNode(NODE_TYPES[r.ownerType], ownerId, { link: { field: r.field, uris: otherIds } });
      (Array.isArray(before[r.field]) ? (before[r.field] as (NamedRef | string)[]) : []).forEach((u) => existing.add(refUri(u)));
    }
    for (const otherId of otherIds) {
      if (existing.has(otherId)) { already++; continue; }
      if (r.ctx) await r.ctx.link(ownerId, otherId);
      linked++;
    }
  }
  return { linked, already };
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
