# Portal demo for the PheNo team — design

Date: 2026-10-21. Presentation: Tuesday 2026-10-27, presented by a colleague of the user (not the user).

## Intent
Show the PheNo team that TraitFinder (HortControl) data goes into PHIS without hand work. The audience does not care about PHIS internals. The colleague found the portal's menu unintuitive (a known issue, to be fixed later), so the demo follows one fixed path and never relies on menu discovery.

## Goals
- A concentrated 5-8 minute demo (cuttable to ~3) of the core mechanics: drop Sheets.zip -> review what will be created -> import -> see the result linked in the graph, plus the distribution charts.
- Starts from a state where the import really does something (empty of the TraitFinder experiment).
- A runbook the colleague can follow cold: exact clicks, what to say per step, what the audience should notice.
- A screen recording of the same path as a fallback.

## Non-goals
- No new portal features, no menu redesign, no PHIS-internals explanation.
- Not a tour of every portal area (groups, profiles, accounts, etc.).

## Anti-goals
- A live import that visibly does nothing (re-import is a no-op) or errors mid-talk.
- The colleague having to find things in the menu.

## Decisions (from the user)
- Target: phis-test (no new test environment). The existing TraitFinder experiment there may be deleted to reset.
- The ontology-read bug (two custom classes) is being fixed by another agent; assume it is fixed.
- Portal runs locally from branch graph-explorer/project (the live portal is on 848c4c8 and cannot read the raw file). Deploy when ready; not a demo prerequisite.
- Real file: Downloads/Sheets.zip (the raw HortControl export).

## My calls (to be checked)
- Reset = delete experiment "UiT_MDK_ArcticFrontiers_01 - TraitFinder - 2025-11-25" via the app's "Delete it and everything in it"; named and confirmed with the user at run time (CLAUDE.md data rules). Species/variety/variables/groups stay, so the review will show "reuse" rather than "create" for them. Whether to also remove those for a fuller "creates everything" story is left open.
- The fixed path ends on one experiment page chosen for impact (distribution chart per scan, then per plant for one scan), not a browse of the graph.
- Runbook is a markdown file in docs/superpowers/ in this repo; recording made by the user or colleague from the runbook (Playwright can only rehearse/verify the path, not narrate).
- Rehearsal check: a Playwright script runs the exact path against local portal + phis-test and fails loudly if any step differs, run the day before.

## Left to the builder
- Exact step wording, timings, and which charts/graph view are the end shot.
- Whether any small portal tweak (e.g. a deep link straight to the import dialog or the experiment page) is justified to avoid the menu — only if the plain path cannot avoid it; any such tweak is a separate decision with the user.

## Open
- Final presentation length (user unsure) — runbook has a full and a short cut.
- Variable naming (Plant/Leaf/Canopy) still undecided; the demo shows current names.
