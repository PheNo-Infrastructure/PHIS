import { authedGet, authedGetOne, type RawItem } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";

// SPIKE (throwaway): the structure layer as nodes + edges, built from the link fields the list
// endpoints already return. One request per type, no per-node fetches.
const SOURCES: { type: string; url: string; fields: string[] }[] = [
  { type: "organization", url: "/core/organisations", fields: ["parents", "facilities", "sites"] },
  { type: "facility", url: "/core/facilities?page_size=500", fields: ["organizations", "sites"] },
  { type: "site", url: "/core/sites?page_size=500", fields: ["organizations", "facilities"] },
  { type: "project", url: "/core/projects?page_size=500", fields: ["related_projects"] },
  { type: "experiment", url: "/core/experiments?page_size=500", fields: ["facilities", "organisations", "projects"] },
  { type: "device", url: "/core/devices?page_size=500", fields: [] },
];

const refUri = (r: unknown) => (typeof r === "string" ? r : (r as { uri?: string } | null)?.uri);

// The picture is read-only and the device lookup below costs one request per facility, so a recent answer is reused.
let cached: { at: number; body: string } | null = null;
const CACHE_MS = 30_000;
// Which device sits in which facility costs one request per facility and changes rarely, so it is kept longer than the rest (?fresh=all skips it).
let deviceLinks: { at: number; pairs: [string, string][] } | null = null;
const DEVICE_MS = 120_000;

export const handleGraph: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/graph" || req.method !== "GET") return false;
  if (!searchParams.get("fresh") && cached && Date.now() - cached.at < CACHE_MS) { // ?fresh=1 after a change made from the graph
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(cached.body);
    return true;
  }
  const pages = await Promise.all(SOURCES.map((s) => authedGet(s.url)));
  // PHIS leaves the organizations and projects of an experiment out of its list, so each experiment is read in full (a few small requests, kept by the cache below).
  const expAt = SOURCES.findIndex((s) => s.type === "experiment");
  const full = await Promise.all(pages[expAt].result.map((x) => authedGetOne(`/core/experiments/${encodeURIComponent(x.uri)}`).then((r) => r.result).catch(() => ({}))));
  pages[expAt].result = pages[expAt].result.map((x, i) => ({ ...x, ...full[i] }) as RawItem);
  const nodes = new Map<string, { id: string; type: string; label: string; count?: number }>();
  pages.forEach((p, i) => p.result.forEach((it: RawItem) => nodes.set(it.uri, { id: it.uri, type: SOURCES[i].type, label: String(it.name ?? it.uri) })));
  const seen = new Set<string>();
  const edges: { source: string; target: string }[] = [];
  pages.forEach((p, i) => p.result.forEach((it: RawItem) => {
    for (const f of SOURCES[i].fields) {
      const v = it[f];
      for (const r of Array.isArray(v) ? v : v ? [v] : []) {
        const to = refUri(r);
        if (!to || to === it.uri || !nodes.has(to)) continue; // links to things outside the structure layer are left out
        const key = [it.uri, to].sort().join(" ");
        if (!seen.has(key)) { seen.add(key); edges.push({ source: it.uri, target: to }); }
      }
    }
  }));
  // A device's facility is not on the device in the lists; PHIS answers it per facility (a device sits where its last move put it).
  const facilities = pages[SOURCES.findIndex((s) => s.type === "facility")].result;
  if (!deviceLinks || searchParams.get("fresh") === "all" || Date.now() - deviceLinks.at > DEVICE_MS) {
    const located = await Promise.all(facilities.map((f) => authedGet(`/core/devices?facility=${encodeURIComponent(f.uri)}&page_size=500`)));
    deviceLinks = { at: Date.now(), pairs: located.flatMap((r, i) => r.result.map((d: RawItem) => [facilities[i].uri, d.uri] as [string, string])) };
  }
  for (const [f, d] of deviceLinks.pairs) if (nodes.has(d) && nodes.has(f)) edges.push({ source: f, target: d });
  // How many objects an experiment holds, shown as a figure: plants are too many to be nodes.
  const experiments = pages[SOURCES.findIndex((s) => s.type === "experiment")].result;
  const counts = await Promise.all(experiments.map((x) => authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(x.uri)}&page_size=1`)));
  experiments.forEach((x, i) => Object.assign(nodes.get(x.uri)!, { count: counts[i].metadata?.pagination?.totalCount ?? 0 }));
  res.writeHead(200, { "Content-Type": "application/json" });
  const body = JSON.stringify({ nodes: [...nodes.values()], edges });
  cached = { at: Date.now(), body };
  res.end(body);
  return true;
};

