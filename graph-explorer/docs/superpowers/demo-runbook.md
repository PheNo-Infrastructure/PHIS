# Portal demo runbook — TraitFinder import into PHIS

For: whoever presents to the PheNo team (Tue 2026-10-27). Message in one line:
**raw instrument file in, linked PHIS data out, no hand work.**
Everything below was rehearsed by `npm run demo:rehearse` (whole path ≈ 15 s of clicking; the import itself ≈ 9 s).

## Before you start (10 min, do it the day before AND an hour before)

- [ ] `cd graph-explorer`, `.env` present (`PHIS_PASS`, `PHIS_HOST` = phis-test).
- [ ] Start the portal: `npm run dev`, open http://localhost:4000. If it says the port is busy, a stale `node` holds :4000: PowerShell `Get-NetTCPConnection -LocalPort 4000 | % { Stop-Process -Id $_.OwningProcess -Force }`, then start again.
- [ ] File ready: `Downloads/Sheets.zip` (the raw HortControl export, unaltered).
- [ ] **Experiment must NOT exist.** Run `npm run demo:reset` (portal running). It deletes ONLY "UiT_MDK_ArcticFrontiers_01 – TraitFinder – 2025-11-25" on phis-test and says "Already clean" if it is gone. If it were left in, the import would do nothing.
- [ ] Optional full dry run: `DEMO_HEADED=1 npm run demo:rehearse` (PowerShell: `$env:DEMO_HEADED=1; npm run demo:rehearse`). It imports, so run `npm run demo:reset` again afterwards.
- [ ] Fallback video (≈ 40 s, captioned, no sound): `graph-explorer/demo-rehearsal-out/tuesday-demo-fallback.webm` (local only, not in git). Have it open in a player before you start. Re-make it with `DEMO_VIDEO=1 npm run demo:rehearse` after a reset.
- [ ] Browser full screen, zoom 100 %, notifications off.

## Full cut (5–8 min)

| # | Do | Say | Notice |
|---|---|---|---|
| 1 | On the start page, click **Import from an instrument…** (top right) | "This is the only entry point we need today." | One button, no menu hunting |
| 2 | Drop **Sheets.zip** on the dashed box (or **Choose file**) | "This is the raw export from the TraitFinder, exactly as the instrument wrote it." | It says "Recognised as TraitFinder (HortControl export)" |
| 3 | Scroll the review slowly | "Before anything is written, it shows what it will create in plain terms." | New experiment; Treatment with 2 levels (15C, 18C); 24 objects (4 blocks, 20 plants); 63 variables; the footer says **Nothing has been written to PHIS yet** |
| 4 | Click the blue button at the bottom (it starts with "Create 1 experiment, …" and names what it creates) | "One click." | Progress bar; ≈ 9 s. Say: "it keeps going on the server even if you close this" if it feels slow |
| 5 | Read the result line | "24 objects, one factor, 16,380 measured values, and a note about where it came from." | Numbers match step 3 |
| 6 | Click **Open the experiment** | "Now it is a normal experiment in PHIS." | Overview with a **Distributions** row of chips |
| 7 | **Ctrl+click** a chip, e.g. *GLI distribution*; open the **Plants** tab; **Ctrl+click** the **Treatment** header; click **Show grid** | "Each trait histogram was imported as variables and grouped; here are the shares per scan, 15C vs 18C." | Stacked bars: 13 scans per chart; below, **One scan** with a bar per plant (B1-C1 … B4-C5) |
| 8 | Change the **One scan** dropdown | "Every plant, every scan — traceable back to its block and position." | |

Close with: "From a raw file to linked, queryable data in under a minute."

## Short cut (~3 min)
Steps 1 → 2 → 3 (stop at the footer "Nothing has been written") → 4 → 5 → 7 (one chart, no dropdown).

## If something goes wrong

| Situation | What to do |
|---|---|
| Review shows the experiment as existing / import "fills in" | The reset was missed. Do not import; switch to the recording and explain. |
| Species dropdown appears and the button is greyed | Choose **Bean** (it is the species used; assumed, bean type unconfirmed). Normally it does not appear because Bean already exists. |
| Import is slow or the browser tab freezes | Say "it keeps running on the server"; wait up to 5 min; then reload and search for the experiment — it is there if it finished. |
| Refusal message about the file (e.g. date format) | Wrong file: use the original `Sheets.zip`, not an edited copy. |
| Anything else breaks | Play the recording; do not debug in front of the team. |

## Things to be honest about if asked
- Variables and the Bean germplasm were already in PHIS from earlier imports, so the review says "reused". On a PHIS with none, it would say "New".
- Bean is an assumed species; the variable naming (Plant/Leaf/Canopy) is not final.
- The menu structure is being reworked; today's path avoids it on purpose.
