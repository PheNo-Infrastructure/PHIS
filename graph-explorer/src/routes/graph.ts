import { authedGet, authedGetOne, type RawItem } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";

// The structure layer as nodes + edges, built from the link fields the list endpoints already return (plants and data values are not nodes: there are too many).
// People and groups come from the security endpoints; where an instance lacks one (optional), the graph is simply built without it.
const SOURCES: { type: string; url: string; fields: string[]; optional?: boolean; label?: (it: RawItem) => string }[] = [
  { type: "organization", url: "/core/organisations", fields: ["parents", "facilities", "sites"] },
  { type: "facility", url: "/core/facilities?page_size=500", fields: ["organizations", "sites"] },
  { type: "site", url: "/core/sites?page_size=500", fields: ["organizations", "facilities"] },
  { type: "project", url: "/core/projects?page_size=500", fields: ["related_projects", "coordinators", "scientific_contacts", "administrative_contacts"] },
  { type: "experiment", url: "/core/experiments?page_size=500", fields: ["facilities", "organisations", "projects", "scientific_supervisors", "technical_supervisors", "groups", "factors"] },
  { type: "device", url: "/core/devices?page_size=500", fields: ["person_in_charge"] },
  { type: "person", url: "/security/persons?page_size=500", fields: [], optional: true, label: (it) => [it.first_name, it.last_name].filter(Boolean).join(" ") },
  { type: "group", url: "/security/groups?page_size=500", fields: [], optional: true },
  { type: "factor", url: "/core/experiments/factors?page_size=500", fields: [], optional: true },
];

const refUri = (r: unknown) => (typeof r === "string" ? r : (r as { uri?: string } | null)?.uri);

// The picture is read-only and the device lookup below costs one request per facility, so a recent answer is reused.
let cached: { at: number; body: string } | null = null;
const CACHE_MS = 30_000;
// Which device sits in which facility costs one request per facility and changes rarely, so it is kept longer than the rest and is not dropped by writes (it expires on its own).
let deviceLinks: { at: number; pairs: [string, string][] } | null = null;
const DEVICE_MS = 120_000;

// Called by the server after any change request: the next read rebuilds. A rebuild that started before the change is not kept.
let generation = 0;
export function dropGraphCache() { generation++; cached = null; }

// At most LIMIT requests to PHIS at a time, however many facilities or experiments there are.
const LIMIT = 6;
async function mapLimit<T, R>(items: T[], fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(LIMIT, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

// Concurrent readers share one rebuild.
let inflight: { gen: number; p: Promise<string> } | null = null; // a rebuild that began before a change is not joined by a read that came after it

async function build(): Promise<string> {
  const pages = await Promise.all(SOURCES.map((s) => authedGet(s.url).catch((e) => { if (s.optional) return { result: [], metadata: {} } as unknown as Awaited<ReturnType<typeof authedGet>>; throw e; })));
  // PHIS leaves the organizations and projects of an experiment out of its list, so each experiment is read in full (a few small requests, kept by the cache below).
  const expAt = SOURCES.findIndex((s) => s.type === "experiment");
  const full = await mapLimit(pages[expAt].result, (x) => authedGetOne(`/core/experiments/${encodeURIComponent(x.uri)}`).then((r) => r.result).catch(() => ({})));
  pages[expAt].result = pages[expAt].result.map((x, i) => ({ ...x, ...full[i] }) as RawItem);
  const nodes = new Map<string, { id: string; type: string; label: string; count?: number }>();
  pages.forEach((p, i) => p.result.forEach((it: RawItem) => nodes.set(it.uri, { id: it.uri, type: SOURCES[i].type, label: String(SOURCES[i].label?.(it) || it.name || it.uri) })));
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
  // A group lists accounts, a person has (at most) one: that is how a group links to people.
  const at = (type: string) => pages[SOURCES.findIndex((s) => s.type === type)].result;
  const personOfAccount = new Map<string, string>();
  for (const p of at("person")) { const a = refUri(p.account); if (a) personOfAccount.set(a, p.uri); }
  for (const gr of at("group")) for (const up of (gr.user_profiles as { user_uri?: string }[] | undefined) ?? []) {
    const person = up.user_uri ? personOfAccount.get(up.user_uri) : undefined;
    const key = person ? [gr.uri, person].sort().join(" ") : "";
    if (person && !seen.has(key)) { seen.add(key); edges.push({ source: gr.uri, target: person }); }
  }
  // A device's facility is not on the device in the lists; PHIS answers it per facility (a device sits where its last move put it).
  const facilities = pages[SOURCES.findIndex((s) => s.type === "facility")].result;
  if (!deviceLinks || Date.now() - deviceLinks.at > DEVICE_MS) {
    const located = await mapLimit(facilities, (f) => authedGet(`/core/devices?facility=${encodeURIComponent(f.uri)}&page_size=500`));
    deviceLinks = { at: Date.now(), pairs: located.flatMap((r, i) => r.result.map((d: RawItem) => [facilities[i].uri, d.uri] as [string, string])) };
  }
  for (const [f, d] of deviceLinks.pairs) if (nodes.has(d) && nodes.has(f)) edges.push({ source: f, target: d });
  // How many objects an experiment holds, shown as a figure: plants are too many to be nodes.
  const experiments = pages[SOURCES.findIndex((s) => s.type === "experiment")].result;
  const counts = await mapLimit(experiments, (x) => authedGet(`/core/scientific_objects?experiment=${encodeURIComponent(x.uri)}&page_size=1`));
  experiments.forEach((x, i) => Object.assign(nodes.get(x.uri)!, { count: counts[i].metadata?.pagination?.totalCount ?? 0 }));
  return JSON.stringify({ nodes: [...nodes.values()], edges });
}

export const handleGraph: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/graph" || req.method !== "GET") return false;
  let body: string;
  if (cached && Date.now() - cached.at < CACHE_MS) body = cached.body;
  else {
    const started = generation;
    if (!inflight || inflight.gen !== generation) {
      const p = build();
      inflight = { gen: started, p };
      p.finally(() => { if (inflight?.p === p) inflight = null; }).catch(() => {});
    }
    body = await inflight.p;
    if (started === generation) cached = { at: Date.now(), body };
  }
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
  return true;
};

