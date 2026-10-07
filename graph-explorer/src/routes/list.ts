import { authedGet, compactUri, type RawItem } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { accountItem, germplasmKind, personName } from "../node-types.ts";

const byName = (i: RawItem) => String(i.name ?? i.uri);
// A class tree ({uri, name, children}) as one list, by name.
const flattenClasses = (tree: RawItem[]): RawItem[] => {
  const out: RawItem[] = [];
  const walk = (n: RawItem) => { out.push(n); ((n.children as RawItem[] | undefined) ?? []).forEach(walk); };
  tree.forEach(walk);
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

// parent: the one node an item sits under in the category browser (a germplasm's species) —
// the page lists only parentless items at the category level and an opened node's children
// under it. Only for strictly single-parent relations; many-to-many ones stay relation chips.
// kind: what the item is within its type (a germplasm's species/variety/accession).
// rows: reshapes the answer first (a class tree flattened to a list).
export type ListRoute = { url: string; type: string; label: (i: RawItem) => string; parent?: (i: RawItem) => unknown; kind?: (i: RawItem) => string | undefined; rows?: (result: RawItem[]) => RawItem[] };

// Every browsable OpenSILEX list wired here. `label` picks whichever field
// that entity type actually uses for a human-readable name — most use
// `name`, but persons, datafiles, events and documents don't.
export const listRoutes: Record<string, ListRoute> = {
  "/api/organizations": { url: "/core/organisations", type: "organization", label: byName },
  "/api/experiments": { url: "/core/experiments?page_size=500", type: "experiment", label: byName },
  "/api/projects": { url: "/core/projects?page_size=500", type: "project", label: byName },
  "/api/facilities": { url: "/core/facilities?page_size=500", type: "facility", label: byName },
  "/api/devices": { url: "/core/devices?page_size=500", type: "device", label: byName },
  "/api/sites": { url: "/core/sites?page_size=500", type: "site", label: byName },
  "/api/persons": { url: "/security/persons?page_size=500", type: "person", label: personName },
  "/api/accounts": { url: "/security/accounts?page_size=500", type: "account", label: (i) => accountItem(i).label },
  "/api/groups": { url: "/security/groups?page_size=500", type: "group", label: byName },
  "/api/profiles": { url: "/security/profiles?page_size=500", type: "profile", label: byName },
  "/api/scientific-objects": { url: "/core/scientific_objects?page_size=500", type: "scientific_object", label: byName },
  "/api/variables": { url: "/core/variables?page_size=500", type: "variable", label: byName },
  "/api/germplasm": { url: "/core/germplasm?page_size=500", type: "germplasm", label: byName, parent: (i) => i.species, kind: (i) => germplasmKind(i.rdf_type) },
  // Not a browsable category: the species a new variety/accession is created under (create form).
  "/api/germplasm-species": { url: "/core/germplasm?rdf_type=vocabulary%3ASpecies&page_size=500", type: "germplasm", label: byName },
  "/api/datafiles": { url: "/core/datafiles?page_size=500", type: "data_file", label: (i) => String(i.filename ?? i.uri) },
  "/api/provenances": { url: "/core/provenances?page_size=500", type: "provenance", label: byName },
  "/api/events": { url: "/core/events?page_size=500", type: "event", label: (i) => String(i.description ?? i.rdf_type_name ?? i.uri) },
  "/api/documents": { url: "/core/documents?pageSize=500", type: "document", label: (i) => String(i.title ?? i.uri) },
  "/api/factors": { url: "/core/experiments/factors?page_size=500", type: "factor", label: byName },
  // Not a browsable category: the scientific-object classes (Plant, Plot, Sample, ...) that
  // feed the create form's Type dropdown (CREATABLE.scientific_object.fields).
  // Not a browsable category: the device classes (camera, RGB camera, …) for the create form.
  "/api/device-types": { url: "/ontology/subclasses_of?parent_type=vocabulary%3ADevice&ignoreRootClasses=true", type: "rdf_type", label: byName, rows: flattenClasses },
  // Not browsable categories: the parts a new variable is made of (create form).
  "/api/variable-entities": { url: "/core/entities?page_size=1000", type: "entity", label: byName },
  "/api/variable-characteristics": { url: "/core/characteristics?page_size=1000", type: "characteristic", label: byName },
  "/api/variable-methods": { url: "/core/methods?page_size=1000", type: "method", label: byName },
  "/api/variable-units": { url: "/core/units?page_size=1000", type: "unit", label: byName },
  "/api/scientific-object-types": { url: "/core/scientific_objects/used_types", type: "rdf_type", label: byName },
};

export type Row = { id: string; type: string; label: string; parent?: string; kind?: string };

// One row per OpenSILEX item — shared by the list and search routes so a browsed row and a
// search hit are the same item (same id form). A germplasm's own uri comes back full
// (https://phis.pheno.no/id/...) while its species field is often prefixed (phis:id/...), same as
// the detail pane's chips — so ids and parents are compacted to one form.
export async function toRows(route: ListRoute, items: RawItem[]): Promise<Row[]> {
  const rows: Row[] = items.map((i) => {
    const kind = route.kind?.(i);
    return { id: String(i.uri), type: route.type, label: route.label(i), ...(kind ? { kind } : {}) };
  });
  if (!route.parent) return rows;
  return Promise.all(
    items.map(async (i, n) => {
      const p = route.parent!(i);
      return { ...rows[n], id: await compactUri(String(i.uri)), ...(typeof p === "string" && p ? { parent: await compactUri(p) } : {}) };
    })
  );
}

export const handleList: RouteHandler = async (req, res, { pathname }) => {
  const route = req.method === "GET" ? listRoutes[pathname] : undefined;
  if (!route) return false;

  const raw = (await authedGet(route.url)).result;
  const items = route.rows && Array.isArray(raw) ? route.rows(raw) : raw;
  if (!Array.isArray(items)) throw new Error(`OpenSILEX response for ${req.url} did not contain a result list`);
  // Body is fully built BEFORE writeHead so a bad shape here still lands in the catch block
  // below instead of sending a 200 header and then failing mid-response (which would hang
  // the connection open forever — a real bug this ordering fix caught during testing).
  let rows = await toRows(route, items);
  if (route.parent) {
    // A parent not in the list is dropped: the item then shows at the category level instead of
    // being hidden under nothing.
    const known = new Set(rows.map((r) => r.id));
    rows = rows.map(({ parent, ...r }) => (parent && known.has(parent) ? { ...r, parent } : r));
  }
  const payload = JSON.stringify(rows);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(payload);
  return true;
};
