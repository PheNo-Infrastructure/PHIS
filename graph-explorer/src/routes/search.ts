import { authedGet, escapeRegex } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { listRoutes, toRows, type Row } from "./list.ts";

const PAGE = 20;

// Searched types, in menu order (Trials, Data, Setup, People) -> their list route. Not events,
// data files, documents: their labels are a description, filename, title — not a name.
const SEARCH_TYPES: Record<string, string> = {
  experiment: "/api/experiments", factor: "/api/factors", scientific_object: "/api/scientific-objects", germplasm: "/api/germplasm",
  variable: "/api/variables", provenance: "/api/provenances",
  facility: "/api/facilities", device: "/api/devices", site: "/api/sites",
  organization: "/api/organizations", project: "/api/projects", person: "/api/persons",
  account: "/api/accounts", group: "/api/groups",
};
// These endpoints ignore `name=` and return everything (probed live 2026-10-01), so they are
// fetched whole through their list route and filtered here.
// ponytail: whole-list filter, capped by the list route's page_size=500; fine for these small types.
const FILTER_HERE = new Set(["facility", "site", "organization"]);


export type SearchGroup = { type: string; total: number; items: Row[]; error?: string };

async function searchType(type: string, q: string, page: number): Promise<SearchGroup> {
  const route = listRoutes[SEARCH_TYPES[type]];
  try {
    if (FILTER_HERE.has(type)) {
      const needle = q.toLowerCase();
      const hits = (await toRows(route, (await authedGet(route.url)).result)).filter((r) => r.label.toLowerCase().includes(needle));
      return { type, total: hits.length, items: hits.slice(page * PAGE, (page + 1) * PAGE) };
    }
    const base = route.url.split("?")[0];
    const r = await authedGet(`${base}?name=${encodeURIComponent(escapeRegex(q))}&page_size=${PAGE}&page=${page}`);
    return { type, total: r.metadata?.pagination?.totalCount ?? r.result.length, items: await toRows(route, r.result) };
  } catch (err) {
    // One type failing must not blank the whole search — the page says this type couldn't be searched.
    return { type, total: 0, items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export const handleSearch: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (req.method !== "GET" || pathname !== "/api/search") return false;
  const q = (searchParams.get("q") ?? "").trim();
  const only = searchParams.get("type");
  const page = Math.max(0, Number(searchParams.get("page")) || 0);
  const types = only ? (only in SEARCH_TYPES ? [only] : []) : Object.keys(SEARCH_TYPES);
  const groups = q ? (await Promise.all(types.map((t) => searchType(t, q, page)))).filter((g) => g.total || g.error) : [];
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(groups));
  return true;
};
