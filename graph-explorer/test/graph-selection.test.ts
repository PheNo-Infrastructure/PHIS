import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium, type Page } from "playwright";
import { handleRequest } from "../src/index.ts";

// The graph page on its own (not inside Browse): how a selection is built and shown. A small plain graph (48 nodes, below the
// size where it is clustered), real mouse and keyboard input where it matters, waits for the view to be still, never fixed sleeps.

let sharedBrowser: Promise<import("playwright").Browser> | null = null;
after(async () => { if (sharedBrowser) await (await sharedBrowser).close(); });

function stubGraph() {
  const nodes: { id: string; type: string; label: string }[] = [], edges: { source: string; target: string }[] = [];
  const add = (type: string, n: number, label: string) => Array.from({ length: n }, (_, i) => { const id = `${type}-${i}`; nodes.push({ id, type, label: `${label} ${i}` }); return id; });
  const org = add("organization", 3, "Org"), exp = add("experiment", 9, "Experiment"), fac = add("facility", 6, "Facility"), site = add("site", 6, "Site"), dev = add("device", 18, "Device"), per = add("person", 6, "Person");
  const link = (source: string, target: string) => edges.push({ source, target });
  exp.forEach((e, i) => { link(e, org[i % 3]); link(e, fac[i % 6]); });
  fac.forEach((f, i) => link(f, org[i % 3]));
  site.forEach((s, i) => link(s, org[i % 3]));
  dev.forEach((d, i) => link(d, fac[i % 6]));
  per.forEach((p, i) => { link(p, org[i % 3]); link(p, exp[i]); });
  return { nodes, edges };
}

async function withGraph(fn: (page: Page) => Promise<void>, viewport = { width: 1400, height: 860 }, query = "") {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address(), port = typeof address === "object" && address ? address.port : 0;
  const browser = await (sharedBrowser ??= chromium.launch());
  const context = await browser.newContext({ viewport }), page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/graph", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(stubGraph()) }));
  await page.route("**/api/instance", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"test":false}' }));
  try {
    await page.goto(`http://localhost:${port}/graph${query}`);
    await page.waitForFunction(() => (window as any).__graph?.g.order > 0);
    await settled(page);
    await fn(page);
    assert.deepEqual(errors, [], "expected no console or page errors");
  } finally {
    await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

// Resolves once the camera and every node have stood still for a while (a selection animates for about half a second).
const settled = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => {
  const G = (window as any).__graph; let last = "", calm = 0;
  const tick = () => {
    const c = G.sigma.getCamera().getState(), now = [c.x, c.y, c.ratio].map((v: number) => v.toFixed(4)).join() + "|" + G.g.nodes().map((n: string) => G.g.getNodeAttribute(n, "x").toFixed(3) + G.g.getNodeAttribute(n, "y").toFixed(3)).join();
    calm = now === last ? calm + 1 : 0; last = now; calm >= 12 ? resolve() : requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));
const places = (page: Page) => page.evaluate(() => { const G = (window as any).__graph, o: Record<string, number[]> = {}; G.g.forEachNode((id: string, a: any) => { o[id] = [a.x, a.y]; }); return o; });
const sameAs = (a: Record<string, number[]>, b: Record<string, number[]>) => Object.keys(a).every((id) => Math.hypot(a[id][0] - b[id][0], a[id][1] - b[id][1]) < 1e-3);
const xy = (page: Page, id: string) => page.evaluate((i) => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), v = G.sigma.graphToViewport(G.g.getNodeAttributes(i)); return { x: v.x + r.left, y: v.y + r.top }; }, id);
const selected = (page: Page) => page.evaluate(() => [...(window as any).__graph.sel].sort() as string[]);
const sameCamera = (a: { x: number; y: number; ratio: number }, b: { x: number; y: number; ratio: number }) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.ratio - b.ratio) < 1e-6;
const camera = (page: Page) => page.evaluate(() => { const c = (window as any).__graph.sigma.getCamera().getState(); return { x: c.x, y: c.y, ratio: c.ratio }; });
const hitCentre = (page: Page, act: "add" | "remove", kind: string) => page.evaluate(([a, k]) => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), h = G.catHits().find((P: any) => P.act === a && P.sec.kind === k); return h ? { x: (h.x0 + h.x1) / 2 + r.left, y: (h.y0 + h.y1) / 2 + r.top, n: h.sec.n as number } : null; }, [act, kind]);
async function drag(page: Page, x0: number, y0: number, x1: number, y1: number, key?: "Control" | "Alt") {
  if (key) await page.keyboard.down(key);
  await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 6 }); await page.mouse.up();
  if (key) await page.keyboard.up(key);
}
async function ctrlClick(page: Page, x: number, y: number) { await page.keyboard.down("Control"); await page.mouse.click(x, y); await page.keyboard.up("Control"); }
// A spot on the canvas with no node near it, searched outward from (x, y): a drag has to start on empty space.
const emptyNear = (page: Page, x: number, y: number) => page.evaluate(([x0, y0]) => {
  const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), pts: number[][] = [];
  G.g.forEachNode((id: string, a: any) => { const v = G.sigma.graphToViewport(a); pts.push([v.x + r.left, v.y + r.top]); });
  for (let d = 0; d < 400; d += 10) for (let k = 0; k < 16; k++) {
    const x = x0 + Math.cos(k * Math.PI / 8) * d, y = y0 + Math.sin(k * Math.PI / 8) * d;
    if (x > r.left + 8 && y > r.top + 60 && x < r.right - 8 && y < r.bottom - 40 && pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > 40)) return { x, y };
  }
  throw new Error("no empty spot");
}, [x, y]);
const inRect = (page: Page, x0: number, y0: number, x1: number, y1: number) => page.evaluate(([a, b, c, d]) => {
  const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), out: string[] = [];
  G.g.forEachNode((id: string, at: any) => { const v = G.sigma.graphToViewport(at), x = v.x + r.left, y = v.y + r.top; if (x >= Math.min(a, c) && x <= Math.max(a, c) && y >= Math.min(b, d) && y <= Math.max(b, d)) out.push(id); });
  return out.sort();
}, [x0, y0, x1, y1]);
const shown = (page: Page) => page.evaluate(() => { const G = (window as any).__graph, k: Record<string, number> = {}; G.g.forEachNode((id: string, a: any) => { const d = G.sigma.getNodeDisplayData(id); if (d && !d.hidden) k[a.kind] = (k[a.kind] || 0) + 1; }); return k; });
const faState = (page: Page) => page.evaluate(() => { const live = document.getElementById("live") as HTMLInputElement, lab = live.closest("label") as HTMLElement; return { visible: getComputedStyle(lab).display !== "none", disabled: live.disabled }; });
const union = (a: string[], b: string[]) => [...new Set([...a, ...b])].sort();

test("e2e: graph selection: Ctrl+click marks in place (nothing moves, what an inspect pushed aside returns) and Focus selection gathers on demand", async () => {
  await withGraph(async (page) => {
    const home = await places(page);
    const o = await xy(page, "organization-0");
    await page.mouse.click(o.x, o.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"]);
    assert.equal(sameAs(home, await places(page)), false, "a plain click inspects: the view is reorganised around the node");
    const e = await xy(page, "experiment-0"); // linked to organization-0, so it is in the inspect view
    await ctrlClick(page, e.x, e.y); await settled(page);
    assert.deepEqual(await selected(page), ["experiment-0", "organization-0"]);
    assert.equal(sameAs(home, await places(page)), true, "marking in place: every node is back where it was");
    assert.equal(await page.locator("#focusbtn").isVisible(), true, "the way back to the gathered view is offered");
    assert.equal(await page.locator("#focusbtn").innerText(), "Focus selection");
    await page.locator("#focusbtn").click(); await settled(page);
    assert.equal(sameAs(home, await places(page)), false, "Focus selection gathers it again");
    assert.equal(await page.locator("#focusbtn").innerText(), "Show in place", "and the same button takes it back");
    await page.locator("#focusbtn").click(); await settled(page);
    assert.equal(sameAs(home, await places(page)), true, "Show in place: every node is back where it was, the selection stays marked");
    assert.deepEqual(await selected(page), ["experiment-0", "organization-0"]);
    assert.equal(await page.locator("#focusbtn").innerText(), "Focus selection");
    await page.locator("#focusbtn").click(); await settled(page);
    await page.evaluate(() => (window as any).__graph.setSelection([], "replace")); await settled(page);
    assert.equal(sameAs(home, await places(page)), true, "clearing puts every node back");
  });
});

test("e2e: graph selection: a box replaces the selection, Ctrl+drag adds, Alt+drag removes, and none of them moves a node", async () => {
  await withGraph(async (page) => {
    const home = await places(page), r = await page.evaluate(() => { const b = document.getElementById("terr")!.getBoundingClientRect(); return { l: b.left, t: b.top, w: b.width, h: b.height }; });
    const cx = r.l + r.w / 2, cy = r.t + r.h / 2;
    const a0 = await emptyNear(page, r.l + 20, r.t + 70), b0 = await emptyNear(page, r.l + r.w - 60, r.t + r.h - 60);
    const A = await inRect(page, a0.x, a0.y, cx, cy), B = await inRect(page, b0.x, b0.y, cx, cy);
    assert.ok(A.length > 0 && B.length > 0, "both boxes hold nodes");
    await drag(page, a0.x, a0.y, cx, cy); await settled(page);
    assert.deepEqual(await selected(page), A, "a plain box replaces the selection with what is inside");
    await drag(page, b0.x, b0.y, cx, cy, "Control"); await settled(page);
    assert.deepEqual(await selected(page), union(A, B), "Ctrl+drag adds");
    await drag(page, a0.x, a0.y, cx, cy, "Alt"); await settled(page);
    assert.deepEqual(await selected(page), union(A, B).filter((id) => !A.includes(id)), "Alt+drag removes what is inside");
    assert.equal(sameAs(home, await places(page)), true, "a box marks in place: no node moved");
    await drag(page, b0.x, b0.y, cx, cy); await settled(page);
    assert.deepEqual(await selected(page), B, "a plain box replaces again");
  });
});

test("e2e: graph selection: legend chips mean what was clicked, keep the selection, and the selected nodes stay shown", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    const chip = (t: string) => page.locator(`#legend button[data-t="${t}"]`);
    await chip("experiment").click({ modifiers: ["Control"] }); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"], "the selection is kept");
    assert.deepEqual(await shown(page), { organization: 1, experiment: 9 }, "only experiments, and the selected organization stays shown whatever its type");
    assert.deepEqual(await page.locator("#legend .chip.sel").evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.t)), ["experiment"], "the chip says only what was clicked");
    await chip("organization").click({ modifiers: ["Control"] }); await settled(page);
    assert.deepEqual(await shown(page), { organization: 3, experiment: 9 }, "adding the organization chip shows every organization too");
    await chip("organization").click({ modifiers: ["Control"] }); await chip("experiment").click({ modifiers: ["Control"] }); await settled(page);
    assert.equal(Object.keys(await shown(page)).length, 6, "both chips off: every type is shown again");
  });
});

test("e2e: graph selection: in a legend grid Ctrl+click on a node adds to the selection and the grid stays; a plain click leaves it", async () => {
  await withGraph(async (page) => {
    await page.locator('#legend button[data-t="organization"]').click({ modifiers: ["Control"] }); await settled(page);
    const grid = () => page.evaluate(() => (window as any).__graph.cat()?.kinds ?? null);
    assert.deepEqual(await grid(), ["organization"]);
    const a = await xy(page, "organization-0"); await ctrlClick(page, a.x, a.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"]);
    assert.deepEqual(await grid(), ["organization"], "Ctrl+click keeps the grid");
    assert.deepEqual(await page.locator("#legend .chip.sel").evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.t)), ["organization"], "and the chip stays lit");
    await page.locator('#legend button[data-t="experiment"]').click({ modifiers: ["Control"] }); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"], "a chip keeps the selection");
    assert.deepEqual(await grid(), ["organization", "experiment"]);
    const b = await xy(page, "organization-1"); await page.mouse.click(b.x, b.y); await settled(page);
    assert.equal(await grid(), null, "a plain click leaves the grid");
    assert.deepEqual(await selected(page), ["organization-1"]);
  });
});

test("e2e: graph selection: the selection view arranges the grids, Esc and the button leave it, and every node ends up where it was", async () => {
  await withGraph(async (page) => {
    const home = await places(page);
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0", "organization-1"], "replace")); await settled(page);
    const bands = () => page.evaluate(() => (window as any).__graph.catHits().filter((P: any) => P.band).map((P: any) => P.band.text.split(" ")[0]));
    assert.deepEqual(await bands(), [], "selecting alone does not open the selection view");
    await page.locator("#selview").click(); await settled(page);
    assert.deepEqual(await bands(), ["Selected", "Connected", "Could", "Can't"]);
    assert.equal(await page.locator("#keys").innerText().then((t) => /Select all/.test(t)), true, "the controls of this view are written on screen");
    await page.keyboard.press("Escape"); await settled(page);
    assert.deepEqual(await bands(), []);
    await page.locator("#selview").click(); await settled(page);
    assert.equal(await page.locator("#selview").innerText(), "Leave selection view");
    await page.locator("#selview").click(); await settled(page);
    assert.deepEqual(await bands(), []);
    await page.evaluate(() => (window as any).__graph.setSelection([], "replace")); await settled(page);
    assert.equal(sameAs(home, await places(page)), true, "after selecting, entering, leaving and clearing, every node is back");
  });
});

test("e2e: graph selection: in the selection view a click toggles a node, Select all and Clear act on a section, and a name search narrows the grids", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const e = await xy(page, "experiment-0");
    await page.mouse.click(e.x, e.y); await settled(page);
    assert.deepEqual(await selected(page), ["experiment-0", "organization-0"], "a click on a connected node adds it");
    const e2 = await xy(page, "experiment-0"); await page.mouse.click(e2.x, e2.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"], "and removes it again");
    const all = await hitCentre(page, "add", "experiment");
    assert.ok(all, "the connected experiments have a Select all");
    await page.mouse.click(all.x, all.y); await settled(page);
    assert.equal((await selected(page)).length, 1 + all.n, "Select all takes the whole section");
    const clear = await hitCentre(page, "remove", "experiment");
    assert.ok(clear, "the selected experiments have a Clear");
    await page.mouse.click(clear.x, clear.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"], "Clear takes the whole section out");
    const empty = await emptyNear(page, 700, 500); await page.mouse.click(empty.x, empty.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"], "a click on empty space does not clear what you built");
    await page.locator("#selsearch").fill("Device 1");
    await page.waitForFunction(() => /Select \d+ match/.test(document.getElementById("selmatch")!.textContent!)); await settled(page);
    const n = Number((await page.locator("#selmatch").innerText()).match(/\d+/)![0]);
    assert.equal(n, 9, "Device 1 and Device 10-17 match");
    await page.locator("#selmatch").click(); await settled(page);
    assert.equal((await selected(page)).length, 1 + n, "Select matches adds them");
    await page.locator("#selview").click(); await settled(page);
    assert.equal(await page.locator("#selsearch").inputValue(), "", "leaving clears the search");
  });
});

test("e2e: graph selection: Reset layout is greyed in the selection view and in a grid, and works again outside them", async () => {
  await withGraph(async (page) => {
    const reset = page.locator("#reset");
    assert.equal(await reset.isDisabled(), false);
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    assert.equal(await reset.isDisabled(), true, "greyed in the selection view");
    await page.keyboard.press("Escape"); await settled(page);
    assert.equal(await reset.isDisabled(), false, "back after leaving it");
    await page.evaluate(() => (window as any).__graph.setSelection([], "replace")); await settled(page);
  });
});

test("e2e: graph selection: after a link two nodes that ended up on top of each other are moved apart", async () => {
  await withGraph(async (page) => {
    const gap = () => page.evaluate(() => { const G = (window as any).__graph, a = G.g.getNodeAttributes("facility-1"), b = G.g.getNodeAttributes("organization-2"); const va = G.sigma.graphToViewport(a), vb = G.sigma.graphToViewport(b); const r = (id: string) => G.sigma.scaleSize(G.sigma.getNodeDisplayData(id).size); return Math.hypot(va.x - vb.x, va.y - vb.y) - (r("facility-1") + r("organization-2")); });
    await page.evaluate(() => { const G = (window as any).__graph, a = G.g.getNodeAttributes("facility-1"); G.g.mergeNodeAttributes("organization-2", { x: a.x, y: a.y }); G.sigma.refresh(); });
    assert.ok(await gap() < -5, "they start on top of each other");
    await page.evaluate(() => (window as any).__graph.commitLocal("link", [{ id: "facility-1", type: "facility", label: "F" }, { id: "organization-2", type: "organization", label: "O" }]));
    await page.waitForTimeout(3000); await settled(page);
    assert.ok(await gap() >= -1, "after the link they no longer overlap (gap " + Math.round(await gap()) + "px)");
  });
});

test("e2e: graph selection: what is not connected is split into Could be linked and Can't be linked; the second is folded until its header is clicked", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const info = () => page.evaluate(() => { const G = (window as any).__graph, H = G.catHits().filter((P: any) => P.band).map((P: any) => P.band); const shownOf = (kind: string) => G.g.nodes().filter((id: string) => id.startsWith(kind + "-") && !G.sigma.getNodeDisplayData(id)?.hidden).length; return { bands: H.map((b: any) => b.text + ":" + b.n), device: shownOf("device"), person: shownOf("person"), site: shownOf("site") }; });
    const a = await info();
    assert.ok(a.bands.some((b: string) => /^Could be linked:/.test(b)), "a band of what could be linked");
    assert.ok(a.bands.some((b: string) => /^Can't be linked:/.test(b)), "and one of what cannot");
    assert.equal(a.device, 0, "folded: devices (an organization cannot be linked to them) are not drawn");
    assert.ok(a.site > 0, "sites could be linked and are drawn");
    const hit = await page.evaluate(() => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), P = G.catHits().find((P: any) => P.band && P.band.toggle); return P ? { x: (P.x0 + P.x1) / 2 + r.left, y: (P.y0 + P.y1) / 2 + r.top } : null; });
    assert.ok(hit, "the folded band has a header to click");
    // scroll to it, then open it
    await page.evaluate(() => { const G = (window as any).__graph, c = G.sigma.getCamera(); c.animate({ y: c.getState().y - 0.0 }, { duration: 1 }); });
    await page.mouse.move(500, 400); for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 300); await settled(page);
    const hit2 = await page.evaluate(() => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), P = G.catHits().find((P: any) => P.band && P.band.toggle); return P ? { x: (P.x0 + P.x1) / 2 + r.left, y: (P.y0 + P.y1) / 2 + r.top } : null; });
    assert.ok(hit2, "the header can be scrolled to");
    await page.mouse.click(hit2.x, hit2.y); await page.waitForTimeout(1500);
    assert.ok((await info()).device > 0, "opened: the devices are drawn");
  }, { width: 1400, height: 700 });
});

test("e2e: graph selection: hovering a node in a legend grid draws only links between the grid's own nodes (nothing runs off to the rest of the graph)", async () => {
  await withGraph(async (page) => {
    await page.locator('#legend button[data-t="organization"]').click({ modifiers: ["Control"] }); await settled(page);
    assert.notEqual(await page.evaluate(() => (window as any).__graph.cat()), null, "a grid is open");
    const o = await xy(page, "organization-0"); await page.mouse.move(o.x, o.y); await page.waitForTimeout(400);
    const hidden = (a: string, b: string) => page.evaluate(([x, y]) => { const G = (window as any).__graph, e = G.g.edge(x, y) ?? G.g.edge(y, x); return e ? !!G.sigma.getEdgeDisplayData(e)?.hidden : null; }, [a, b]);
    assert.equal(await hidden("organization-0", "facility-0"), true, "a link to a facility, which is not in the grid, is not drawn");
    assert.equal(await hidden("organization-0", "experiment-0"), true, "nor one to an experiment");
  });
});

test("e2e: graph selection: from a legend grid the selection view can be opened, and leaving it returns to the same grid", async () => {
  await withGraph(async (page) => {
    await page.locator('#legend button[data-t="organization"]').click({ modifiers: ["Control"] }); await settled(page);
    await page.locator('#legend button[data-t="facility"]').click({ modifiers: ["Control"] }); await settled(page);
    const kinds = () => page.evaluate(() => (window as any).__graph.cat()?.kinds ?? null);
    assert.deepEqual(await kinds(), ["organization", "facility"]);
    assert.equal(await page.locator("#selview").isVisible(), false, "nothing selected: no selection view yet");
    const o = await xy(page, "organization-0"); await ctrlClick(page, o.x, o.y); await settled(page);
    assert.deepEqual(await selected(page), ["organization-0"]);
    assert.equal(await page.locator("#selview").isVisible(), true, "the selection view is offered in a grid");
    await page.locator("#selview").click(); await page.waitForTimeout(1500); await settled(page);
    assert.equal(await kinds(), null, "the grid is left");
    assert.equal(await page.evaluate(() => (window as any).__graph.catHits().filter((P: any) => P.band).length), 4, "the selection is arranged in bands");
    assert.equal(await page.locator("#selview").innerText(), "Back to the grid");
    await page.locator("#selview").click(); await page.waitForTimeout(1500); await settled(page);
    assert.deepEqual(await kinds(), ["organization", "facility"], "the same grid is back");
    assert.deepEqual(await selected(page), ["organization-0"], "with the selection kept");
  });
});

test("e2e: graph selection: hiding and showing a type again and again with a selection does not change the scale of the graph", async () => {
  await withGraph(async (page) => {
    const stat = () => page.evaluate(() => { const G = (window as any).__graph; let mx = 0, x0 = 1e9, x1 = -1e9; G.g.forEachNode((id: string, a: any) => { mx = Math.max(mx, a.size); x0 = Math.min(x0, a.x); x1 = Math.max(x1, a.x); }); return { K: G.K() as number, width: x1 - x0, maxSize: mx }; });
    await page.evaluate(() => (window as any).__graph.setSelection(["facility-0", "facility-1", "experiment-2"], "replace")); await settled(page);
    const first = await stat();
    for (let i = 0; i < 14; i++) { await page.locator('#legend button[data-t="organization"]').click(); await page.waitForTimeout(120); }
    await settled(page);
    const last = await stat();
    assert.ok(Math.abs(last.K / first.K - 1) < .1, `the scale K stays (${first.K.toFixed(3)} -> ${last.K.toFixed(3)})`);
    assert.ok(Math.abs(last.width / first.width - 1) < .1, `and so does the spread of the layout (${first.width.toFixed(0)} -> ${last.width.toFixed(0)})`);
    assert.ok(Math.abs(last.maxSize - first.maxSize) < .01, "and the node sizes");
  });
});

test("e2e: graph selection: ForceAtlas is available in the overview, greyed while something is selected, and hidden in a grid and in the selection view", async () => {
  await withGraph(async (page) => {
    assert.deepEqual(await faState(page), { visible: true, disabled: false });
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    assert.deepEqual(await faState(page), { visible: true, disabled: true }, "greyed while something is selected");
    await page.locator("#selview").click(); await settled(page);
    assert.equal((await faState(page)).visible, false, "hidden in the selection view");
    await page.keyboard.press("Escape"); await page.evaluate(() => (window as any).__graph.setSelection([], "replace")); await settled(page);
    assert.deepEqual(await faState(page), { visible: true, disabled: false });
    await page.locator('#legend button[data-t="organization"]').click({ modifiers: ["Control"] }); await settled(page);
    assert.equal((await faState(page)).visible, false, "hidden in a grid");
  });
});

test("e2e: graph selection: hiding or showing a type rescales the sizes among what is shown, restores them exactly, and settles the layout briefly", async () => {
  await withGraph(async (page) => {
    const sizes = () => page.evaluate(() => { const G = (window as any).__graph, o: Record<string, number> = {}; G.g.forEachNode((id: string, a: any) => { o[id] = a.size; }); return o; });
    const before = await sizes();
    await page.locator('#legend button[data-t="device"]').click();
    await page.waitForFunction(() => (window as any).__graph.physics().liveOn);
    const hidden = await sizes();
    assert.ok(before["facility-0"] > hidden["facility-0"], "a facility linked to hidden devices shrinks");
    await page.waitForFunction(() => !(window as any).__graph.physics().liveOn, null, { timeout: 8000 });
    await page.locator('#legend button[data-t="device"]').click();
    await page.waitForFunction(() => (window as any).__graph.physics().liveOn);
    assert.deepEqual(await sizes(), before, "showing the type again gives the same sizes");
  });
});

test("e2e: graph selection: in the selection view the wheel scrolls (y only, no zoom) and stops at the ends, and a right-drag does not pan", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const c0 = await camera(page);
    await page.mouse.move(500, 400);
    await page.mouse.wheel(0, -400); await settled(page);
    assert.ok(sameCamera(await camera(page), c0), "already at the top: nothing moves");
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 300);
    await settled(page);
    const down = await camera(page);
    assert.ok(down.y < c0.y - 1e-4, "scrolled down (the camera's y decreased)");
    assert.ok(Math.abs(down.x - c0.x) < 1e-9 && Math.abs(down.ratio - c0.ratio) < 1e-9, "only y changed: no sideways drift, no zoom");
    await page.mouse.wheel(0, 3000); await settled(page);
    assert.ok(Math.abs((await camera(page)).y - down.y) < 1e-9, "the bottom stops it");
    const gap = await page.evaluate(() => { const G = (window as any).__graph, k = document.getElementById("keys")!.getBoundingClientRect(), r = document.getElementById("terr")!.getBoundingClientRect(); let low = -1e9; G.g.forEachNode((id: string, a: any) => { if (G.sigma.getNodeDisplayData(id)?.hidden) return; low = Math.max(low, G.sigma.graphToViewport(a).y + r.top); }); return k.top - low; });
    assert.ok(gap > 20, "at the bottom the last row ends above the controls line (gap " + Math.round(gap) + ")");
    await page.mouse.move(500, 400); await page.mouse.down({ button: "right" }); await page.mouse.move(300, 250, { steps: 6 }); await page.mouse.up({ button: "right" }); await settled(page);
    assert.ok(sameCamera(await camera(page), down), "a right-drag does not pan the selection view");
    for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -300);
    await settled(page);
    assert.ok(Math.abs((await camera(page)).y - c0.y) < 1e-3, "scrolling back up returns to the top");
  }, { width: 1100, height: 520 });
});

// What Browse sends when a resource is opened there (a search result, say): its id as `current`.
test("e2e: graph selection: a section opened from the selection view cannot be zoomed or panned (wheel, double-click, right-drag)", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const pill = await page.evaluate(() => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), h = G.catHits().filter((P: any) => P.sec && !P.act && !P.band).sort((a: any, b: any) => a.sec.n - b.sec.n)[0]; return h ? { x: (h.x0 + h.x1) / 2 + r.left, y: (h.y0 + h.y1) / 2 + r.top } : null; });
    assert.ok(pill, "a section has a pill to open it");
    await page.mouse.click(pill.x, pill.y); await page.waitForTimeout(1500);
    assert.ok(await page.evaluate(() => /›/.test(document.getElementById("crumbs")?.innerText ?? "") ), "the section is open (a breadcrumb leads back)");
    const c0 = await camera(page);
    await page.mouse.move(500, 400);
    await page.mouse.wheel(0, -600); await page.mouse.wheel(0, 900);
    await page.mouse.dblclick(1380, 800); // empty space (a double-click on a node opens its page)
    await page.mouse.down({ button: "right" }); await page.mouse.move(300, 250, { steps: 6 }); await page.mouse.up({ button: "right" });
    await page.waitForTimeout(800);
    assert.ok(sameCamera(await camera(page), c0), "the camera did not move");
  });
});

test("e2e: graph selection: in an opened section Ctrl+click keeps the section open: a deselected node leaves it, an added one joins it, and every node is named", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["facility-0", "facility-1", "facility-2", "facility-3"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const pill = await page.evaluate(() => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), h = G.catHits().find((P: any) => P.sec && !P.act && !P.band && P.sec.kind === "facility"); return h ? { x: (h.x0 + h.x1) / 2 + r.left, y: (h.y0 + h.y1) / 2 + r.top } : null; });
    assert.ok(pill, "the selected facilities have a section");
    await page.mouse.click(pill.x, pill.y); await page.waitForTimeout(1500);
    const crumb = () => page.evaluate(() => document.getElementById("crumbs")!.innerText);
    assert.match(await crumb(), /Facilities/);
    const named = await page.evaluate(() => (window as any).__graph.labelRects().length);
    assert.ok(named >= 4, "the section's nodes are named (got " + named + ")");
    const p = await xy(page, "facility-1"); await page.keyboard.down("Control"); await page.mouse.click(p.x, p.y); await page.keyboard.up("Control"); await page.waitForTimeout(800);
    assert.deepEqual(await selected(page), ["facility-0", "facility-2", "facility-3"]);
    assert.match(await crumb(), /Facilities/, "the section is still open");
    assert.match(await crumb(), /Facilities, 3/, "the deselected node left the section");
    const gone = await xy(page, "facility-1"); assert.ok(Math.hypot(gone.x - p.x, gone.y - p.y) > 20, "and it glided out of the section");
    // a node put into the selection (from the list of what is linked) joins the section of its type
    await page.evaluate(() => (window as any).__graph.setSelection(["facility-1"], "add")); await page.waitForTimeout(800);
    assert.match(await crumb(), /Facilities, 4/, "a facility added to the selection joins it");
  });
});

test("e2e: graph selection: a small section is two columns, the linked nodes in the order of their partners; hovering a node draws its own links dark and the others pale", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => { const G = (window as any).__graph; for (const n of G.g.nodes()) if (/^(device|person|site)-/.test(n)) G.g.dropNode(n); G.setSelection(["facility-0", "facility-1"], "replace"); }); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const pill = await page.evaluate(() => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), h = G.catHits().find((P: any) => P.sec && !P.act && !P.band && P.sec.kind === "facility"); return { x: (h.x0 + h.x1) / 2 + r.left, y: (h.y0 + h.y1) / 2 + r.top }; });
    await page.mouse.click(pill.x, pill.y); await page.waitForTimeout(1500);
    const f0 = await xy(page, "facility-0"), f1 = await xy(page, "facility-1");
    assert.ok(Math.abs(f0.x - f1.x) < 1 && f0.y !== f1.y, "the two facilities stand in one column");
    const [a, b] = f0.y < f1.y ? ["experiment-0", "experiment-1"] : ["experiment-1", "experiment-0"]; // experiment i is linked to facility i % 6
    const ya = (await xy(page, a)).y, yb = (await xy(page, b)).y, ya2 = (await xy(page, a === "experiment-0" ? "experiment-6" : "experiment-7")).y, yb2 = (await xy(page, b === "experiment-1" ? "experiment-7" : "experiment-6")).y;
    assert.ok(Math.max(ya, ya2) < Math.min(yb, yb2), "the experiments of the upper facility are above those of the lower one, so no link crosses");
    await page.mouse.move(f0.x, f0.y); await page.waitForTimeout(400);
    const col = (s: string, t: string) => page.evaluate(([x, y]) => { const G = (window as any).__graph, e = G.g.edge(x, y) ?? G.g.edge(y, x); return e ? G.sigma.getEdgeDisplayData(e)?.color : null; }, [s, t]);
    assert.equal(await col("facility-0", "experiment-0"), "#1d2f24", "a link of the hovered node is dark");
    assert.equal(await col("facility-1", "experiment-1"), "#e3e9d8", "the other links are pale");
    await page.mouse.move(5, 5); await page.waitForTimeout(300);
    assert.notEqual(await col("facility-0", "experiment-0"), "#1d2f24", "and they return to normal when the pointer leaves");
  });
});

test("e2e: graph selection: every section of the selection view has its Select all / Clear, also in a narrow window", async () => {
  for (const width of [1400, 760, 520]) await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0", "organization-1", "facility-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const n = await page.evaluate(() => { const H = (window as any).__graph.catHits(); return { pills: H.filter((P: any) => P.sec && !P.act && !P.band).length, acts: H.filter((P: any) => P.act).length }; });
    assert.ok(n.pills >= 3, "there are sections");
    assert.equal(n.acts, n.pills, `at ${width}px wide every section has its button`);
  }, { width, height: 700 });
});

const openedInBrowse = (page: Page, id: string) => page.evaluate((i) => window.postMessage({ kind: "selection", ids: [], current: i }, location.origin), id);

test("e2e: graph selection: in the selection view the node opened in Browse is not drawn as selected when it is not (deselecting it removes it from Selected)", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => window.postMessage({ kind: "selection", ids: ["facility-0", "facility-1", "facility-2"], current: "facility-0" }, location.origin)); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const inSelected = () => page.evaluate(() => { const G = (window as any).__graph; return G.catHits().find((P: any) => P.band && /^Selected/.test(P.band.text))?.band.n as number; });
    assert.equal(await inSelected(), 3);
    const p = await xy(page, "facility-0"); await page.keyboard.down("Control"); await page.mouse.click(p.x, p.y); await page.keyboard.up("Control"); await settled(page);
    assert.deepEqual(await selected(page), ["facility-1", "facility-2"]);
    assert.equal(await inSelected(), 2, "the deselected node (still the one opened in Browse) is not in the Selected section");
  }, { width: 1400, height: 860 }, "?embed=1");
});

const onScreen = (page: Page, id: string) => page.evaluate((i) => { const G = (window as any).__graph, r = document.getElementById("terr")!.getBoundingClientRect(), v = G.sigma.graphToViewport(G.g.getNodeAttributes(i)); return v.x > 0 && v.y > 0 && v.x < r.width && v.y < r.height; }, id);

test("e2e: graph selection: a resource opened in Browse is brought into view when it is off screen, and left alone when it is already in sight", async () => {
  await withGraph(async (page) => {
    const before = await camera(page);
    await openedInBrowse(page, "organization-0"); await settled(page);
    assert.ok(sameCamera(await camera(page), before), "already on screen: the camera does not move");
    // zoom in far on one node, so most of the graph is out of sight
    await page.evaluate(() => { const G = (window as any).__graph, f = G.sigma.viewportToFramedGraph(G.sigma.graphToViewport(G.g.getNodeAttributes("organization-0"))); G.sigma.getCamera().setState({ x: f.x, y: f.y, ratio: 0.12 }); });
    await settled(page);
    const far = "device-17";
    assert.equal(await onScreen(page, far), false, "the node is out of sight");
    await openedInBrowse(page, far); await settled(page);
    assert.equal(await onScreen(page, far), true, "opening it brings it into view");
    assert.ok((await camera(page)).ratio <= 0.4, "close enough to see it");
  }, { width: 1400, height: 860 }, "?embed=1");
});

test("e2e: graph selection: a resource opened in Browse whose type is hidden in the legend shows its type again", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (document.querySelector('#legend button[data-t="device"]') as HTMLElement).click()); await settled(page); // the portal's copy of the legend clicks this one
    assert.equal((await shown(page)).device, undefined, "devices are hidden");
    await openedInBrowse(page, "device-3"); await settled(page);
    assert.equal(((await shown(page)).device ?? 0) > 0, true, "opening a device shows the devices again");
    assert.equal(await onScreen(page, "device-3"), true);
  }, { width: 1400, height: 860 }, "?embed=1");
});

test("e2e: graph selection: nothing can be dragged out of the selection view or a grid", async () => {
  await withGraph(async (page) => {
    await page.evaluate(() => (window as any).__graph.setSelection(["organization-0"], "replace")); await settled(page);
    await page.locator("#selview").click(); await settled(page);
    const home = await places(page), cam = await camera(page), n = await xy(page, "organization-0");
    await page.mouse.move(n.x, n.y); await page.mouse.down(); await page.mouse.move(n.x + 160, n.y + 90, { steps: 8 }); await page.mouse.up(); await settled(page);
    assert.equal(sameAs(home, await places(page)), true, "the node stayed where the arrangement put it");
    assert.ok(sameCamera(await camera(page), cam), "and the view did not pan");
    assert.equal(await page.evaluate(() => (window as any).__graph.catHits().filter((P: any) => P.band).length), 4, "the selection view is still up");
    assert.equal(await page.evaluate(() => (window as any).__graph.physics().liveOn), false, "no physics started");
    // a label can be pressed too
    await page.keyboard.press("Escape"); await page.evaluate(() => (window as any).__graph.setSelection([], "replace")); await settled(page);
    await page.locator('#legend button[data-t="organization"]').click({ modifiers: ["Control"] }); await settled(page);
    assert.notEqual(await page.evaluate(() => (window as any).__graph.cat()), null, "a grid is open");
    const g0 = await places(page), o = await xy(page, "organization-1");
    await page.mouse.move(o.x, o.y); await page.mouse.down(); await page.mouse.move(o.x + 120, o.y + 80, { steps: 8 }); await page.mouse.up(); await settled(page);
    assert.equal(sameAs(g0, await places(page)), true, "the same in a grid");
  });
});
