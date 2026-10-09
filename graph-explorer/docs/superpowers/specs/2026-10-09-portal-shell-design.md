# Portal shell: a navbar named by intent

Status: draft for review, 2026-10-09. Brainstormed with the user; mockups were shown in the browser companion.

## Why

The A–Z work added capability but not clarity (user's verdict, 2026-10-08, `project_portal_future_direction`). Navigation is hard even for the person who built it. The portal exists because PHIS has a high entry barrier and needs programmatic knowledge for some tasks, so copying PHIS's menu would copy the barrier. Goal: a shell a first-time scientist can use without knowing PHIS's data model. PHIS's names stay visible, small, next to the plain words, so nothing contradicts what people see in PHIS.

## Decisions (from the session)

1. **Navbar named by intent, no app name:** `Overview · Set up · Import · Browse · Manage`, plus a search box. The project name "Graph Explorer" is not shown (it will not be in the live version).
2. **Charts live inside Browse.**
3. **Set up means creating something new.** Editing what exists (rename, link, unlink, delete) happens on the thing's own page, wherever it was opened from.
4. **The page under a button must not restate the button.** It shows state and the next concrete thing, never a generic headline plus cards.
5. **Overview stays nearly blank for now** (user's call). It holds the search box and nothing else. When something obviously belongs on a front page it goes there; the knowledge graph is the first candidate (the "How the selection connects" pane already reserves its place). The four task cards were dropped: they repeated the navbar.
6. **One page shape for every node:** what it is, then its connections in plain words, PHIS term small beside each. Clicking a connection opens that node's page; the breadcrumb shows the path and steps back. Reverse links ("Used in: these trials") appear wherever PHIS stores the link one way only.
7. **A trial is the usual door, not a special case.** Other kinds (devices, people, groups, varieties, variables) are reached through Browse's list of kinds, links, and search.
8. **The Selection pane stays on every page.** Linking, unlinking and "+ New" all work from it.
9. **Stages on the trial page** (Set up, Collect, Explore, Share) are tabs, not a wizard: nothing is locked, and each shows its state ("125 plants", "private: nobody else sees it") plus one next-step hint.

## The five buttons

| Button | Content | Built from today's code |
|---|---|---|
| Overview | Search box only (see decision 5) | new, small |
| Set up | Starting points to create things (experiment, plants and trays, treatments, varieties, variables, devices, sites, people) and what is unfinished | the standalone "+ New <type>" flows |
| Import | Past imports (each openable) with "New import" beside them | today's import dialog; the redesign is postponed until after the user's meeting (end of week of 2026-10-12) |
| Browse | Trials first; below, every other kind in plain words; trial and node pages; charts, values, the chart grid | today's categories, tree, detail and chart code |
| Manage | Groups, profiles, sharing, delete with its counted preview. Accounts only once login is decided | today's group and profile pages, delete-everything |

## Phasing

Each phase ships on its own, is tested, and is reviewed visually.

1. **Shell.** Navbar, five views reusing the existing pages, Selection pane kept on all of them, minimal Overview, remove the old header and the bottom hint strip. No page content changes yet. The existing 299 tests keep passing; navigation helpers in tests move to the new navbar.
2. **Trial page.** Plain-word connection headings with the PHIS term small, stage tabs with state and a next-step hint, reverse links.
3. **Set up, Import and Manage landing content** (state first, not headlines).

## Out of scope

- The import redesign (postponed; Import keeps today's dialog).
- Login, accounts, personalised views (a user's org would filter instruments and cards later; the shell must not block that).
- Re-grouping or renaming PHIS's own kinds.
- Mobile phone widths (the header subtitle already overflows below ~400 px; known).

## Risks and open questions

- **Pages with many connections** (a person or a variety can have 15 kinds): show the few that matter first and fold the rest, like the Selection pane.
- **Reverse links are scans.** Keep to one sequential cached scan per page view; parallel full scans crashed phis-test OpenSILEX (OOM) before.
- **Where Browse lists the non-trial kinds** (a plain list under the trials, or its own sub-page) is not settled; decide while building phase 1 and check it with the user.
- **Testing the claim.** "Intuitive" is verified by a first-click test with someone who has not seen it (tasks: find an experiment, see its measurements, add data, share it), after phase 1 and again after phase 2.
