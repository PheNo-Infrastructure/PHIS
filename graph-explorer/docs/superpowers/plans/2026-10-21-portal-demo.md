# Portal Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A rehearsed, menu-free demo of importing the raw TraitFinder export (Sheets.zip) into PHIS through the portal, with a runbook for the colleague presenting on Tuesday 2026-10-27 and a recorded fallback.

**Architecture:** No portal features. One Playwright rehearsal script drives the exact demo path against the local portal and phis-test and fails loudly on any difference; the runbook is written from what that script observes. Reset between runs = delete the one TraitFinder experiment (user-confirmed each time).

**Tech Stack:** Node `--experimental-strip-types`, Playwright (already a devDependency), the existing portal in `public/index.html`.

**Spec:** `docs/superpowers/specs/2026-10-21-portal-demo-design.md`

## Global Constraints

- Target is phis-test only (`PHIS_HOST` in `.env`); never production.
- Portal runs locally: `npm run dev` on :4000, branch `graph-explorer/project`. The live portal (848c4c8) cannot read the raw file.
- Input is the raw `~/Downloads/Sheets.zip` (`UiT_MDK_ArcticFrontiers_01_TraitFinder_20260108_PlantEye.csv`).
- Reset deletes only the experiment "UiT_MDK_ArcticFrontiers_01 – TraitFinder – 2025-11-25", named and confirmed by the user at run time. No PVC, pod or ontology deletes.
- No portal feature changes. A tweak (e.g. deep link) only if rehearsal proves a step needs it, as its own commit, after asking the user.
- Runbook has a full cut (5-8 min) and a short cut (~3 min).
- The bug "ontology read 500 with two custom classes" is assumed fixed by another agent; rehearsal must not paper over it.

## Review Focus

- Experiment already exists at demo start: the review shows an import that does nothing. Rehearsal must fail on this precondition, not continue.
- Species not chosen: the run button must stay blocked (existing behaviour); runbook says which species to pick (assumed "Bean").
- Import takes long or the server restarts mid-run: runbook gives the "it keeps going on the server" line and how to wait/reopen the experiment.
- File dropped is the wrong file or US-format timestamps: runbook names the exact file; the portal's refusal message is captured in the rehearsal log.
- Presenter's machine differs (port 4000 held by a stale `node`): runbook has the free-the-port command.

---

### Task 1: Rehearsal script

**Files:**
- Create: `scripts/demo-rehearsal.mts`
- Modify: `package.json` (add script `"demo:rehearse": "node --experimental-strip-types --env-file=.env scripts/demo-rehearsal.mts"`)

**Interfaces:**
- Consumes: running portal at `http://localhost:4000`; `GET /api/experiments` (list with `label`); DOM ids `#importBtn`, `#importFile`, `#importPlan`, `#importSpecies`, `#importRunBtn`, `#importStep`; env `DEMO_ZIP` (default `~/Downloads/Sheets.zip`) and `DEMO_HEADED=1` for a visible, slowed run.
- Produces: exit code 0 only if every step passed; per-step console log with timings; screenshots in `demo-rehearsal-out/` (gitignored) after review, after import, and at the end chart.

- [ ] **Step 1:** Add `demo-rehearsal-out/` to `.gitignore`.
- [ ] **Step 2:** Implement `precondition()`: GET `/api/experiments`, throw `"Reset first: TraitFinder experiment already exists"` if a label contains `TraitFinder – 2025-11-25`.
- [ ] **Step 3:** Implement the path with Playwright (`chromium.launch({ headless: !DEMO_HEADED, slowMo: DEMO_HEADED ? 400 : 0 })`): click `#importBtn`, `setInputFiles` the ZIP, wait for `.import-section`, assert `#importPlan` text says nothing has been written, choose species "Bean", click `#importRunBtn`, wait (timeout 5 min) until the experiment page opens, assert the "Distributions" chips are present, click the first chip, assert a chart renders. Read the result/chip selectors from `public/index.html` (search "Distributions" and the import result handler near `importFooterHtml`); do not guess them.
- [ ] **Step 4:** Run `npm run demo:rehearse` against a reset phis-test. Expected: all steps pass, screenshots written. Run it twice; the second run must fail at `precondition()` with the reset message.
- [ ] **Step 5:** Commit `feat(graph-explorer): demo rehearsal script`.

### Task 2: Reset, then rehearse for real

**Files:** none (operational; findings feed Task 3).

- [ ] **Step 1:** Show the user the experiment to be deleted (id, object/value counts from `GET /api/experiments`) and ask for an explicit yes naming it. Do not proceed without it.
- [ ] **Step 2:** Delete it through the portal's "Delete it and everything in it" (or the same API call the button makes). Confirm `GET /api/experiments` no longer lists it and that the species/variables remain.
- [ ] **Step 3:** Run `npm run demo:rehearse` headed. Write down every place a newcomer could hesitate (unlabeled button, long wait, surprising dialog) and how long each phase takes.
- [ ] **Step 4:** If a step cannot be done without menu discovery, stop and ask the user before any portal tweak (spec rule).

### Task 3: Runbook

**Files:**
- Create: `docs/superpowers/demo-runbook.md`

- [ ] **Step 1:** Write sections: Before you start (checklist: phis-test reachable, `.env` set, `npm run dev`, free :4000 command from the dev-loop memory, Sheets.zip location, experiment absent); Full cut; Short cut; If something goes wrong (the five Review Focus lines, one answer each).
- [ ] **Step 2:** For each step in the cuts give: exact click, what to say in one plain sentence (PHIS terms only where the screen shows them), what the audience should notice, expected wait. Use the timings and hesitation points from Task 2.
- [ ] **Step 3:** The closing shot is the distribution chart per scan, then per plant for one scan; add the one-line message "raw instrument file in, linked PHIS data out, no hand work".
- [ ] **Step 4:** Commit `docs: portal demo runbook`.

### Task 4: Fallback recording

**Files:** none in git (video is large; keep outside the repo).

- [ ] **Step 1:** After one more reset (confirmed as in Task 2), the user or colleague records the run by following the runbook (screen capture of the browser only; the presenter narrates live or adds captions).
- [ ] **Step 2:** Final dress rehearsal the day before (Mon 2026-10-26): reset, `npm run demo:rehearse`, then one manual run by the colleague from the runbook alone. Fix runbook gaps found. Reset once more so Tuesday starts clean.
- [ ] **Step 3:** Push the branch.

## Self-review

- Spec coverage: fixed path (T1, T3), start-empty state (T1 precondition, T2), runbook with two cuts (T3), recording (T4), reset rules (T2), no-feature rule (T2 step 4). Open items (length, variable naming) stay open in the spec.
- Types/ids: all DOM ids come from `public/index.html`; result/chip selectors are deliberately read at implementation time (Task 1 step 3).
