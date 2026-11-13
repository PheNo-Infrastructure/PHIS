// Self-audit of the graph page's legend and layout: a seeded random sequence of legend actions against the real graph
// (read-only: /api/graph is a GET), and after each action, once the view is still, a set of checks.
// Run (server not needed, one is started on a free port; needs .env for PHIS):
//   node --experimental-strip-types --env-file=.env scripts/graph-audit.ts [seeds=8] [steps=14] [firstSeed=1] [shotDir]
// Prints one line per finding (seed, step, action, what) and exits 1 if there is any. With shotDir it also saves a screenshot of every finding.
import { createServer } from "node:http";
import { chromium } from "playwright";
import { handleRequest } from "../src/index.ts";

const [seeds = "8", steps = "14", first = "1", shotDir = ""] = process.argv.slice(2);
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const server = createServer(handleRequest);
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as any).port;
const browser = await chromium.launch();
const findings: string[] = [];

const settled = (page: any) => page.evaluate(() => new Promise<void>((resolve) => {
  const G = (window as any).__graph; let last = "", calm = 0, ticks = 0;
  const tick = () => {
    const c = G.sigma.getCamera().getState(), now = [c.x, c.y, c.ratio].map((v: number) => v.toFixed(4)).join() + "|" + G.g.nodes().map((n: string) => G.g.getNodeAttribute(n, "x").toFixed(3) + G.g.getNodeAttribute(n, "y").toFixed(3)).join();
    calm = now === last ? calm + 1 : 0; last = now; ticks++; calm >= 15 || ticks > 900 ? resolve() : requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

// What is shown on screen: the nodes Sigma draws.
const measure = (page: any) => page.evaluate(() => {
  const G = (window as any).__graph, box = document.getElementById("terr")!.getBoundingClientRect();
  const pxPerUnit = Math.abs(G.sigma.graphToViewport({ x: 1, y: 0 }).x - G.sigma.graphToViewport({ x: 0, y: 0 }).x); // pixels per graph unit now; a node's radius is size * K graph units
  const pts: { id: string; x: number; y: number; r: number }[] = []; let nan = 0;
  G.g.forEachNode((id: string, a: any) => {
    if (!isFinite(a.x) || !isFinite(a.y)) nan++;
    const d = G.sigma.getNodeDisplayData(id); if (!d || d.hidden) return; // what Sigma draws (a type that is off, a collapsed cluster and a hidden node are not)
    const v = G.sigma.graphToViewport(a); pts.push({ id, x: v.x, y: v.y, r: a.size * G.K() * pxPerUnit });
  });
  const inView = pts.filter((p) => p.x >= 0 && p.y >= 0 && p.x <= box.width && p.y <= box.height).length;
  // overlap: two shown nodes whose dots sit on each other (centres closer than 0.8 of their drawn radii together)
  const cell = new Map<string, typeof pts>(); let overlaps = 0;
  for (const p of pts) { const k = `${Math.floor(p.x / 12)},${Math.floor(p.y / 12)}`; (cell.get(k) ?? cell.set(k, []).get(k)!).push(p); }
  for (const p of pts) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of cell.get(`${Math.floor(p.x / 12) + dx},${Math.floor(p.y / 12) + dy}`) ?? []) if (q.id > p.id && Math.hypot(p.x - q.x, p.y - q.y) < 0.8 * (p.r + q.r)) overlaps++;
  return { shown: pts.length, inView, nan, overlaps, cat: !!G.cat() };
});

for (let s = +first; s < +first + +seeds; s++) {
  const rand = rng(s * 7919), pick = <T,>(l: T[]) => l[Math.floor(rand() * l.length)];
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 860 } })).newPage();
  const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:${port}/graph`);
  await page.waitForFunction(() => (window as any).__graph?.g.order > 0, null, { timeout: 60000 });
  await settled(page);
  const types: string[] = await page.locator("#legend button[data-t]:not([data-t='*'])").evaluateAll((l: any[]) => l.map((e) => e.dataset.t));
  const groups: string[] = await page.locator("#legend button[data-g]").evaluateAll((l: any[]) => l.map((e) => e.dataset.g));
  for (let i = 1; i <= +steps; i++) {
    const roll = rand(), target = roll < .15 ? "all" : roll < .45 ? "group" : "type", mod = pick(["plain", "plain", "right", "ctrl"]);
    const sel = target === "all" ? '#legend button[data-t="*"]' : target === "group" ? `#legend button[data-g="${pick(groups)}"]` : `#legend button[data-t="${pick(types)}"]`;
    const desc = `${mod} ${await page.locator(sel).first().innerText().then((t: string) => t.split("\n")[0]).catch(() => sel)}`;
    const el = page.locator(sel).first(); if (!(await el.isVisible().catch(() => false))) continue;
    await el.click({ button: mod === "right" ? "right" : "left", modifiers: mod === "ctrl" ? ["Control"] : [] });
    await settled(page);
    const m = await measure(page), bad: string[] = [];
    if (m.nan) bad.push(`${m.nan} nodes with NaN position`);
    if (!m.cat && m.shown > 3 && m.inView / m.shown < 0.9) bad.push(`only ${Math.round(100 * m.inView / m.shown)}% of ${m.shown} shown nodes are in view`);
    if (!m.cat && m.shown > 1 && m.overlaps > Math.max(3, m.shown * 0.02)) bad.push(`${m.overlaps} node dots on top of each other (of ${m.shown})`);
    if (errors.length) bad.push(`page errors: ${errors.splice(0).join(" | ")}`);
    for (const b of bad) {
      const line = `seed ${s} step ${i} [${desc}]: ${b}`; findings.push(line); console.log(line);
      if (shotDir) await page.screenshot({ path: `${shotDir}/audit-s${s}-i${i}.png` });
    }
  }
  await page.context().close();
}
await browser.close(); server.close();
console.log(findings.length ? `${findings.length} finding(s)` : "no findings");
process.exit(findings.length ? 1 : 0);
