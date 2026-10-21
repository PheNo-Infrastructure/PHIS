# TraitFinder / HortControl export — mapping to PHIS and views in the portal

Status: draft for review (2026-10-20). Replaces the 2026-07/09 assumptions about the TraitFinder export
(manifest + `_PHIS.csv` sheets); the old plugin is **not** a source of truth.

Source: `UiT_MDK_ArcticFrontiers_01_TraitFinder_20260108_PlantEye.csv`, a raw, **unaltered** HortControl export reviewed
with an experienced user (2026-10-20). One file, no manifest. This is the reference format. The earlier export
(PBar1x4: manifest + Clean/Messy/PHIS sheets, US-style timestamps, zero-padded units, PlantID/Replicate/GroupID) was
programmatically altered after export and is **not** a format to support by default.

## Status (2026-10-20, end of day)
**Part 1 works end to end.** The real file is imported into phis-test (private experiment "UiT_MDK_ArcticFrontiers_01 – TraitFinder – 2025-11-25":
24 objects, 63 variables, 16,380 values, 7 distribution groups) and its Treatment grid renders in the portal (15C vs 18C, 10 plants each).
Decisions made while getting there: the treatment sits on the **plants only** (the portal lists a level's members as plants, so a block
carrying it was counted as one); the import review can **add a species** PHIS lacks (named there; `Bean`, no AGROVOC link — which bean it is
is unconfirmed: common bean c_5767 or broad bean c_10722); a species is never matched as the file's germplasm (species "Bean" and variety "Bean"
share a name). Re-importing the same file is a no-op (16,380 values "already in PHIS", nothing differs).
**Open:** (1) OpenSILEX's `GET /vuejs/owl_extension/rdf_type_properties` answers 500 "Multiple objects for some unique property" for EVERY class on
phis-test since the first Block import added the Block class, `positionInBlock` and its Plant restriction (it worked before; the import now
falls back to reading the property itself). PHIS's own object forms probably use that read. Cause unconfirmed; the diagnostic (deleting the
`positionInBlock` restriction on Plant) was blocked by the permission classifier and needs the user's say. (2) Part 2 distribution charts.
(3) Treatment's factor category. (4) The 21 older trait variables keep entity Plant. (5) Questions in section 4.

## Status (2026-10-21)
**Part 2 built.** An experiment's page offers each variable group made of histogram bins under "Distributions" (found from the bins' names,
`NDVI [0.15:0.3]`); picked like a variable, the chart grid draws one stacked bar per scan (the group's mean share per bin, a chart per
treatment level), and below it one bar per plant for a chosen scan (click a bar to jump to its scan). Route `/api/experiment-distribution`;
checked on the real data (NDVI: 20 plants x 13 scans x 6 bins, every bar sums to 100 %). Also: the import dialog takes a dropped file, a ZIP
or the CSV itself; the review and result text name variable groups and an added species. Treatment's factor category is deliberately NOT set
(the column is generic; "Air temperature" would be a guess from the level names).

## Resolved incident: phis-test ontology read (2026-10-21)
After the first Block import, OpenSILEX's `GET /vuejs/owl_extension/rdf_type_properties` answers 500 "Multiple objects for some unique property" for every
class; PHIS's own Scientific object types screen shows the error when a type is opened. **Cause:** this OpenSILEX version supports only ONE custom class
made through `POST /vuejs/owl_extension/rdf_type`: the store holds exactly two Vue ClassExtension nodes (Tray from 2 Oct, Block from 20 Oct) and the lookup
`VueOwlExtensionDAO.getExtensionClass` (a "unique property" query) then finds two. The Block property and its Plant restriction were ruled out (deleted
the restriction, read still failed, restored it). **Design consequence:** never add a second custom class; prefer existing OESO classes. **Fix needs a
decision about phis-test data** (drop Tray + the old PBar1x4 import and keep Block; or drop Block + the new import; or relabel Tray as Block); details in the
memory note `project_ontology_read_incident`. **Resolved:** the user said Tray and the outdated PBar1x4 import weren't wanted; PBar1x4 was deleted with everything, the Tray property/restriction removed through the API, and the Tray class's 9 triples removed directly in GraphDB (the API delete hits the same bug). The read works again and PHIS's own screen opens every class. Rule: one custom class only (`#Block`). Only phis-test was ever written to.

## 1. What the file is (measured, not assumed)

| Fact | Value |
|---|---|
| Rows / columns | 260 / 69 (6 identifying + 63 measurements) |
| `unit` | `block:column:row`, e.g. `3:2:1` (unpadded). 20 units = blocks 1–4 × columns 1–5, row always 1 |
| Scans | 13 days, 2025-11-25 … 2026-01-08, exactly one per unit per day, no blanks |
| `sensor` | `A` on every row |
| `genotype`, `g_alias` | `Bean`, `Bean` (uploaded to TraitFinder before the experiment; scientific vs alias is the user's use) |
| `treatment` | `15C` (blocks 1–2), `18C` (blocks 3–4): constant per block |
| Single-value traits | ~21 (areas, volume, biomass, heights, convex hull ×5, light penetration depth, surface angle, leaf inclination, 7 index averages) |
| Histograms | 7 indices (GLI, Hue, Lightness, NDVI, NPCI, PSRI, Saturation) × 6 bins = 42 columns; **each set sums to exactly 100.0 % on all 260 rows** |

Not in the file: Replicate, GroupID, plant names, device serial, time zone, 3D files. HortControl 3 stores only
genotype + treatment as metadata; HortControl "next" allows any number of factors/levels and batches, so later
exports may carry more columns. The plugin must treat unknown identifying columns as candidate factors, not fail.
### The unit string
`block:column:row` is the working reading (a colleague who attended the scientist meeting; he is not certain). Evidence:
the earlier export's manifest has `Unit = 31:01:01` next to `Block 31, Column 1, Row 1` (Unit is the three joined, zero-padded);
Row is 1 in all 100 plants there and in all 260 rows here; blocks are one row of 4 (PBar1x4) or 5 (this file) plants.
A paper on HortControl exports (PMC13212364) calls the middle number a row counted from the barcode — the one source
that disagrees, and it cannot be told apart from "column" when a block has one row.
Rule: parse as three integers, store Column and Row as given, and when Row > 1 appears **do not guess** the layout —
say so in the review. Still to ask: do blocks ever have several rows, and which way do they run?

### What the data says about scanning (analysis of this file)
- All plants of a block share one timestamp to the second on all 52 block-days: **a block is scanned as one**, plants
  are split from that scan afterwards. The timestamp is the block's scan time.
- Block order changes from day to day (1,2,3,4 / 4,3,1,2 / 3,4,2,1 …), within a block always column 1→5. Gaps between
  blocks 77–1537 s, within a block 0 s. Time of day of the first scan ranges 08:42–15:19 (possible confounder; keep exact).
- No consistent position effect across blocks was found (no edge-plant pattern).
- Idea, not decided: a block scan as a provenance activity (52 here) the plant values share. Check PHIS support first.
- The file is UTF-8, no BOM, LF line endings; headers contain real ² ³ ° characters; some headers end in a trailing space
  (`GLI Average `, `NDVI Average `) — trim. The unit symbol ends a column name (`mm²`, `%`, `°`); histogram columns are
  `Index [lo:hi] %` and need their own rule.

Sources: Phenospex pages (TraitFinder, HortControl next/3.4, BrAPI post), StatFaRmer paper (PMC13212364). The column
definitions (digital biomass, convex hull, bin edges) are only in HortControl's in-software manual — open item.

## 2. Part 1 — What goes into PHIS

| In the file | In PHIS | Decision |
|---|---|---|
| File / run | Experiment | Name from the file prefix + start date (as before); user can change in review |
| `treatment` | Factor (category *Air temperature exposure*, exists on phis-test) with levels `15C`, `18C` | Factor name from the column header; category suggested, user confirms |
| Block (unit field 1) | Scientific object of type **Block** (renamed from Tray, user decision), carries the treatment level | New class `Block` in the ontology, created on demand like Tray was. Old Tray objects are not migrated |
| Unit | Plant, part of its Block; Column = its place in the block, Row stored too | Name e.g. `B3-C2` (shown in review; includes Row only when Row > 1); germplasm from `genotype` |
| `genotype` | Germplasm name (species `Bean` does not exist on phis-test → created or chosen in review) | |
| `g_alias` | Variety code, via the existing `germplasmCodes` mechanism | Shown as "Bean (alias Bean)" so a lazy entry is visible |
| `sensor` | Device "Measured with" (pre-matched, said so) **and** stored with each value as metadata `{sensor}` | Kept even with one sensor: multi-sensor TraitFinders exist |
| `timestamp` | Value date, `Europe/Oslo`, taken as correct | ISO `YYYY-MM-DD HH:mm:ss` only. Anything else (e.g. US `10/22/2025 01:19:34 PM` from an Excel-edited file) is refused with a plain message — day/month would be ambiguous |
| Single-value traits | Variable per trait; entity Plant, method *PlantEye 3D scan* | Reuse variables by name if present |
| Histogram bin | One variable per bin (42), unit `%`, name = the column | Machine-readable edges in the description (`bins=[0.15,0.3]`) |
| Histogram set | One **variable group** per index, e.g. "NDVI distribution", members ordered by edge | Portal parses edges from the description |
| 3D files | — | Later |

A manifest (plant names, Replicate, GroupID) is optional enrichment on top of the raw file, later; never required.

Rules: reuse what exists by name (phis-test already has the 21 trait variables, method *PlantEye 3D scan*, units
incl. DegreeCelsius, device UiT-TraitFinder); create only what is missing; show everything in the review before writing.
Memory: do not repeat the OOM crash — keep objects-in-flight low (see roadmap note on import sequence).

To decide in implementation: whether a variable's *characteristic* for the existing trait variables should be the
trait name (as on phis-test now, e.g. characteristic "Digital Biomass") or PHIS's own (e.g. reuse "Height"). The
user's guideline is to keep PHIS names where they exist; for bins the characteristic is the column name.

## 3. Part 2 — What the portal shows (built on the existing chart grid)

The chart grid (2026-10-06 spec) is driven by the experiment page's selection: variables + plants/levels/factors.
Distributions plug into the same mechanism instead of a second one.

- **Pick a variable group** (e.g. "NDVI distribution") the way a variable is picked today (Variables tab shows
  groups that have members in this experiment). The grid then draws a *distribution chart* for each selected
  plant/level/factor, arranged exactly as the line charts (factor = row, level = chart).
- **View 3 — distribution per plant and day:** pick a day (scan slider, defaults to the last); one stacked bar
  per plant, bins as segments, ordered by bin edge. Bars sum to 100 %, so no axis scaling problems.
- **View 4 — distribution over time:** for a level/factor/plant, x = scan day, each column a stacked bar of the
  group's mean bin shares (single plant: its own). Click a column → View 3 for that day.
- Both read the existing `/api/experiment-overview`-style route per bin variable (sequential, cached — never fan
  out full scans, see the OOM note); the page assembles bins by the group's order.
- Bin colours: one sequential palette from low to high edge (validated for dark mode, as the line charts).
- Hover = bin range + share; the statistics toggle does not apply (stacked means only).
- The line charts (views 1–2) cover all single-value traits unchanged; comparing 15C vs 18C is a factor row.

## 4. Open questions for the experienced user / Phenospex

1. Confirm unit = block:column:row. Do blocks ever have more than one row, and which way do rows run?
2. Is `Bean` a finished germplasm entry or a placeholder? Does the lab fill `g_alias` properly?
3. What does sensor `A` identify (channel, device, position)? Serial for the Device?
4. Definitions of the 63 columns (HortControl manual) — can we get the parameter help page?
5. Do exports from HortControl "next" carry extra factor columns? A sample would settle the "unknown columns" rule.
6. Is the HortControl BrAPI (3.8+) available in the lab? It could replace CSV import later.

## 5. Out of scope now
3D files and data files, areas/coordinates, migration of the old Tray objects (not a source of truth),
significance tests.
