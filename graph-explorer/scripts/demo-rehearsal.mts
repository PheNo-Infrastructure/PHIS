// Drives the demo path against a RUNNING local portal (npm run dev) and phis-test.
// Fails loudly on the first step that differs. DEMO_HEADED=1 shows the browser, slowed down.
import { chromium } from "playwright";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

const BASE = process.env.DEMO_BASE ?? "http://localhost:4000";
const ZIP = process.env.DEMO_ZIP ?? `${homedir()}/Downloads/Sheets.zip`;
const SPECIES = process.env.DEMO_SPECIES ?? "Bean";
const OUT = "demo-rehearsal-out";
const headed = process.env.DEMO_HEADED === "1";
const video = process.env.DEMO_VIDEO === "1"; // records the fallback video with a caption per step

mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const step = (name: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${name}`);
let page: import("playwright").Page;
// In a recording, a caption bar says what is happening and holds long enough to read.
async function caption(text: string, ms = 2500) {
  if (!video) return;
  await page.evaluate((t) => {
    let el = document.getElementById("demoCaption");
    if (!el) {
      el = document.createElement("div"); el.id = "demoCaption";
      el.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:99999;padding:14px 24px;background:#264030;color:#F2F5DE;font:600 20px system-ui;text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
  await page.waitForTimeout(ms);
}

async function precondition() {
  const res = await fetch(`${BASE}/api/experiments`);
  if (!res.ok) throw new Error(`Portal not answering at ${BASE} (${res.status}) — is npm run dev running?`);
  const list = (await res.json()) as { label: string }[];
  if (list.some((e) => e.label.includes("TraitFinder – 2025-11-25"))) {
    throw new Error("Reset first: TraitFinder experiment already exists");
  }
}

await precondition();
step("precondition ok: no TraitFinder experiment yet");

const browser = await chromium.launch({ headless: !headed, slowMo: headed ? 400 : 0 });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, ...(video ? { recordVideo: { dir: `${OUT}/video`, size: { width: 1600, height: 900 } } } : {}) });
page = await context.newPage();
page.setDefaultTimeout(30_000);
try {
  await page.goto(BASE);
  await caption("A raw TraitFinder export goes into PHIS. No hand work.", 3500);
  await page.locator("#importBtn").click();
  step("import dialog open");
  await caption("One entry point: Import from an instrument");

  await page.locator("#importFile").setInputFiles(ZIP);
  await page.locator(".import-section").first().waitFor();
  const plan = (await page.locator("#importPlan").innerText()).replace(/\s+/g, " ");
  if (!/Nothing has been written to PHIS yet/.test(await page.locator("#importFooter").innerText())) {
    throw new Error("Review does not say that nothing has been written yet");
  }
  step(`review shown (${plan.length} chars): ${plan.slice(0, 160)}…`);
  await page.screenshot({ path: `${OUT}/1-review.png` });
  await caption("Before anything is written, it shows what it will create", 4000);
  await page.locator("#importPlan").evaluate((e) => {
    for (let p = e.parentElement; p; p = p.parentElement) if (p.scrollHeight > p.clientHeight + 20) { p.scrollBy({ top: 500, behavior: "smooth" }); break; }
  });
  await caption("24 objects, 63 variables, 2 treatment levels. Nothing written yet.", 3500);

  const species = page.locator("#importSpecies");
  if (await species.count()) {
    const opt = species.locator("option", { hasText: SPECIES }).first();
    if (await opt.count()) await species.selectOption({ label: (await opt.innerText()).trim() });
    else { await species.selectOption("__new__"); await page.locator("#importNewSpecies").fill(SPECIES); }
    step(`species chosen: ${SPECIES}`);
  }
  await caption("One click to import", 1500);
  await page.locator("#importRunBtn").click();
  await page.locator("#importOpenBtn").waitFor({ timeout: 5 * 60_000 });
  step(`import done: ${(await page.locator("#importFooter").innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
  await page.screenshot({ path: `${OUT}/2-imported.png` });
  await caption("Done in seconds: 16,380 measured values, linked to blocks and plants", 4000);

  await page.locator("#importOpenBtn").click();
  const chip = page.locator("#detailBody .chip", { hasText: "distribution" }).first();
  await chip.waitFor();
  step(`experiment open; first distribution: ${(await chip.innerText()).replace(/\s+/g, " ")}`);

  await caption("Each trait histogram arrived as grouped variables", 3000);
  await chip.click({ modifiers: ["Control"] });
  await page.locator('button.dtab[data-dtab="plants"]').click();
  await page.locator(".hx-head[data-id]").first().click({ modifiers: ["Control"] });
  await page.locator("#showGridBtn").click();
  const grid = page.locator("#chartGrid");
  await grid.locator(".d-chart").first().waitFor();
  const charts = await grid.locator(".d-chart").count();
  const scans = await grid.locator(".d-chart").first().locator(".d-col").count();
  if (!charts || !scans) throw new Error("Distribution chart did not render");
  step(`chart grid: ${charts} charts, ${scans} bars (scans) in the first`);
  await grid.locator(".d-day-chart").first().waitFor();
  // Every plant bar must carry its own name (a glitch once showed ten bars all labelled B1-C1).
  const labels = (await grid.locator(".d-day-chart").first().innerText()).match(/B\d-C\d/g) ?? [];
  if (labels.length < 5 || new Set(labels).size !== labels.length) throw new Error(`One-scan plant labels are wrong: ${labels.join(",")}`);
  step(`one-scan labels ok: ${labels.length} distinct plants`);
  await page.screenshot({ path: `${OUT}/3-charts.png`, fullPage: true });
  await caption("Per scan, 15C vs 18C, and per plant for one scan", 6000);
  step("DONE — screenshots in " + OUT);
} catch (err) {
  await page.screenshot({ path: `${OUT}/failure.png`, fullPage: true }).catch(() => {});
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await context.close(); // flushes the video
  await browser.close();
}
