// Serves public/ plus a made-up /api/graph so the graph can be judged at any size in your own browser, without PHIS.
// Run: node --experimental-strip-types scripts/graph-synth.mts [scale=1]   then open http://localhost:4001/graph
// scale 1 is about 680 nodes, 3 about 2000. Organisations own their facilities, devices, experiments, people (a few cross links).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const scale = Number(process.argv[2]) || 1;
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const nodes: { id: string; type: string; label: string; count?: number }[] = [];
const edges: { source: string; target: string }[] = [];
const mk = (type: string, n: number, label: string) => Array.from({ length: n }, (_, i) => {
  const id = `${type}/${i}`;
  nodes.push({ id, type, label: `${label} ${i}`, ...(type === "experiment" ? { count: Math.floor(rnd() * 900) } : type === "species" ? { count: 40 } : {}) });
  return id;
});
const org = mk("organization", 12 * scale, "Org"), fac = mk("facility", 40 * scale, "Facility"), site = mk("site", 25 * scale, "Site"),
  proj = mk("project", 20 * scale, "Project"), exp = mk("experiment", 80 * scale, "Experiment"), dev = mk("device", 300 * scale, "Device"),
  per = mk("person", 80 * scale, "Person"), grp = mk("group", 15 * scale, "Group"), fct = mk("factor", 100 * scale, "Factor"), sp = mk("species", 8, "Species");
const e = (source: string, target: string) => edges.push({ source, target });
const N = org.length, part = (arr: string[], k: number) => arr.filter((_, i) => i % N === k);
org.slice(1).forEach((o, i) => e(o, org[Math.floor(i / 3)]));
org.forEach((o, k) => {
  const F = part(fac, k), S = part(site, k), P = part(proj, k), X = part(exp, k), D = part(dev, k), U = part(per, k), G = part(grp, k), C = part(fct, k);
  F.forEach((f) => e(f, o)); S.forEach((x) => e(x, o));
  D.forEach((d) => { e(d, pick(F)); if (rnd() < .5) e(d, pick(U)); });
  X.forEach((x) => { e(x, pick(F)); e(x, o); e(x, pick(P)); e(x, pick(U)); e(x, pick(sp)); if (rnd() < .5) e(x, pick(G)); });
  C.forEach((f) => e(f, pick(X))); G.forEach((g) => U.slice(0, 6).forEach((u) => e(g, u))); P.forEach((p) => e(p, pick(U)));
  if (rnd() < .3) e(pick(X), pick(part(per, (k + 1) % N)));
});

const root = join(import.meta.dirname, "..", "public");
const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  if (path === "/api/graph") { res.writeHead(200, { "Content-Type": "application/json" }); return void res.end(JSON.stringify({ nodes, edges })); }
  if (path === "/api/instance") { res.writeHead(200, { "Content-Type": "application/json" }); return void res.end('{"test":false}'); }
  const file = normalize(join(root, path === "/graph" ? "graph.html" : path));
  if (!file.startsWith(root)) { res.writeHead(403); return void res.end(); }
  try { const body = await readFile(file); res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(4001, () => console.log(`${nodes.length} nodes, ${edges.length} edges: http://localhost:4001/graph`));
