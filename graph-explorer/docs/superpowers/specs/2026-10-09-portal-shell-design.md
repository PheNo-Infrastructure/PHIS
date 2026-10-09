# Portal shell: a navbar named by intent

Status: draft, 2026-10-09. **On hold: the user decided NOT to build yet** ("still not fully imagining how it should be"). See "Direction update" below; the decisions further down may change.

## Direction update (user, end of 2026-10-09)

The portal can **teach PHIS's structure indirectly**: each button points the user at the right subgraph, with a streamlined interface for the graph at that point. They learn how PHIS fits together by working in it, so the structure is shown, not hidden (this partly reverses decision "plain words with the PHIS term small": keep PHIS's own names and layout visible).
- **Browse** = the entire graph; therefore **last in the navbar**.
- **Set up** = the subgraph that can be set up; friction-free creation, PHIS structure not hidden.
- **Import** = the same idea, streamlined for importing.
- **Next goal: a good graph view** (the reserved "How the selection connects" pane says "the graph will show this later"). A graph that works well is expected to make the navigation problem solvable. Brainstorm the graph first; the shell follows from it.


## Why

The A–Z work added capability but not clarity (user's verdict, 2026-10-08, `project_portal_future_direction`). Navigation is hard even for the person who built it. The portal exists because PHIS has a high entry barrier and needs programmatic knowledge for some tasks, so copying PHIS's menu would copy the barrier. Goal: a shell a first-time scientist can use without knowing PHIS's data model. PHIS's names stay visible, small, next to the plain words, so nothing contradicts what people see in PHIS.

## Decisions (from the session)

1. **Navbar named by intent, no app name:** `Overview · Set up · Import · Browse · Manage`, plus a search box. The project name "Graph Explorer" is not shown (it will not be in the live version).
2. **Charts live inside Browse.**
3. **The buttons are lenses, not walls.** The verbs cannot be separated (creating needs linking, managing needs browsing, import creates and links), so every button opens the same workspace and the selection survives every switch. A button changes only (a) the landing content and (b) which actions the Selection pane puts up front; every other action stays reachable under "More actions" (no dead ends, no mode that blocks work). The mapping follows the selection actions: Browse = looking (open, charts, values); Manage = linking and editing what exists (Link, Unlink, Rename, Visibility, Delete); Set up = creating one thing (+ New, standalone or from a selection); Import = creating many from files. Page-level edit controls (rename, ×, delete) are unchanged in all modes.
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
| Set up | Guided recipes ("Set up a trial": experiment, plants and trays, treatments, varieties, equipment), each step opening the workspace with the right thing selected and + New up front; plus what is unfinished. Pane puts + New first. | the standalone "+ New <type>" flows and the creation menu |
| Import | Past imports (each openable) with "New import" beside them | today's import dialog; the redesign is postponed until after the user's meeting (end of week of 2026-10-12) |
| Browse | Trials first; below, every other kind in plain words; trial and node pages; charts, values, the chart grid. Pane puts Open and Chart first. | today's categories, tree, detail and chart code |
| Manage | Groups, profiles and sharing pages; pane puts Link, Unlink, Rename, Visibility, Delete first. Accounts only once login is decided | today's group and profile pages, link/unlink, delete-everything |

## Scopes overlap on purpose

Each button is a default subset of the knowledge graph, and the subsets overlap (a union, not a partition). That is accepted: no clear boundaries are drawn. What is built is the shared pieces that live in the overlap, and a default scope and emphasis per button.

| Button | Default scope | Verbs embedded when the task needs them |
|---|---|---|
| Import | What a trial import touches: experiment, germplasm, variables, plants and trays, device, person, sharing group, facility | Inline editor (fix, relink, unlink a related resource from the review); picker (choose an existing device or person) |
| Set up | The same trial subgraph, built by hand | Picker ("reuse an existing variety, variable, device"); inline editor |
| Manage | Resources that can be changed. At first, narrow: sharing and access (groups, profiles, who sees which trial), plus link, unlink and delete on whatever is open; it grows with need | Browse inline to find things |
| Browse | The whole graph, read-only by default | Open, walk, chart |

- **Import and Set up share a subgraph.** Import is Set up with the data arriving from files, so both are built from the same components. This is what keeps import from being "slapped on": its review step is made of the portal's own chips, links and pickers.
- **Two embeddable pieces are needed, not pages:** a *picker* (choose existing; same plain/ctrl/shift click rules, with search) and an *inline editor* (link, relink, unlink, rename). Both reuse the Selection pane's actions.
- **Manage versus Browse blur today** because nearly everything is manageable. Once login exists, Manage = what the user has rights to change and Browse = everything they can see. That boundary arrives with login; until then they differ by default scope and emphasis only.

## Phasing

Each phase ships on its own, is tested, and is reviewed visually.

1. **Shell.** Navbar, five views reusing the existing pages, Selection pane kept on all of them with the mode's actions up front and the rest under "More actions" (also ends the pane's button overflow), minimal Overview, remove the old header and the bottom hint strip. No page content changes yet. The existing 299 tests keep passing; navigation helpers in tests move to the new navbar.
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
