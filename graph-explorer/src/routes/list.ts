import { authedGet, type RawItem } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";

const byName = (i: RawItem) => String(i.name ?? i.uri);

type ListRoute = { url: string; type: string; label: (i: RawItem) => string };

// Every browsable OpenSILEX list wired here. `label` picks whichever field
// that entity type actually uses for a human-readable name — most use
// `name`, but persons, datafiles, events and documents don't.
const listRoutes: Record<string, ListRoute> = {
  "/api/organizations": { url: "/core/organisations", type: "organization", label: byName },
  "/api/experiments": { url: "/core/experiments?page_size=500", type: "experiment", label: byName },
  "/api/projects": { url: "/core/projects?page_size=500", type: "project", label: byName },
  "/api/facilities": { url: "/core/facilities?page_size=500", type: "facility", label: byName },
  "/api/devices": { url: "/core/devices?page_size=500", type: "device", label: byName },
  "/api/sites": { url: "/core/sites?page_size=500", type: "site", label: byName },
  "/api/persons": {
    url: "/security/persons?page_size=500",
    type: "person",
    label: (i) => `${String(i.first_name ?? "")} ${String(i.last_name ?? "")}`.trim() || String(i.email ?? i.uri),
  },
  "/api/scientific-objects": { url: "/core/scientific_objects?page_size=500", type: "scientific_object", label: byName },
  "/api/variables": { url: "/core/variables?page_size=500", type: "variable", label: byName },
  "/api/germplasm": { url: "/core/germplasm?page_size=500", type: "germplasm", label: byName },
  "/api/datafiles": { url: "/core/datafiles?page_size=500", type: "data_file", label: (i) => String(i.filename ?? i.uri) },
  "/api/provenances": { url: "/core/provenances?page_size=500", type: "provenance", label: byName },
  "/api/events": { url: "/core/events?page_size=500", type: "event", label: (i) => String(i.description ?? i.rdf_type_name ?? i.uri) },
  "/api/documents": { url: "/core/documents?pageSize=500", type: "document", label: (i) => String(i.title ?? i.uri) },
  "/api/factors": { url: "/core/experiments/factors?page_size=500", type: "factor", label: byName },
  // Not a browsable category: the scientific-object classes (Plant, Plot, Sample, ...) that
  // feed the create form's Type dropdown (CREATABLE.scientific_object.fields).
  "/api/scientific-object-types": { url: "/core/scientific_objects/used_types", type: "rdf_type", label: byName },
};

export const handleList: RouteHandler = async (req, res, { pathname }) => {
  const route = req.method === "GET" ? listRoutes[pathname] : undefined;
  if (!route) return false;

  const items = (await authedGet(route.url)).result;
  if (!Array.isArray(items)) throw new Error(`OpenSILEX response for ${req.url} did not contain a result list`);
  // Body is fully built BEFORE writeHead so a bad shape here still lands in the catch block
  // below instead of sending a 200 header and then failing mid-response (which would hang
  // the connection open forever — a real bug this ordering fix caught during testing).
  const payload = JSON.stringify(items.map((i) => ({ id: String(i.uri), type: route.type, label: route.label(i) })));
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(payload);
  return true;
};
