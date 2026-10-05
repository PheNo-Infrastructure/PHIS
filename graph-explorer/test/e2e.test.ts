import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { handleRequest } from "../src/index.ts";
import { NODE_TYPES } from "../src/node-types.ts";

// Browser-level regression check: catches breakage that only shows up once
// JS actually runs in a page (a console error, a wired category regressing
// back to fake hardcoded data). Does NOT assert row counts > 0 — several real
// OpenSILEX categories are legitimately empty in this PHIS instance right now
// (scientific objects, variables, datafiles, provenances, documents), and a
// count assertion would make the test flaky as real data changes.

async function withServerAndBrowser(fn: (base: string, page: import("playwright").Page) => Promise<void>) {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
  page.on("pageerror", (err) => pageErrors.push(err.message));

  try {
    await fn(`http://localhost:${port}`, page);
    assert.deepEqual(consoleErrors, [], "expected no console errors");
    assert.deepEqual(pageErrors, [], "expected no uncaught page errors");
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function openRow(page: import("playwright").Page, text: string) {
  const row = page.locator(".row[data-id]", { hasText: text }).first();
  await row.locator(".row-nav").click();
  await page.waitForTimeout(300);
}

const WIRED_CATEGORIES: Array<{ branch: string; label: string; fakeIdPrefix: string }> = [
  { branch: "People", label: "Organizations", fakeIdPrefix: "org-" },
  { branch: "Trials", label: "Experiments", fakeIdPrefix: "exp-" },
  { branch: "Trials", label: "Factors", fakeIdPrefix: "fac-irrigation" },
  { branch: "People", label: "Projects", fakeIdPrefix: "proj-" },
  { branch: "Setup", label: "Facilities", fakeIdPrefix: "fac-" },
  { branch: "Setup", label: "Devices", fakeIdPrefix: "dev-" },
  { branch: "Setup", label: "Sites", fakeIdPrefix: "site-" },
  { branch: "People", label: "Persons", fakeIdPrefix: "person-" },
  { branch: "Trials", label: "Scientific Objects", fakeIdPrefix: "so-" },
  { branch: "Data", label: "Variables", fakeIdPrefix: "var-" },
  { branch: "Trials", label: "Germplasm", fakeIdPrefix: "germ-" },
  { branch: "Data", label: "Data files", fakeIdPrefix: "datafile-" },
  { branch: "Data", label: "Provenances", fakeIdPrefix: "prov-" },
  { branch: "Setup", label: "Events", fakeIdPrefix: "event-" },
  { branch: "Data", label: "Documents", fakeIdPrefix: "doc-" },
];

for (const { branch, label, fakeIdPrefix } of WIRED_CATEGORIES) {
  test(`e2e: ${label} category loads without fake ids or console errors`, async () => {
    await withServerAndBrowser(async (base, page) => {
      await page.goto(base);
      await page.waitForTimeout(1000);
      await openRow(page, branch);
      await openRow(page, label);

      const rowIds = await page.locator("#rowlist .row").evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.id));
      for (const id of rowIds) {
        assert.ok(!id?.startsWith(fakeIdPrefix), `row id "${id}" looks like old hardcoded fake data`);
      }
    });
  });
}

test("e2e: every type referenced in ADJACENT has a TYPES style, except the documented Variable-decomposition exceptions", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(500);

    // ADJACENT/TYPES are top-level `const` in a plain (non-module) <script>, so they're
    // lexical bindings visible by bare identifier in page scope, not window properties.
    const { adjacentTypes, styledTypes } = await page.evaluate(() => {
      /* eslint-disable no-undef */
      const adjacentTypes = new Set<string>();
      for (const [key, values] of Object.entries(ADJACENT as Record<string, string[]>)) {
        adjacentTypes.add(key);
        for (const v of values) adjacentTypes.add(v);
      }
      return { adjacentTypes: [...adjacentTypes], styledTypes: Object.keys(TYPES) };
      /* eslint-enable no-undef */
    });

    // Variable's decomposition sub-types are deliberately unstyled/unbrowsable — shown
    // inline on a Variable's own detail view, never as independent nodes.
    const KNOWN_UNSTYLED = new Set(["entity", "entity_of_interest", "characteristic", "method", "unit"]);
    const styled = new Set(styledTypes);
    for (const type of adjacentTypes) {
      if (KNOWN_UNSTYLED.has(type)) continue;
      assert.ok(styled.has(type), `type "${type}" appears in ADJACENT but has no TYPES style — it will silently render grey`);
    }
  });
});

test("e2e: the mockup's LINKABLE_TYPES stays in sync with node-types.ts's real NODE_TYPES keys", async () => {
  // LINKABLE_TYPES is a hand-maintained companion list (same pattern as CATEGORY_FOR_TYPE) so
  // "Link selection" only appears when at least one pair /api/link can actually resolve is
  // present — this is the drift check, same role as the ADJACENT/TYPES test above.
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(500);
    // LINKABLE_TYPES is a top-level `const` in a plain (non-module) <script>, so it's a
    // lexical binding visible by bare identifier in page scope, not a window property.
    const linkableTypes: string[] = await page.evaluate(() => {
      /* eslint-disable no-undef */
      return [...(LINKABLE_TYPES as Set<string>)];
      /* eslint-enable no-undef */
    });
    const writable = Object.entries(NODE_TYPES).filter(([, c]) => (c.actions ?? ["link"]).includes("link")).map(([t]) => t);
    assert.deepEqual(new Set(linkableTypes), new Set(writable));
    const pagePairs: string[] = await page.evaluate(() => [...(IN_EXPERIMENT_PAIRS as Set<string>)]);
    const realPairs = Object.entries(NODE_TYPES).flatMap(([t, c]) => Object.keys(c.inExperiment?.byType ?? {}).map((o) => `${t}:${o}`));
    assert.deepEqual(new Set(pagePairs), new Set(realPairs), "IN_EXPERIMENT_PAIRS drifted from NODE_TYPES' inExperiment.byType");
  });
});

test("e2e: '+ New' menu shows the INTERSECTION of creatable types across a real multi-selection", async () => {
  // A single new node gets linked to every selected item at once, so the menu must offer only
  // types adjacent to ALL selected nodes — not the union of what's adjacent to any one of them.
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select one real Experiment
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    const soloItems = await page.locator("#newList .newmenu-item").allTextContents();
    // ADJACENT.experiment in full — 6 types, proving the solo case is unconstrained.
    assert.deepEqual(
      new Set(soloItems.map((s) => s.replace("in PHIS for now", "").trim())),
      new Set(["organization", "facility", "project", "person", "factor", "scientific object"])
    );
    // Types the app can't create yet stay listed, but greyed and saying where to do it.
    assert.equal(await page.locator("#newList .newmenu-item", { hasText: "factor" }).isDisabled(), false, "a factor can be created for one experiment");
    assert.equal(await page.locator("#newList .newmenu-item", { hasText: "person" }).isDisabled(), true);
    assert.match(await page.locator("#newList .newmenu-item", { hasText: "person" }).textContent() ?? "", /in PHIS for now/);
    assert.equal(await page.locator("#newList .newmenu-item", { hasText: "project" }).isDisabled(), false);
    await page.locator("#newBtn").click(); // close

    // Ctrl-click a real Project into the selection too
    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "People");
    await page.waitForTimeout(200);
    await openRow(page, "Projects");
    await page.locator("#rowlist .row").first().click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    const comboItems = await page.locator("#newList .newmenu-item").allTextContents();
    // ADJACENT.experiment ∩ ADJACENT.project = {project, person} — strictly smaller than
    // either operand alone, which is what proves this is really an intersection and not,
    // say, "whichever set happens to come from the first selected item."
    assert.deepEqual(new Set(comboItems.map((s) => s.replace("in PHIS for now", "").trim())), new Set(["project", "person"]));
  });
});

test("e2e: 'Visibility…' shows only when everything selected has the flag; 'Make public' PUTs isPublic per item", async () => {
  await withServerAndBrowser(async (base, page) => {
    const puts: any[] = [];
    await page.route("**/api/node", (r) => { puts.push(r.request().postDataJSON()); return r.fulfill({ status: 200, contentType: "application/json", body: "{}" }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#visBtn").count(), 1);

    await page.locator("#visBtn").click();
    await page.locator("#visMenu [data-public=true]").click();
    await page.waitForTimeout(300);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].type, "experiment");
    assert.equal(puts[0].isPublic, true);
    assert.match(await page.locator("#toast").textContent() ?? "", /Made 1 public/);

    // A project has no visibility flag, so a mixed selection hides the button.
    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "People");
    await openRow(page, "Projects");
    await page.locator("#rowlist .row").first().click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#visBtn").count(), 0);
  });
});

test("e2e: '+ New' menu shows the honest empty state when a multi-selection shares no adjacent type", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select the Factors category (group-select = every factor) and ctrl-click the
    // Germplasm category (every germplasm) — ADJACENT.factor ∩ ADJACENT.germplasm = {}.
    await openRow(page, "Trials");
    await page.locator(".row[data-id]", { hasText: "Factors" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".row[data-id]", { hasText: "Germplasm" }).first().click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    const text = await page.locator("#newList").textContent();
    assert.match(text ?? "", /Nothing can be linked to all of these at once/);
  });
});

test("e2e: browsing a category with nothing selected offers a standalone \"+ New <type>\" that needs no link", async () => {
  // POST /api/create is intercepted — same reasoning as the linked-creation test below.
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: unknown = null;
    await page.route("**/api/create", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "phis:id/organization/mock-new-org", type: "organization", label: "Mock New Org" }),
      });
    });
    page.on("dialog", (dialog) => dialog.accept("Mock New Org"));

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");

    // Nothing selected yet — the idle actionbar offers a standalone create, not the
    // selection-driven "+ New" menu.
    await page.waitForTimeout(200);
    const standaloneBtn = page.locator("#newStandaloneBtn");
    assert.match((await standaloneBtn.textContent()) ?? "", /\+ New organization/);

    await standaloneBtn.click();
    await page.waitForTimeout(300);

    assert.deepEqual(capturedBody, { type: "organization", name: "Mock New Org", links: [], fields: {} });
    assert.match((await page.locator("#toast").textContent()) ?? "", /Created Mock New Org/);
    // No ", linked to ..." suffix — this really was standalone.
    assert.doesNotMatch((await page.locator("#toast").textContent()) ?? "", /linked to/);

    const rowText = await page.locator("#rowlist").textContent();
    assert.match(rowText ?? "", /Mock New Org/);
  });
});

test("e2e: standalone \"+ New site\" picks organization(s) first (same click rules), then creates linked to all of them", async () => {
  // A site can't exist without an organization (OpenSILEX refuses it), so instead of POSTing
  // links: [] and failing, the standalone button opens the picker locked to organizations.
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: any = null;
    await page.route("**/api/create", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "phis:id/organization/site.mock", type: "site", label: "Mock Site" }),
      });
    });
    page.on("dialog", (dialog) => dialog.accept("Mock Site"));

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Setup");
    await openRow(page, "Sites");
    await page.waitForTimeout(200);

    const btn = page.locator("#newStandaloneBtn");
    assert.match((await btn.textContent()) ?? "", /\+ New site/);
    await btn.click();
    await page.waitForTimeout(150);

    // Locked straight onto organizations — no type list, no "‹ Types" back button.
    assert.equal(await page.locator(".linkmenu-back").count(), 0);
    const rows = page.locator("#linkPickerBody .newmenu-item");
    await rows.first().waitFor({ state: "visible" });
    const orgCount = await page.evaluate(() => CATEGORY_ITEMS[CATEGORY_FOR_TYPE.organization].length);
    assert.equal(await rows.count(), Math.min(orgCount, 200));

    // Same rules as every other list: plain click replaces, ctrl adds.
    await rows.nth(0).click();
    await rows.nth(1).click();
    assert.equal(await page.locator("#linkPickerBody .newmenu-item.selected").count(), 1);
    await rows.nth(2).click({ modifiers: ["Control"] });
    assert.match((await page.locator(".linkmenu-confirm").textContent()) ?? "", /Create site in 2 organizations/);

    const pickedLabels = await page.locator("#linkPickerBody .newmenu-item.selected").allTextContents();
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(300);

    assert.equal(capturedBody.type, "site");
    assert.equal(capturedBody.name, "Mock Site");
    assert.equal(capturedBody.links.length, 2);
    assert.ok(capturedBody.links.every((l: any) => l.type === "organization"));
    const toast = (await page.locator("#toast").textContent()) ?? "";
    assert.match(toast, /Created Mock Site, in /);
    pickedLabels.forEach((l) => assert.ok(toast.includes(l.trim()), `toast should name ${l}`));
  });
});

test("e2e: creating a facility from a selected organization auto-attaches it and it appears when browsing Facilities, without a reload", async () => {
  // POST /api/create is intercepted so this never writes to the real, shared OpenSILEX
  // instance — the backend's own contract (payload shape, DTO field mapping) is covered by
  // the mocked-fetch unit tests in backend.test.ts. This test is only about what the browser
  // does with a successful response: auto-attach into `selection` AND push into the same
  // CATEGORY_ITEMS array the category browser reads, so the new node shows up immediately.
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/create", (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: "phis:id/facility/mock-new", type: "facility", label: "Mock New Facility" }),
      })
    );
    page.on("dialog", (dialog) => dialog.accept("Mock New Facility"));

    await page.goto(base);
    await page.waitForTimeout(1000);

    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    await page.locator("#newList .newmenu-item", { hasText: "facility" }).click();
    await page.waitForTimeout(300);

    const toastText = await page.locator("#toast").textContent();
    assert.match(toastText ?? "", /Created Mock New Facility/);

    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "Setup");
    await page.waitForTimeout(200);
    await openRow(page, "Facilities");
    const rowText = await page.locator("#rowlist").textContent();
    assert.match(rowText ?? "", /Mock New Facility/);
  });
});

test("e2e: opening a facility shows its real relations, and Rename/Delete work end to end", async () => {
  // /api/node-detail, PUT /api/node and DELETE /api/node are all intercepted — same reasoning
  // as the creation test above: the backend contract is covered by mocked-fetch unit tests in
  // backend.test.ts, this test is only about what the browser does with those responses.
  await withServerAndBrowser(async (base, page) => {
    let relations = [
      { label: "Organizations", field: "organizations", items: [{ id: "org-x", type: "organization", label: "Mock Org" }] },
    ];
    await page.route("**/api/node-detail*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "mock-facility-uri", relations }) })
    );

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Setup");
    await openRow(page, "Facilities");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);

    // Real relations replaced "No connections found".
    const detailText = await page.locator("#detailBody").textContent();
    assert.match(detailText ?? "", /Mock Org/);
    assert.doesNotMatch(detailText ?? "", /No connections found/);

    // Rename
    page.once("dialog", (dialog) => dialog.accept("Renamed Facility"));
    await page.route("**/api/node*", (route) => {
      if (route.request().method() !== "PUT") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      const reqBody = route.request().postDataJSON() as { name?: string; unlink?: { field: string; uri: string } };
      if (reqBody.unlink) {
        relations = relations
          .map((r) => (r.field === reqBody.unlink!.field ? { ...r, items: r.items.filter((it) => it.id !== reqBody.unlink!.uri) } : r))
          .filter((r) => r.items.length);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "mock-facility-uri", type: "facility", label: "Renamed Facility", relations }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-facility-uri", type: "facility", label: "Renamed Facility" }),
      });
    });
    await page.locator("#renameNodeBtn").click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#toast").textContent() ?? "", /Renamed to Renamed Facility/);
    assert.match(await page.locator(".node-title").textContent() ?? "", /Renamed Facility/);

    // Delete while relations still exist: routes into the unlink view instead of failing.
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#detailBody").textContent() ?? "", /UNLINK MODE/);
    // Cancel exits the mode without unlinking anything.
    await page.locator("#cancelUnlinkBtn").click();
    await page.waitForTimeout(200);
    assert.doesNotMatch(await page.locator("#detailBody").textContent() ?? "", /UNLINK MODE/);
    assert.match(await page.locator("#detailBody").textContent() ?? "", /Mock Org/);
    // Re-enter to continue the flow below.
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);

    // Unlink the one relation — the view should drop back to normal once nothing's left.
    await page.locator(".chip-unlink").click();
    await page.waitForTimeout(300);
    assert.doesNotMatch(await page.locator("#detailBody").textContent() ?? "", /UNLINK MODE/);

    // Delete again: now succeeds for real.
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);
    assert.match(await page.locator("#toast").textContent() ?? "", /Deleted Renamed Facility/);
    const rowText = await page.locator("#rowlist").textContent();
    assert.doesNotMatch(rowText ?? "", /Renamed Facility/);
  });
});

test("e2e: a scientific object's experiment box shows its name there; Rename in the box renames that copy only and reloads the page", async () => {
  await withServerAndBrowser(async (base, page) => {
    let nameInB = "P1";
    const puts: any[] = [];
    const box = (id: string, label: string, name: string) => ({ id, type: "experiment", label, name, groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [] }] });
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      uri: "so-1", actions: ["rename", "delete", "link"], deleteRemovesLinks: true,
      relations: [{ label: "In experiments", field: "experiment", items: [box("exp-a", "Trial A", "P1"), box("exp-b", "Trial B", nameInB)] }],
    }) }));
    await page.route("**/api/node", (r) => {
      const b = r.request().postDataJSON();
      puts.push(b);
      nameInB = b.name;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "so-1", type: "scientific_object", label: b.name }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "so-1", type: "scientific_object", label: "P1" }));
    await page.waitForTimeout(400);
    const boxB = page.locator(".item-box", { hasText: "Trial B" });
    assert.match(await boxB.innerText(), /Name\s+P1/);

    let asked = "";
    page.once("dialog", (d) => { asked = d.message(); d.accept("P2"); });
    await boxB.locator("[data-rename-in]").click();
    await page.waitForTimeout(400);
    assert.equal(asked, "New name for P1 in Trial B?");
    assert.deepEqual(puts, [{ type: "scientific_object", id: "so-1", name: "P2", experiment: "exp-b" }]);
    assert.match(await page.locator(".item-box", { hasText: "Trial B" }).innerText(), /Name\s+P2/, "page fetched again");
    assert.match(await page.locator(".item-box", { hasText: "Trial A" }).innerText(), /Name\s+P1/);
    assert.match(await page.locator("#renameNodeBtn").innerText(), /Rename/, "the title's Rename is there too");
  });
});

test("e2e: clicking a relation chip jumps to that resource's own canonical breadcrumb, instead of appending to the current trail", async () => {
  // Regression test for a real bug: opening Org A, following a relation chip to Facility X,
  // used to just push X onto whatever breadcrumb got you to A — so following a chip back from
  // X to A again grew the trail forever (A -> X -> A -> X...) instead of landing back on A's
  // own actual spot in the tree. /api/node-detail is mocked (same reasoning as the other tests
  // above) so this only has to prove the browser's navigation logic, not the backend mapping.
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (route) => {
      const url = new URL(route.request().url());
      const type = url.searchParams.get("type");
      const relations =
        type === "organization"
          ? [{ label: "Facilities", field: "facilities", items: [{ id: "mock-fac-1", type: "facility", label: "Mock Facility" }] }]
          : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "mock-uri", relations }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);

    // Follow the "Mock Facility" relation chip from the organization's detail pane.
    await page.locator(".chip[data-openid='mock-fac-1']").click();
    await page.waitForTimeout(400);

    const crumbs = await page.locator(".crumb").allTextContents();
    // Lands on Facility's own canonical path (Scientific Organization > Facilities > it) —
    // not "...Organizations > <org> > Mock Facility", which is what appending would produce.
    assert.deepEqual(crumbs.map((c) => c.trim()), ["Graph", "Setup", "Facilities", "Mock Facility"]);
  });
});

test("e2e: germplasm nests under its species — the category lists species, an opened species lists its members, a chip lands on species > member", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/germplasm", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
        { id: "sp-1", type: "germplasm", label: "Mock Barley" },
        { id: "acc-1", type: "germplasm", label: "Mock Accession", parent: "sp-1" },
        { id: "acc-2", type: "germplasm", label: "Other Accession", parent: "sp-1" },
      ]) })
    );
    await page.route("**/api/node-detail*", (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      const relations = id === "exp-x" ? [{ label: "Germplasm", items: [{ id: "acc-2", type: "germplasm", label: "Other Accession" }] }] : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: id, actions: [], relations }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Germplasm");
    const rowLabels = () => page.locator("#rowlist .row .row-label").allTextContents();
    assert.deepEqual(await rowLabels(), ["Mock Barley"]);

    await openRow(page, "Mock Barley");
    assert.deepEqual(await rowLabels(), ["Mock Accession", "Other Accession"]);
    await openRow(page, "Mock Accession");
    const crumbs = async () => (await page.locator(".crumb").allTextContents()).map((c) => c.trim());
    assert.deepEqual(await crumbs(), ["Graph", "Trials", "Germplasm", "Mock Barley", "Mock Accession"]);

    // A chip from somewhere else (an experiment) lands under the species too.
    await page.evaluate(() => openNode({ id: "exp-x", type: "experiment", label: "Exp X" }));
    await page.waitForTimeout(400);
    await page.locator(".chip[data-openid='acc-2']").click();
    await page.waitForTimeout(400);
    assert.deepEqual(await crumbs(), ["Graph", "Trials", "Germplasm", "Mock Barley", "Other Accession"]);
  });
});

test("e2e: a scientific object shows one box per experiment with its germplasm/parent there; 'none' and no-experiment texts; × on the box's experiment in unlink mode", async () => {
  await withServerAndBrowser(async (base, page) => {
    const box = (id: string, label: string, germ: { id: string; label: string }[]) => ({
      id, type: "experiment", label,
      groups: [{ label: "Germplasm", items: germ.map((g) => ({ ...g, type: "germplasm" })) }, { label: "Part of", items: [] }],
    });
    await page.route("**/api/node-detail*", (route) => {
      const id = new URL(route.request().url()).searchParams.get("id");
      const relations = id === "so-lone"
        ? [{ label: "In experiments", field: "experiment", items: [], emptyText: "Not in any experiment. Germplasm and parent can only be set inside an experiment." }]
        : [{ label: "In experiments", field: "experiment", items: [box("exp-a", "Barley 2025", [{ id: "g-annika", label: "Annika" }]), box("exp-b", "Barley 2026", [])] }];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: id, actions: ["delete", "link"], deleteRemovesLinks: true, relations }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "so-1", type: "scientific_object", label: "Plot 1" }));
    await page.waitForTimeout(400);

    const boxes = page.locator("#detailBody .item-box");
    assert.equal(await boxes.count(), 2);
    assert.match(await boxes.nth(0).innerText(), /Barley 2025[\s\S]*Germplasm[\s\S]*Annika[\s\S]*Part of[\s\S]*none/);
    assert.match(await boxes.nth(1).innerText(), /Barley 2026[\s\S]*Germplasm[\s\S]*none/);
    assert.equal(await page.locator("#detailBody .chip-unlink").count(), 0, "no × outside unlink mode");

    await page.locator("#unlinkModeBtn").click();
    await page.waitForTimeout(200);
    assert.deepEqual(await page.locator("#detailBody .chip-unlink").evaluateAll((b) => b.map((x) => (x as HTMLElement).dataset.uri)), ["exp-a", "exp-b"], "only the experiments get ×, not the chips inside");

    await page.evaluate(() => openNode({ id: "so-lone", type: "scientific_object", label: "Lone" }));
    await page.waitForTimeout(400);
    assert.match(await page.locator("#detailBody").innerText(), /Not in any experiment\. Germplasm and parent can only be set inside an experiment\./);
  });
});

test("e2e: no '+ Add' in boxes — germplasm is added through the selection (search -> Link selection); × in unlink mode removes it in THAT experiment", async () => {
  await withServerAndBrowser(async (base, page) => {
    const puts: any[] = [];
    let germ = [{ id: "g-annika", type: "germplasm", label: "Annika" }];
    const detail = () => ({
      uri: "so-1", actions: ["delete", "link"], deleteRemovesLinks: true,
      relations: [{ label: "In experiments", field: "experiment", items: [{
        id: "exp-b", type: "experiment", label: "Barley 2026",
        groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: germ }, { label: "Part of", items: [] }],
      }] }],
    });
    await page.route("**/api/germplasm", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "g-annika", type: "germplasm", label: "Annika" }, { id: "g-arild", type: "germplasm", label: "Arild" },
    ]) }));
    await stubSearch(page, () => [{ type: "germplasm", total: 1, items: [{ id: "g-arild", type: "germplasm", label: "Arild" }] }]);
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail()) }));
    const links: any[] = [];
    await page.route("**/api/link", (r) => { links.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 1, alreadyLinked: 0 }) }); });
    await page.route("**/api/node", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      puts.push(b);
      if (b.unlink) germ = germ.filter((g) => g.id !== b.unlink.uri);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "so-1", type: "scientific_object", label: "Plot 1", relations: detail().relations }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "so-1", type: "scientific_object", label: "Plot 1" }));
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#detailBody .box-add").count(), 0, "no second mechanic in the boxes");

    // Select the object (its title), find the germplasm with the search bar, ctrl-click it, then Link selection.
    await page.locator("#selfChip").click();
    await typeSearch(page, "Ari");
    await page.locator("#rowlist .row", { hasText: "Arild" }).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(links.length, 0, "picking only selects");
    assert.equal((await page.locator("#linkSelectionBtn").innerText()).trim(), "Set Arild on Plot 1…");
    await page.locator("#linkSelectionBtn").click();
    await page.waitForTimeout(300);
    assert.deepEqual(links[0].items.map((i: any) => i.id).sort(), ["g-arild", "so-1"]);

    await page.locator("#unlinkModeBtn").click();
    await page.waitForTimeout(200);
    await page.locator("#detailBody .item-box .chip-unlink[data-uri='g-annika']").click();
    await page.waitForTimeout(400);
    assert.deepEqual(puts[0], { type: "scientific_object", id: "so-1", experiment: "exp-b", unlink: { field: "hasGermplasm", uri: "g-annika" } });
  });
});

test("e2e: after linking objects into an experiment, the action bar offers their germplasm from other experiments — nothing picked; confirm writes only the pick; Skip writes nothing", async () => {
  await withServerAndBrowser(async (base, page) => {
    const puts: any[] = [];
    const offer = (value: string, label: string, from: string) => ({
      type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B", experimentLabel: "Barley 2027",
      field: "hasGermplasm", value, valueType: "germplasm", valueLabel: label, from,
    });
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, carryOver: [offer("g-annika", "Annika", "Barley 2025"), offer("g-arild", "Arild", "Barley 2026")],
    }) }));
    await page.route("**/api/node", (r) => { puts.push(JSON.parse(r.request().postData() || "{}")); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ relations: [] }) }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    const link = () => page.evaluate(() => linkItems([{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }]));

    await link();
    await page.waitForTimeout(400);
    const bar = async () => (await page.locator("#actionbar").innerText()).replace(/\s+/g, " ");
    assert.match(await bar(), /Barley 2027 now has Plot 1, without its germplasm from other experiments\. Copy any over\?/);
    assert.deepEqual((await page.locator("#linkList .linkmenu-items .newmenu-item").allTextContents()).map((t) => t.trim()),
      ["Annika → Plot 1 (from Barley 2025)", "Arild → Plot 1 (from Barley 2026)"]);
    assert.equal(await page.locator(".linkmenu-confirm").count(), 0, "nothing picked, nothing to confirm");
    await page.locator("#linkList .newmenu-item", { hasText: "Arild" }).click();
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Carry over 1");
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(400);
    assert.deepEqual(puts, [{ type: "scientific_object", id: "so-1", experiment: "exp-B", link: { field: "hasGermplasm", uris: ["g-arild"] } }]);
    assert.doesNotMatch(await bar(), /Copy any over/);

    await link();
    await page.waitForTimeout(400);
    await page.locator("#carryOverSkipBtn").click();
    await page.waitForTimeout(200);
    assert.equal(puts.length, 1, "Skip writes nothing");
    assert.doesNotMatch(await bar(), /Copy any over/);
  });
});

test("e2e: a PHIS name containing HTML is shown as text everywhere (rows, title, chips, boxes, search) — never run", async () => {
  await withServerAndBrowser(async (base, page) => {
    const evil = `<img src=x onerror="window.__pwned=1">Evil`;
    await page.route("**/api/germplasm", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "g-evil", type: "germplasm", label: evil }]) }));
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      uri: "so-1", actions: ["delete", "link"], deleteRemovesLinks: true,
      relations: [{ label: "In experiments", field: "experiment", items: [{ id: "exp-b", type: "experiment", label: evil,
        groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [{ id: "g-x", type: "germplasm", label: evil }] }] }] }],
    }) }));
    await stubSearch(page, () => [{ type: "germplasm", total: 1, items: [{ id: "g-evil", type: "germplasm", label: evil }] }]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "so-1", type: "scientific_object", label: "Plot 1" }));
    await page.waitForTimeout(400);
    await page.locator("#selfChip").click();
    await typeSearch(page, "Ev");
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined, "no injected handler ran");
    assert.equal(await page.locator("#detailBody img, #actionbar img").count(), 0);
    assert.match(await page.locator("#detailBody .item-box").innerText(), /<img src=x/);
    assert.match(await page.locator("#rowlist").innerText(), /<img src=x/);

    // List rows, the node title and the selection summary too.
    await page.evaluate((l) => openNode({ id: "g-evil", type: "germplasm", label: l }), evil);
    await page.waitForTimeout(400);
    await page.locator("#selfChip").click();
    await page.waitForTimeout(200);
    await page.evaluate(() => navigateTo([path[0], ROOT.find((r: any) => r.label === "Trials"), { id: "cat-germplasm", type: "category", label: "Germplasm" }]));
    await page.waitForTimeout(400);
    assert.match(await page.locator("#rowlist").innerText(), /<img src=x/);
    assert.equal(await page.locator("img").count(), 0, "no <img> anywhere on the page");
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined);
  });
});

test("e2e: linking objects + a germplasm asks which experiment (nothing picked) when they're in several, and 'add to one first' when in none — then continues", async () => {
  await withServerAndBrowser(async (base, page) => {
    const posts: any[] = [];
    let objectsPlaced = false;
    await page.route("**/api/experiments", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "exp-a", type: "experiment", label: "Barley 2025" }, { id: "exp-b", type: "experiment", label: "Barley 2026" },
    ]) }));
    await page.route("**/api/link", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      posts.push(b);
      const json = (x: unknown) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(x) });
      const ids = b.items.map((i: any) => i.id);
      if (ids.includes("so-lone") && ids.includes("g-annika") && !objectsPlaced) return json({ needsExperiment: { notInAny: [{ id: "so-lone", label: "Lone plot" }] } });
      if (ids.includes("so-lone") && ids.includes("exp-b")) { objectsPlaced = true; return json({ ok: true, linkedPairs: 1, alreadyLinked: 0 }); }
      if (ids.includes("so-two") && !b.experiments) return json({ needsExperiment: { notInAny: [], experiments: [{ id: "exp-a", label: "Barley 2025", objects: 1 }, { id: "exp-b", label: "Barley 2026", objects: 1 }], objects: 1 } });
      return json({ ok: true, linkedPairs: 1, alreadyLinked: 0, touched: b.experiments ?? ["exp-b"] });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    const bar = async () => (await page.locator("#actionbar").innerText()).replace(/\s+/g, " ");
    const rows = async () => (await page.locator("#linkList .linkmenu-items .newmenu-item").allTextContents()).map((t) => t.trim());

    // Several experiments: the list, nothing picked; confirming sends only the pick.
    await page.evaluate(() => linkItems([{ type: "scientific_object", id: "so-two" }, { type: "germplasm", id: "g-annika" }]));
    await page.waitForTimeout(400);
    assert.match(await bar(), /Germplasm is kept per experiment, and this one is in several\. Set it in which experiment\(s\)\?/);
    assert.deepEqual(await rows(), ["Barley 2025 · 1 scientific object", "Barley 2026 · 1 scientific object"]);
    assert.equal(await page.locator(".linkmenu-confirm").count(), 0, "nothing picked");
    await page.locator("#linkList .newmenu-item", { hasText: "Barley 2026" }).click();
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Set in 1 experiment");
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(400);
    assert.deepEqual(posts.at(-1).experiments, ["exp-b"]);
    assert.doesNotMatch(await bar(), /which experiment/);

    // In none: add it to an experiment first, then the original link goes through.
    posts.length = 0;
    await page.evaluate(() => linkItems([{ type: "scientific_object", id: "so-lone" }, { type: "germplasm", id: "g-annika" }]));
    await page.waitForTimeout(400);
    assert.match(await bar(), /Lone plot isn't in any experiment yet, and germplasm is set per experiment\. Add it to one first\?/);
    await page.locator("#linkList .newmenu-item", { hasText: "Barley 2026" }).click();
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Add to 1 experiment");
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(600);
    assert.deepEqual(posts.map((p) => p.items.map((i: any) => i.id)), [["so-lone", "g-annika"], ["so-lone", "exp-b"], ["so-lone", "g-annika"]]);
    assert.doesNotMatch(await bar(), /any experiment yet/);
  });
});

test("e2e: ctrl-clicking a relation chip adds it to the current selection instead of navigating", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (route) => {
      const url = new URL(route.request().url());
      const type = url.searchParams.get("type");
      const relations =
        type === "organization"
          ? [{ label: "Facilities", field: "facilities", items: [{ id: "mock-fac-1", type: "facility", label: "Mock Facility" }] }]
          : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "mock-uri", relations }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    // Pre-select a real Experiment first — ctrl-clicking the chip below must ADD to this,
    // never replace it (same reasoning as the simulated graph panel's pick behavior).
    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "Trials");
    await page.waitForTimeout(200);
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    const preExistingLabel = await page.locator(".selection-summary .selection-names").textContent();

    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "People");
    await page.waitForTimeout(200);
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);

    await page.locator(".chip[data-openid='mock-fac-1']").click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);

    // Stayed put — no navigation happened (the breadcrumb never grew to include the chip).
    const crumbs = await page.locator(".crumb").allTextContents();
    assert.doesNotMatch(crumbs.join(" "), /Mock Facility/);

    // Both the pre-existing pick and the new chip are in the selection (added, not replaced).
    const summary = await page.locator(".selection-summary .selection-names").textContent();
    assert.match(summary ?? "", /Mock Facility/);
    assert.match(summary ?? "", new RegExp(preExistingLabel!.split(",")[0].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    // Chip itself reflects the selection.
    assert.ok(await page.locator(".chip[data-openid='mock-fac-1']").evaluate((el) => el.classList.contains("selected")));
  });
});

test("e2e: unlinking a relation from one side drops the OTHER side's cached detail too, so navigating back shows the change without a full reload", async () => {
  // Regression test for a real bug: unlinkOne only refreshed NODE_DETAIL for the node the
  // unlink button was clicked on, never the other end of the relation — so going back to that
  // other node kept showing the removed link (loadNodeDetail skips fetching anything already
  // cached) until the whole page was reloaded.
  await withServerAndBrowser(async (base, page) => {
    let parentId: string | null = null;
    let parentFetchCount = 0;
    await page.route("**/api/node-detail*", (route) => {
      const url = new URL(route.request().url());
      const id = url.searchParams.get("id")!;
      if (id === "mock-child-uri") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            uri: id,
            relations: [{ label: "Parent organizations", field: "parents", items: [{ id: parentId, type: "organization", label: "Mock Parent Org" }] }],
          }),
        });
      }
      parentId = id;
      parentFetchCount++;
      // First time through, the parent still has the child. After the unlink (which happens
      // from the child's own detail pane), a real refetch would no longer include it.
      const relations = parentFetchCount === 1
        ? [{ label: "Child organizations", field: "children", items: [{ id: "mock-child-uri", type: "organization", label: "Mock Child Org" }] }]
        : [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: id, relations }) });
    });
    await page.route("**/api/node", (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "mock-child-uri", type: "organization", label: "Mock Child Org", relations: [] }),
      });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);
    assert.match(await page.locator("#detailBody").textContent() ?? "", /Mock Child Org/);

    // Follow the child relation, then unlink the parent from the child's own detail pane.
    await page.locator(".chip[data-openid='mock-child-uri']").click();
    await page.waitForTimeout(400);
    assert.match(await page.locator("#detailBody").textContent() ?? "", /Mock Parent Org/);
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);
    await page.locator(".chip-unlink").click();
    await page.waitForTimeout(300);

    // Navigate back to the parent — its cache must have been dropped by the unlink above.
    await page.locator(".crumb", { hasText: "Organizations" }).click();
    await page.waitForTimeout(300);
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);

    assert.equal(parentFetchCount, 2, "expected the parent's detail to be refetched, not served from a stale cache");
    assert.doesNotMatch(await page.locator("#detailBody").textContent() ?? "", /Mock Child Org/);
  });
});

test("e2e: a site down to its LAST organization can't unlink it — the unlink view offers deleting the site instead, naming every link it removes", async () => {
  // A site can't exist without an organization (OpenSILEX refuses the unlink), so without this
  // the site was undeletable: Delete routed to unlink mode, and unlink mode could never finish.
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uri: "mock-site",
          relations: [
            { label: "Organizations", field: "organizations", items: [{ id: "mock-org", type: "organization", label: "Mock Only Org" }] },
            { label: "Facilities", field: "facilities", items: [{ id: "mock-fac", type: "facility", label: "Mock Fac" }] },
          ],
        }),
      })
    );
    let deleted: string | null = null;
    await page.route("**/api/node?*", (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deleted = new URL(route.request().url()).searchParams.get("id");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    let confirmText = "";
    page.on("dialog", (d) => { confirmText = d.message(); d.accept(); });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Setup");
    await openRow(page, "Sites");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);

    // Only the facility is unlinkable; the last org has no × and the banner says why.
    assert.equal(await page.locator(".chip-unlink").count(), 1);
    assert.equal(await page.locator(".chip[data-openid='mock-org'] .chip-unlink").count(), 0);
    assert.match((await page.locator(".unlink-intro").textContent()) ?? "", /must belong to at least one organization.*Mock Only Org/s);

    await page.locator("#forceDeleteBtn").click();
    await page.waitForTimeout(300);
    assert.match(confirmText, /Mock Only Org/);
    assert.match(confirmText, /Mock Fac/);
    assert.ok(deleted, "expected a real DELETE, not another redirect into unlink mode");
    assert.match((await page.locator("#toast").textContent()) ?? "", /Deleted/);
  });
});

test("e2e: '+ New' → experiment from a selected organization opens a form (not a name prompt) and posts its fields", async () => {
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: any = null;
    await page.route("**/api/create", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "phis:id/experiment/mock", type: "experiment", label: "Mock Exp" }) });
    });
    let sawPrompt = false;
    page.on("dialog", (d) => { sawPrompt = true; d.dismiss(); });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "experiment" }).click();

    const form = page.locator("dialog.create-dialog");
    await form.waitFor({ state: "visible" });
    // Required fields are enforced by the browser: Create with an empty form does nothing.
    await form.locator("button[value=ok]").click();
    assert.equal(capturedBody, null);
    await form.locator("input[name=name]").fill("Mock Exp");
    await form.locator("input[name=objective]").fill("Test objective");
    await form.locator("input[name=start_date]").fill("2026-10-01");
    await form.locator("button[value=ok]").click();
    await page.waitForTimeout(300);

    assert.equal(sawPrompt, false, "experiment must use the form, not prompt()");
    assert.equal(capturedBody.type, "experiment");
    assert.equal(capturedBody.name, "Mock Exp");
    assert.deepEqual(capturedBody.fields, { objective: "Test objective", start_date: "2026-10-01" });
    assert.equal(capturedBody.links.length, 1);
    assert.equal(capturedBody.links[0].type, "organization");
    assert.equal(await page.locator("dialog.create-dialog").count(), 0, "form removed after submit");
  });
});

test("e2e: '+ New' → scientific object from ONE selected experiment: form has a Type dropdown from OpenSILEX's classes, posts experiment + rdf_type", async () => {
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: any = null;
    await page.route("**/api/create", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "phis:id/so/mock", type: "scientific_object", label: "Mock Plant" }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "scientific object" }).click();

    const form = page.locator("dialog.create-dialog");
    await form.waitFor({ state: "visible" });
    // Real options, from the real /api/scientific-object-types (read-only).
    const optionCount = await form.locator("select[name=rdf_type] option").count();
    assert.ok(optionCount > 1, "dropdown should list OpenSILEX's scientific-object classes");
    // A REAL mouse press on the select must not be swallowed (the page-wide marquee mousedown
    // handler used to preventDefault it, so the native dropdown never opened — selectOption()
    // alone doesn't catch that). A swallowed mousedown also never focuses the control.
    const box = (await form.locator("select[name=rdf_type]").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    assert.equal(await page.evaluate(() => (document.activeElement as HTMLElement)?.getAttribute("name")), "rdf_type", "pressing the select must focus it");
    await form.locator("input[name=name]").fill("Mock Plant");
    const value = await form.locator("select[name=rdf_type] option").nth(1).getAttribute("value");
    await form.locator("select[name=rdf_type]").selectOption(value!);
    await form.locator("button[value=ok]").click();
    await page.waitForTimeout(300);

    assert.equal(capturedBody.type, "scientific_object");
    assert.deepEqual(capturedBody.fields, { rdf_type: value });
    assert.equal(capturedBody.links.length, 1);
    assert.equal(capturedBody.links[0].type, "experiment");
  });
});

test("e2e: '+ New' → scientific object with TWO experiments selected creates it in both (one form, both links posted)", async () => {
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: any = null;
    await page.route("**/api/create", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "phis:id/so/mock", type: "scientific_object", label: "Mock Plant" }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").nth(0).click();
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "scientific object" }).click();
    const form = page.locator("dialog.create-dialog");
    await form.waitFor({ state: "visible" });
    await form.locator("input[name=name]").fill("Mock Plant");
    const value = await form.locator("select[name=rdf_type] option").nth(1).getAttribute("value");
    await form.locator("select[name=rdf_type]").selectOption(value!);
    await form.locator("button[value=ok]").click();
    await page.waitForTimeout(300);
    assert.equal(capturedBody.links.length, 2);
    assert.ok(capturedBody.links.every((l: any) => l.type === "experiment"));
  });
});

test("e2e: the Scientific Objects page shows a collapsible 'How scientific objects work' box, and remembers it open", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Scientific Objects");
    const box = page.locator("details.type-info");
    assert.match((await box.locator("summary").textContent()) ?? "", /How scientific objects work/);
    assert.equal(await box.evaluate((d: HTMLDetailsElement) => d.open), false, "collapsed by default");
    await box.locator("summary").click();
    assert.match((await box.textContent()) ?? "", /is kept separately, so a change in one experiment never alters another/);
    await page.waitForTimeout(200); // "toggle" fires async — let it be stored before reloading

    await page.reload();
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Scientific Objects");
    assert.equal(await page.locator("details.type-info").evaluate((d: HTMLDetailsElement) => d.open), true, "open state remembered");
  });
});

test("e2e: opening a real experiment shows its relations as chips with Rename and Delete", async () => {
  // Hits the real backend + real OpenSILEX read path (no mock) — read-only, nothing clicked.
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(1500);

    const actions = await page.evaluate(() => NODE_DETAIL[path[path.length - 1].id]?.actions);
    assert.deepEqual(actions, ["rename", "delete", "link"]);
    assert.equal(await page.locator("#renameNodeBtn").count(), 1);
    assert.equal(await page.locator("#deleteNodeBtn").count(), 1);
  });
});

test("e2e: deleting an experiment that holds scientific objects: banner explains; 'Clear' deletes the only-here one, only REMOVES the shared one, then the experiment's own confirm follows", async () => {
  await withServerAndBrowser(async (base, page) => {
    let cleared = false;
    let openExp = "";
    const calls: string[] = [];
    await page.route("**/api/node-detail*", (r) => {
      const u = new URL(r.request().url());
      const type = u.searchParams.get("type"), id = u.searchParams.get("id");
      const json = (body: unknown) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (type === "scientific_object") {
        const exps = [{ id: openExp, type: "experiment", label: "This Exp" }];
        if (id === "so-shared") exps.push({ id: "exp-other", type: "experiment", label: "Other Exp" });
        return json({ uri: id, actions: ["delete", "link"], relations: [{ label: "Experiments", field: "experiment", items: exps }] });
      }
      if (type !== "experiment") return json({ uri: "x", actions: [], relations: [] });
      openExp = id!;
      const relations: any[] = [{ label: "Organizations", field: "organisations", items: [{ id: "mock-org", type: "organization", label: "Mock Org" }] }];
      if (!cleared) relations.push({ label: "Scientific objects", field: "scientific_object", blocksDelete: true, items: [
        { id: "so-only", type: "scientific_object", label: "Only Plant" },
        { id: "so-shared", type: "scientific_object", label: "Shared Plant" },
      ] });
      return json({ uri: id, actions: ["rename", "delete", "link"], deleteRemovesLinks: true, relations });
    });
    await page.route("**/api/elsewhere*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ "so-shared": [{ id: "exp-other", label: "Other Exp" }] }) }));
    await page.route("**/api/node*", (r) => {
      const req = r.request();
      if (req.url().includes("node-detail")) return r.fallback();
      if (req.method() === "DELETE") calls.push("DELETE " + new URL(req.url()).searchParams.get("type") + ":" + new URL(req.url()).searchParams.get("id"));
      else if (req.method() === "PUT") calls.push("UNLINK " + req.postDataJSON().unlink.uri);
      if (calls.length === 2) cleared = true;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, relations: [] }) });
    });
    const confirms: string[] = [];
    page.on("dialog", (d) => { confirms.push(d.message()); d.accept(); });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(500);
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(300);

    assert.match((await page.locator(".unlink-intro-text").textContent()) ?? "", /CAN'T DELETE YET.*holds 2 scientific objects.*orphaned/s);
    // Each blocker chip is individually removable (× = remove from this experiment only).
    assert.equal(await page.locator(".chip[data-openid='so-shared'] .chip-unlink").count(), 1);
    await page.locator("#deleteBlockersBtn").click();
    await page.waitForTimeout(1000);

    assert.match(confirms[0], /Only Plant — only here: deleted from PHIS entirely/);
    assert.match(confirms[0], /Shared Plant — also in Other Exp: removed from .* only, kept there/);
    assert.deepEqual(calls, ["DELETE scientific_object:so-only", "UNLINK so-shared", `DELETE experiment:${openExp}`]);
    assert.match(confirms[1], /unlinked from: Mock Org/);
  });
});

test("e2e: a type whose Delete takes its links along (e.g. scientific object) gets an 'Unlink…' button — the only way to take it out of one experiment", async () => {
  await withServerAndBrowser(async (base, page) => {
    let unlinked: any = null;
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      uri: "x", actions: ["delete", "link"], deleteRemovesLinks: true,
      relations: [{ label: "Experiments", field: "experiment", items: [{ id: "exp-a", type: "experiment", label: "Exp A" }, { id: "exp-b", type: "experiment", label: "Exp B" }] }],
    }) }));
    await page.route("**/api/node", (r) => {
      if (r.request().method() !== "PUT") return r.fallback();
      unlinked = r.request().postDataJSON().unlink;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ relations: [{ label: "Experiments", field: "experiment", items: [{ id: "exp-b", type: "experiment", label: "Exp B" }] }] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row .row-nav").first().click(); // any node — detail is mocked
    await page.waitForTimeout(500);

    assert.match((await page.locator("#deleteNodeBtn").textContent()) ?? "", /^Delete$/, "Delete itself goes straight to a confirm");
    await page.locator("#unlinkModeBtn").click();
    await page.waitForTimeout(200);
    assert.match((await page.locator(".unlink-intro-text").textContent()) ?? "", /remove any link below/);
    await page.locator(".chip[data-openid='exp-a'] .chip-unlink").click();
    await page.waitForTimeout(300);
    assert.deepEqual(unlinked, { field: "experiment", uri: "exp-a" });
    assert.doesNotMatch((await page.locator("#detailBody").textContent()) ?? "", /Exp A/);
  });
});

test("e2e: the open node's own title is a selectable chip — plain click selects only it, ctrl toggles it", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", relations: [] }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    const rows = page.locator("#rowlist .row");
    const otherId = await rows.nth(1).getAttribute("data-id");
    await rows.nth(0).locator(".row-nav").click(); // navigate INTO org 0: it leaves the row list
    await page.waitForTimeout(400);
    const openId = await page.evaluate(() => path[path.length - 1].id);
    // Pre-select some other org, as if picked up elsewhere.
    await page.evaluate((id) => selection.set(id, findItemById(id)), otherId);

    const self = page.locator("#selfChip");
    await self.click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    let ids = await page.evaluate(() => [...selection.keys()]);
    assert.deepEqual(new Set(ids), new Set([otherId, openId]), "ctrl adds without touching the rest");
    assert.match((await page.locator("#selfChip").getAttribute("class")) ?? "", /selected/);

    await page.locator("#selfChip").click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    ids = await page.evaluate(() => [...selection.keys()]);
    assert.deepEqual(ids, [otherId], "ctrl again removes only itself");

    await page.locator("#selfChip").click();
    await page.waitForTimeout(200);
    ids = await page.evaluate(() => [...selection.keys()]);
    assert.deepEqual(ids, [openId], "plain click replaces the selection with just this node");
  });
});

test("e2e: opening a node from the selection TREE (local detail) fetches its relations instead of showing 'No connections found'", async () => {
  await withServerAndBrowser(async (base, page) => {
    let fetched = 0;
    await page.route("**/api/node-detail*", (r) => {
      fetched++;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", relations: [
        { label: "Child organizations", items: [{ id: "mock-child", type: "organization", label: "Mock Child" }] }] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    // The tree is always visible along the bottom now — no switch.
    await page.locator("#treeArea .row .row-nav").last().click(); // the tree row's open arrow
    await page.waitForTimeout(500);

    assert.equal(fetched, 1);
    assert.match((await page.locator("#detailBody").textContent()) ?? "", /Mock Child/);
  });
});

test("e2e: selecting two existing, different-typed adjacent nodes offers \"Link selection\", which calls /api/link", async () => {
  // POST /api/link is intercepted — same reasoning as the other creation/mutation tests above.
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: unknown = null;
    await page.route("**/api/link", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 1 }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select one real Organization.
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    // No link button yet — only one node selected.
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);

    // Ctrl-click one real Facility in too — organization and facility are adjacent.
    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "Setup");
    await page.waitForTimeout(200);
    await openRow(page, "Facilities");
    await page.locator("#rowlist .row").first().click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);

    const linkBtn = page.locator("#linkSelectionBtn");
    await linkBtn.waitFor({ state: "visible" });
    await linkBtn.click();
    await page.waitForTimeout(300);

    assert.ok(capturedBody, "expected POST /api/link to fire");
    const { items } = capturedBody as { items: { type: string }[] };
    assert.deepEqual(new Set(items.map((i) => i.type)), new Set(["organization", "facility"]));
    assert.match((await page.locator("#toast").textContent()) ?? "", /Linked 1 relation\b/);
  });
});

test("e2e: two of a type WITHOUT parent/child (facilities) offer no \"Link selection\" and say why; two organizations open the ranking list", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Setup");
    await openRow(page, "Facilities");
    await page.locator("#rowlist .row").nth(0).click();
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar .link-why").innerText(), /Two facilities can't be linked to each other/);

    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").nth(0).click();
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    await page.locator("#linkSelectionBtn").click();
    await page.locator(".ranking-modal").waitFor({ state: "visible" });
    assert.equal(await page.locator('.ranking-zone[data-zone="children"] .ranking-row').count(), 1, "the first selected is the anchor, the other its child");
  });
});

test("e2e: Link selection with 3 objects: flexible anchor — 'make anchor' swaps, then one drag gives three levels in one round", async () => {
  await withServerAndBrowser(async (base, page) => {
    const posts: any[] = [];
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", actions: ["delete", "link"], relations: [] }) }));
    await page.route("**/api/parent", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      posts.push(b);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 2, written: b.pairs.map((p: any) => ({ ...p, experiments: ["Wheat 2025"], only: true })) }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      for (const it of [{ id: "plant", label: "Plant A" }, { id: "row", label: "Row 1" }, { id: "field", label: "Field East" }]) selection.set(it.id, { ...it, type: "scientific_object" });
      refreshLeftPane(); renderActionbar();
    });
    await page.locator("#linkSelectionBtn").click();
    await page.locator(".ranking-modal").waitFor({ state: "visible" });
    assert.match(await page.locator(".ranking-anchor").innerText(), /Plant A/, "first selected starts as the anchor");

    await page.locator(".ranking-row", { hasText: "Row 1" }).locator(".make-anchor").click();
    assert.match(await page.locator(".ranking-anchor").innerText(), /Row 1/);
    const zone = (z: string) => page.locator(`.ranking-zone[data-zone="${z}"] .ranking-row`).allTextContents().then((t) => t.map((x) => x.replace("make anchor", "").trim()).sort());
    assert.deepEqual(await zone("children"), ["Field East", "Plant A"], "the old anchor dropped in as a child");

    await page.evaluate(() => {
      const dt = new DataTransfer();
      const source = [...document.querySelectorAll(".ranking-row")].find((r) => r.textContent!.includes("Field East")) as HTMLElement;
      const target = document.querySelector('.ranking-zone[data-zone="parents"]') as HTMLElement;
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    });
    await page.locator("#rankingConfirm").click();
    await page.waitForTimeout(400);
    assert.deepEqual(posts[0].pairs.map((p: any) => `${p.child}<${p.parent}`).sort(), ["plant<row", "row<field"], "Field East > Row 1 > Plant A in one round");
  });
});

test("e2e: Unlink selection names every link in a confirm before removing; cancelling writes nothing", async () => {
  await withServerAndBrowser(async (base, page) => {
    const posts: any[] = [];
    const dialogs: string[] = [];
    let accept = false;
    page.on("dialog", (d) => { dialogs.push(d.message()); accept ? d.accept() : d.dismiss(); });
    await page.route("**/api/unlink", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      posts.push(b);
      const body = b.confirm ? { removed: ["Plant B is part of Row 2 in Wheat 2026"], touched: ["exp"] } : { links: ["Plant B is part of Row 2 in Wheat 2026"] };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      selection.set("plant-b", { id: "plant-b", type: "scientific_object", label: "Plant B" });
      selection.set("row-2", { id: "row-2", type: "scientific_object", label: "Row 2" });
      refreshLeftPane(); renderActionbar();
    });
    await page.locator("#unlinkSelectionBtn").click();
    await page.waitForTimeout(300);
    assert.match(dialogs[0], /Remove this link\?\s+• Plant B is part of Row 2 in Wheat 2026/);
    assert.equal(posts.filter((p) => p.confirm).length, 0, "cancelled: nothing removed");

    accept = true;
    await page.locator("#unlinkSelectionBtn").click();
    await page.waitForTimeout(400);
    assert.equal(posts.filter((p) => p.confirm).length, 1);
    assert.match((await page.locator("#toast").textContent()) ?? "", /Removed: Plant B is part of Row 2 in Wheat 2026/);
  });
});

test("e2e: a selection with something that fits nothing else offers no \"Link selection\" and names it", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      selection.set("so-1", { id: "so-1", type: "scientific_object", label: "Plot 1" });
      selection.set("g-1", { id: "g-1", type: "germplasm", label: "Annika" });
      selection.set("prj-1", { id: "prj-1", type: "project", label: "Big project" });
      refreshLeftPane(); renderActionbar();
    });
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar .link-why").innerText(), /Big project \(project\) can't be linked to anything else selected/);
  });
});

test("e2e: selecting several facilities plus one organization offers \"Link selection\" and sends every item", async () => {
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: unknown = null;
    await page.route("**/api/link", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 3 }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);

    await openRow(page, "Setup");
    await openRow(page, "Facilities");
    await page.locator("#rowlist .row").nth(0).click();
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(2).click({ modifiers: ["Control"] });
    await page.waitForTimeout(150);

    await page.locator(".crumb", { hasText: "Graph" }).click(); await openRow(page, "People");
    await page.waitForTimeout(200);
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);

    const linkBtn = page.locator("#linkSelectionBtn");
    await linkBtn.waitFor({ state: "visible" });
    await linkBtn.click();
    await page.waitForTimeout(300);

    const { items } = capturedBody as { items: { type: string }[] };
    assert.equal(items.length, 4);
    assert.equal(items.filter((i) => i.type === "facility").length, 3);
    assert.equal(items.filter((i) => i.type === "organization").length, 1);
    assert.match((await page.locator("#toast").textContent()) ?? "", /Linked 3 relations\b/);
  });
});


test("e2e: picker popover (an app question) follows the same click/ctrl rules as every list — plain click REPLACES, ctrl toggles", async () => {
  await withServerAndBrowser(async (base, page) => {
    const offer = (value: string, label: string) => ({
      type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B", experimentLabel: "Barley 2027",
      field: "hasGermplasm", value, valueType: "germplasm", valueLabel: label, from: "Barley 2025",
    });
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, carryOver: [offer("g-a", "Annika"), offer("g-b", "Arild"), offer("g-c", "Brage")],
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => linkItems([{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }]));
    await page.waitForTimeout(400);
    const rows = page.locator("#linkList .linkmenu-items .newmenu-item");
    const picked = () => page.locator("#linkList .linkmenu-items .newmenu-item.selected").count();
    await rows.nth(0).click();
    await rows.nth(1).click();
    assert.equal(await picked(), 1, "plain click replaces");
    await rows.nth(2).click({ modifiers: ["Control"] });
    assert.equal(await picked(), 2, "ctrl adds");
    await rows.nth(1).click({ modifiers: ["Control"] });
    assert.equal(await picked(), 1, "ctrl removes");
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Carry over 1");
  });
});

test("e2e: one organization selected + more ctrl-clicked in the list -> Link selection opens the ranking modal instead of linking blindly", async () => {
  await withServerAndBrowser(async (base, page) => {
    const putCalls: { type: string; id: string; link: { field: string; uris: string[] } }[] = [];
    await page.route("**/api/node", (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      putCalls.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "x", type: "organization", label: "x" }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    // More organizations join the selection with ctrl-click — the same rule as everywhere.
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.locator("#rowlist .row").nth(2).click({ modifiers: ["Control"] });
    await page.waitForTimeout(300);
    await page.locator("#linkSelectionBtn").click(); // three organizations selected -> ranking
    await page.waitForTimeout(300);

    // Same-type parent/child opens the ranking modal instead of linking blindly — no PUT yet.
    assert.equal(putCalls.length, 0);
    await page.locator(".ranking-modal").waitFor({ state: "visible" });
    assert.equal(await page.locator('.ranking-zone[data-zone="children"] .ranking-row').count(), 2);
    assert.equal(await page.locator('.ranking-zone[data-zone="parents"] .ranking-row').count(), 0);

    // Drag one row from Children up into Parents. Playwright's locator.dragTo() simulates
    // mouse movement, which isn't reliable for native HTML5 drag-and-drop in headless
    // Chromium — dispatch the real DragEvents (with a real DataTransfer) directly instead.
    await page.evaluate(() => {
      const dt = new DataTransfer();
      const source = document.querySelector('.ranking-zone[data-zone="children"] .ranking-row') as HTMLElement;
      const target = document.querySelector('.ranking-zone[data-zone="parents"]') as HTMLElement;
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      source.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: dt }));
    });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.ranking-zone[data-zone="parents"] .ranking-row').count(), 1);
    assert.equal(await page.locator('.ranking-zone[data-zone="children"] .ranking-row').count(), 1);

    await page.locator("#rankingConfirm").click();
    await page.waitForTimeout(300);

    // One batched PUT to the anchor for the parent, one PUT to the remaining org (as owner of
    // its own `parents`) for the child — two calls, two different owners.
    assert.equal(putCalls.length, 2);
    const anchorCall = putCalls.find((c) => c.link.uris.length === 1 && c.link.field === "parents");
    assert.ok(anchorCall);
    assert.match((await page.locator("#toast").textContent()) ?? "", /Ranked 2 organizations/);
    assert.equal(await page.locator("#linkRankingOverlay").evaluate((el) => el.classList.contains("open")), false);
  });
});

test("e2e: one object selected + other objects added -> Link selection -> the ranking modal with ONE parent slot (a second drop swaps it out) -> /api/parent pairs; asks which experiment when needed", async () => {
  await withServerAndBrowser(async (base, page) => {
    const posts: any[] = [];
    await page.route("**/api/scientific-objects", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "plot", type: "scientific_object", label: "Plot 1" }, { id: "block-a", type: "scientific_object", label: "Block A" },
      { id: "block-b", type: "scientific_object", label: "Block B" }, { id: "plant", type: "scientific_object", label: "Plant 1" },
    ]) }));
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", actions: ["delete", "link"], relations: [] }) }));
    await page.route("**/api/parent", (r) => {
      const b = JSON.parse(r.request().postData() || "{}");
      posts.push(b);
      const body = b.experiments ? { ok: true, linkedPairs: 2, touched: b.experiments, written: b.pairs.slice(0, 2).map((p: any) => ({ ...p, experiments: ["Barley 2026"], only: false })) }
        : { needsExperiment: { notInAny: [], experiments: [{ id: "exp-a", label: "Barley 2025", objects: 2 }, { id: "exp-b", label: "Barley 2026", objects: 1 }], objects: 2 } };
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Scientific Objects");
    await page.locator("#rowlist .row", { hasText: "Plot 1" }).click();
    await page.waitForTimeout(200);

    for (const name of ["Block A", "Block B", "Plant 1"]) await page.locator("#rowlist .row", { hasText: name }).click({ modifiers: ["Control"] });
    await page.locator("#linkSelectionBtn").click();
    await page.locator(".ranking-modal").waitFor({ state: "visible" });
    assert.match(await page.locator(".ranking-hint").innerText(), /if Plot 1 is part of it.*one parent at most/s);
    assert.match(await page.locator('.ranking-zone[data-zone="parents"] .ranking-zone-label').innerText(), /^Plot 1 is part of \(0\)$/i);

    const drag = (label: string) => page.evaluate((l) => {
      const dt = new DataTransfer();
      const source = [...document.querySelectorAll(".ranking-row")].find((r) => r.textContent!.includes(l)) as HTMLElement;
      const target = document.querySelector('.ranking-zone[data-zone="parents"]') as HTMLElement;
      source.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      source.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
    }, label);
    await drag("Block A");
    await drag("Block B");
    await page.waitForTimeout(200);
    const zone = (z: string) => page.locator(`.ranking-zone[data-zone="${z}"] .ranking-row`).allTextContents().then((t) => t.map((x) => x.replace("make anchor", "").trim()).sort());
    assert.deepEqual(await zone("parents"), ["Block B"], "Block B swapped Block A out");
    assert.deepEqual(await zone("children"), ["Block A", "Plant 1"]);

    await page.locator("#rankingConfirm").click();
    await page.waitForTimeout(400);
    assert.equal(posts[0].type, "scientific_object");
    assert.deepEqual(posts[0].pairs.map((p: any) => `${p.child}<${p.parent}`).sort(), ["block-a<plot", "plant<plot", "plot<block-b"]);
    assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /“Part of” is kept per experiment, and these are in several\. Set it in which experiment\(s\)\?/);
    await page.locator("#linkList .newmenu-item", { hasText: "Barley 2026" }).click();
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(400);
    assert.deepEqual(posts[1].experiments, ["exp-b"]);
    assert.match((await page.locator("#toast").textContent()) ?? "", /Set what 2 scientific objects are part of: .* in .* \(Barley 2026\)/);
  });
});

test("e2e: Delete on an object with a location history explains why and points to PHIS instead of a confirm; OK closes it", async () => {
  await withServerAndBrowser(async (base, page) => {
    let dialogs = 0;
    page.on("dialog", (d) => { dialogs++; d.dismiss(); });
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      uri: "so-geo", actions: ["delete", "link"], deleteRemovesLinks: true, relations: [],
      deleteBlocked: "has a location history in PHIS (where it was placed, and when). Delete it in PHIS instead — its location history is under Events and Positions.",
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "so-geo", type: "scientific_object", label: "Geo plot" }));
    await page.waitForTimeout(400);
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(200);
    assert.equal(dialogs, 0, "no confirm");
    assert.match(await page.locator("#detailBody .unlink-intro").innerText(), /CAN'T DELETE HERE — Geo plot has a location history in PHIS.*Events and Positions/s);
    await page.locator("#deleteBlockedOkBtn").click();
    assert.equal(await page.locator("#detailBody .unlink-intro").count(), 0);
  });
});

test("e2e: after setting germplasm on a plot (Link selection), the action bar offers the objects that are part of it (nothing picked); confirming writes only the picked ones", async () => {
  await withServerAndBrowser(async (base, page) => {
    const puts: any[] = [];
    const kid = (id: string, label: string) => ({
      type: "scientific_object", id, label, experiment: "exp-b", experimentLabel: "Barley 2026",
      field: "hasGermplasm", value: "g-annika", valueType: "germplasm", valueLabel: "Annika", from: "Plot 1", parent: "plot",
    });
    const detail = { uri: "plot", actions: ["delete", "link"], deleteRemovesLinks: true, relations: [{ label: "In experiments", field: "experiment", items: [{
      id: "exp-b", type: "experiment", label: "Barley 2026",
      groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [] }, { label: "Part of", items: [] }] }] }] };
    await page.route("**/api/germplasm", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "g-annika", type: "germplasm", label: "Annika" }]) }));
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(detail) }));
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, childOffer: [kid("plant-1", "Plant 1"), kid("plant-2", "Plant 2")],
      written: [{ id: "plot", values: ["g-annika"], experiments: ["Barley 2026"], only: true }],
    }) }));
    await page.route("**/api/node", (r) => {
      puts.push(JSON.parse(r.request().postData() || "{}"));
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ relations: detail.relations }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      selection.set("plot", { id: "plot", type: "scientific_object", label: "Plot 1" });
      selection.set("g-annika", { id: "g-annika", type: "germplasm", label: "Annika" });
      refreshLeftPane(); renderActionbar();
    });
    await page.locator("#linkSelectionBtn").click();
    await page.waitForTimeout(500);

    assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /Plot 1 has 2 scientific objects that are part of it in Barley 2026, without this germplasm\. Also set it on them\?/);
    assert.deepEqual((await page.locator("#linkList .linkmenu-items .newmenu-item").allTextContents()).map((t) => t.trim()), ["Annika → Plant 1", "Annika → Plant 2"]);
    assert.equal(await page.locator(".linkmenu-confirm").count(), 0, "nothing picked");
    await page.locator("#linkList .newmenu-item", { hasText: "Plant 2" }).click();
    assert.equal((await page.locator(".linkmenu-confirm").innerText()).trim(), "Set on 1");
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(400);
    assert.deepEqual(puts, [{ type: "scientific_object", id: "plant-2", experiment: "exp-b", link: { field: "hasGermplasm", uris: ["g-annika"] } }]);
  });
});

test("e2e: objects + germplasm selected: the button says what it will write, and the message says what went where (incl. 'the only experiment')", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/scientific-objects", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([
      { id: "plot-1", type: "scientific_object", label: "Plot 1" }, { id: "plot-3", type: "scientific_object", label: "Plot 3" },
    ]) }));
    await page.route("**/api/germplasm", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "g-annika", type: "germplasm", label: "Annika" }]) }));
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", actions: ["link"], relations: [] }) }));
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 2, alreadyLinked: 0,
      written: [{ id: "plot-1", values: ["g-annika"], experiments: ["Barley 2026"], only: true }, { id: "plot-3", values: ["g-annika"], experiments: ["Barley 2026"], only: true }],
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      for (const it of [{ id: "plot-1", type: "scientific_object", label: "Plot 1" }, { id: "plot-3", type: "scientific_object", label: "Plot 3" }, { id: "g-annika", type: "germplasm", label: "Annika" }]) selection.set(it.id, it);
      renderActionbar();
    });
    assert.equal((await page.locator("#linkSelectionBtn").innerText()).trim(), "Set Annika on 2 scientific objects…", "a leftover Plot 1 shows up as '2' before clicking");
    await page.locator("#linkSelectionBtn").click();
    await page.waitForTimeout(400);
    assert.equal((await page.locator("#toast").textContent())?.trim(), "Annika set on Plot 1 and Plot 3 in Barley 2026 — the only experiment they're in");
  });
});

test("e2e: the picker popover (an app question) closes via its own × button, not just an outside click", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/link", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      ok: true, linkedPairs: 1, alreadyLinked: 0, carryOver: [{ type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B",
        experimentLabel: "Barley 2027", field: "hasGermplasm", value: "g-a", valueType: "germplasm", valueLabel: "Annika", from: "Barley 2025" }],
    }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => linkItems([{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }]));
    await page.waitForTimeout(400);
    assert.ok(await page.locator("#linkMenu").evaluate((el) => el.classList.contains("open")));
    await page.locator("#linkMenuClose").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#linkMenu").evaluate((el) => el.classList.contains("open")), false);
  });
});

test("e2e: Tabular Data (deliberately unwired) shows honest empty state, not fake data", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Data");
    await openRow(page, "Tabular Data");

    const text = await page.locator("#rowlist").textContent();
    assert.match(text ?? "", /Nothing here yet/);
  });
});

test("e2e: 'Import from an instrument…' uploads the ZIP as-is and shows the plan in PHIS terms — warnings first, species not pre-picked, nothing written", async () => {
  await withServerAndBrowser(async (base, page) => {
    let uploaded = 0;
    await page.route("**/api/import/plan", (route) => {
      uploaded = route.request().postDataBuffer()?.length ?? 0;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        instrument: "TraitFinder (PlantEye)",
        experiment: { name: "PBar1x4 – TraitFinder – 2025-10-22", startDate: "2025-10-22", exists: false },
        germplasm: { existing: [{ name: "Olve", id: "g:olve" }], missing: ["Tiril", "<b>Bad</b>"], ambiguous: [], codes: [{ name: "Olve", code: "G5" }] },
        speciesOptions: [{ id: "agrovoc:barley", label: "barley" }],
        factors: [{ name: "Replicate", levels: ["1", "2"] }],
        vocabulary: [{ uri: "x#Tray", label: "the object type Tray" }, { uri: "x#pos", label: "the plant property Position in tray" }],
        objects: { count: 4, kinds: [{ type: "tray", count: 1 }, { type: "plant", count: 3 }], sample: [{ name: "PB001", rdfType: "vocabulary:Plant", germplasm: "Olve", factors: { Replicate: "1" }, parent: "Tray 31", position: 1 }] },
        variables: { existing: ["Plant Height Max"], missing: ["NDVI Average", "Leaf inclination", "A", "B"], parts: [
          { kind: "entities", name: "Plant" }, { kind: "characteristics", name: "c1" }, { kind: "characteristics", name: "c2" }, { kind: "characteristics", name: "c3" }, { kind: "characteristics", name: "c4" },
          { kind: "units", name: "Unitless" }, { kind: "units", name: "SquareMillimeterPerSquareMillimeter", symbol: "mm²/mm²" },
        ] },
        warnings: ["On 2025-10-29 the sheet disagrees."],
      }) });
    });
    await page.goto(base);
    await page.waitForTimeout(800);
    await page.locator("#importBtn").click();
    await page.locator("#importFile").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: Buffer.from("PK-fake-zip") });
    await page.locator(".import-section").first().waitFor();
    assert.equal(uploaded, 11, "the file goes up unchanged");
    const text = (await page.locator("#importPlan").innerText()).replace(/\s+/g, " ");
    assert.match(text, /Recognised as TraitFinder \(PlantEye\)\. On 2025-10-29 the sheet disagrees\. Vocabulary/, "the warning comes before the plan");
    assert.match(text, /Adds the object type Tray and the plant property Position in tray\. Done once; later imports reuse them\./);
    assert.match(text, /Codes set: 1 \(Olve = G5\)/);
    assert.match(text, /Already in PHIS, reused: 1 \(Olve\) New: 2 \(Tiril, <b>Bad<\/b>\)/, "names from the file are shown as text");
    assert.match(text, /Replicate: 2 levels \(1, 2\)/);
    assert.match(text, /Scientific objects.* New: 4 \(1 tray and 3 plants\) \(e\.g\. PB001: Olve, Replicate 1, in Tray 31, position 1\)/);
    assert.match(text, /Variables.* Already in PHIS, reused: 1 \(Plant Height Max\) New: 4 \(NDVI Average, Leaf inclination, A, B\) Also adds what they're made of: the entity Plant, 4 characteristics and the units Unitless and SquareMillimeterPerSquareMillimeter \(mm²\/mm²\)\./);
    assert.match(text, /Nothing has been written to PHIS yet\./);
    assert.equal(await page.locator("#importSpecies").inputValue(), "", "no species chosen for the user");
    await page.locator("#importClose").click();
    assert.equal(await page.locator("#importOverlay.open").count(), 0);
  });
});

test("e2e: import confirm — the button names what it creates, waits for a species, then reports and opens the new experiment on its own path", async () => {
  await withServerAndBrowser(async (base, page) => {
    let runUrl = "";
    let imported = false;
    const exp = { id: "phis:id/experiment/new-import", type: "experiment", label: "PBar1x4 – TraitFinder – 2025-10-22" };
    await page.route("**/api/experiments", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(imported ? [exp] : []) }));
    await page.route("**/api/import/plan", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      instrument: "TraitFinder (PlantEye)",
      experiment: { name: exp.label, startDate: "2025-10-22", exists: false },
      germplasm: { existing: [], missing: ["Tiril"], ambiguous: [], codes: [] },
      speciesOptions: [{ id: "agrovoc:barley", label: "barley" }],
      factors: [{ name: "Replicate", levels: ["1"] }],
      vocabulary: [],
      variables: { existing: [], missing: ["NDVI Average"], parts: [] },
      objects: { count: 3, kinds: [{ type: "plant", count: 3 }], sample: [] },
      warnings: [],
    }) }));
    await page.route("**/api/import/run**", (route) => {
      runUrl = route.request().url();
      imported = true;
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: [{ progress: { step: "Created the experiment", done: 1, total: 6 } }, { result: { experiment: exp, created: { germplasm: 1, factors: 1, objects: 3, variables: 1, values: 1200 } } }].map((l) => JSON.stringify(l)).join("\n") + "\n" });
    });
    await page.route("**/api/node-detail**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: exp.id, actions: [], relations: [] }) }));
    await page.goto(base);
    await page.waitForTimeout(800);
    await page.locator("#importBtn").click();
    await page.locator("#importFile").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: Buffer.from("PK") });
    const btn = page.locator("#importRunBtn");
    await btn.waitFor();
    assert.equal((await btn.innerText()).trim(), "Create 1 experiment, 1 germplasm, 1 factor, 3 scientific objects and 1 variable");
    assert.equal(await btn.isDisabled(), true, "no species yet");
    await page.locator("#importSpecies").selectOption("agrovoc:barley");
    await btn.click();
    await page.locator("#importOpenBtn").waitFor();
    assert.match(runUrl, /\/api\/import\/run\?species=agrovoc%3Abarley$/);
    assert.match((await page.locator("#importFooter").innerText()).replace(/\s+/g, " "), /Created PBar1x4 – TraitFinder – 2025-10-22 with 3 scientific objects, 1 factor and 1 new germplasm; it also created 1 variable and wrote 1,200 measured values\./);
    await page.locator("#importOpenBtn").click();
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#importOverlay.open").count(), 0);
    const crumbs = (await page.locator(".crumb").allTextContents()).map((c) => c.trim());
    assert.deepEqual(crumbs, ["Graph", "Trials", "Experiments", exp.label], "lands on its canonical path, the list reloaded");
  });
});

// ---------- search ----------
async function stubSearch(page: import("playwright").Page, answer: (u: URL) => unknown, delayMs: (u: URL) => number = () => 0) {
  await page.route("**/api/search*", async (r) => {
    const u = new URL(r.request().url());
    const wait = delayMs(u);
    if (wait) await new Promise((res) => setTimeout(res, wait));
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer(u)) });
  });
}
async function typeSearch(page: import("playwright").Page, q: string) {
  await page.locator("#searchInput").fill(q);
  await page.waitForTimeout(500); // 250 ms debounce + the stubbed answer
}
const ANN = [
  { type: "experiment", total: 1, items: [{ id: "e1", type: "experiment", label: "Annika trial" }] },
  { type: "germplasm", total: 182, items: [{ id: "g1", type: "germplasm", label: "Annika" }, { id: "g2", type: "germplasm", label: "Annikki" }] },
];

test("e2e: search shows matches per type with honest counts; click selects, ctrl adds, Select all takes what is shown; Esc goes back", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, () => ANN);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    assert.equal(await page.locator("#paneTitle").textContent(), "Search: “ann”");
    const heads = await page.locator("#rowlist .search-group").allInnerTexts();
    assert.equal(heads.length, 2);
    assert.match(heads[1], /2 of 182/i);

    await page.locator("#rowlist .row", { hasText: "Annika trial" }).click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 1);
    await page.locator("#rowlist .row[data-id='g1']").click({ modifiers: ["Control"] }); // by id: "Annika" is also in "Annika trial"
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 2);

    assert.match(await page.locator("#searchSelectAll").innerText(), /Select all 3 shown/);
    assert.match(await page.locator("#paneCount").innerText(), /183 match/);
    await page.locator("#searchSelectAll").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 3);

    await page.locator("#searchInput").press("Escape");
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#paneTitle").textContent(), "Graph");
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.equal(await page.locator("#selList .sel-item").count(), 3, "leaving the search keeps the selection");
    assert.equal(await page.locator("#addToSelectionBtn").count(), 0, "\"Add to selection…\" is retired — the search bar does its job");
  });
});

test("e2e: Show more asks for the next page of that one type and appends it", async () => {
  await withServerAndBrowser(async (base, page) => {
    const urls: string[] = [];
    await stubSearch(page, (u) => {
      urls.push(u.search);
      return u.searchParams.get("type") === "germplasm"
        ? [{ type: "germplasm", total: 182, items: [{ id: "g21", type: "germplasm", label: "Annette" }] }]
        : ANN;
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    await page.locator("#rowlist .search-more").click();
    await page.waitForTimeout(300);
    assert.ok(urls.some((s) => s.includes("type=germplasm") && s.includes("page=1")));
    assert.equal(await page.locator("#rowlist .row", { hasText: "Annette" }).count(), 1);
    assert.match((await page.locator("#rowlist .search-group").allInnerTexts())[1], /3 of 182/i);
  });
});

test("e2e: a late answer to an older query is dropped", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(
      page,
      (u) => (u.searchParams.get("q") === "a" ? [{ type: "germplasm", total: 1, items: [{ id: "gs", type: "germplasm", label: "Stale" }] }] : ANN),
      (u) => (u.searchParams.get("q") === "a" ? 800 : 0)
    );
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.locator("#searchInput").fill("a");
    await page.waitForTimeout(350); // the "a" request is now in flight (800 ms)
    await page.locator("#searchInput").fill("ann");
    await page.waitForTimeout(1200);
    assert.equal(await page.locator("#rowlist .row", { hasText: "Stale" }).count(), 0);
    assert.equal(await page.locator("#paneTitle").textContent(), "Search: “ann”");
  });
});

test("e2e: search states — nothing found, a type that couldn't be searched, HTML in a name shown as text", async () => {
  await withServerAndBrowser(async (base, page) => {
    const evil = `<img src=x onerror="window.__pwned=1">Evil`;
    await stubSearch(page, (u) => u.searchParams.get("q") === "zzz" ? [] : [
      { type: "germplasm", total: 0, items: [], error: "boom" },
      { type: "experiment", total: 1, items: [{ id: "e-evil", type: "experiment", label: evil }] },
    ]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "zzz");
    assert.match(await page.locator("#rowlist").innerText(), /No matches for “zzz”\./);
    await typeSearch(page, "ev");
    assert.match(await page.locator("#rowlist").innerText(), /couldn't be searched/i);
    assert.match(await page.locator("#rowlist").innerText(), /<img src=x/);
    assert.equal(await page.locator("#rowlist img").count(), 0);
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined);
  });
});

test("e2e: `›` on a result opens it at its real place and ends the search; a crumb also ends it", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, () => ANN);
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "x", relations: [] }) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    await page.locator("#rowlist .row", { hasText: "Annika trial" }).locator(".row-nav").click();
    await page.waitForTimeout(300);
    assert.match((await page.locator(".crumb").allInnerTexts()).join(" "), /Experiments.*Annika trial/);
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.doesNotMatch(await page.locator("#paneTitle").textContent(), /^Search/);

    await typeSearch(page, "ann");
    await page.locator(".crumb").first().click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#searchInput").inputValue(), "");
    assert.equal(await page.locator("#paneTitle").textContent(), "Graph");
  });
});

test("e2e: tree rows stay clickable while search answers arrive (searching again keeps the gathered selection editable)", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, (u) => (u.searchParams.get("q") === "ann" ? ANN : []));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    await page.locator("#rowlist .row", { hasText: "Annika trial" }).click();
    await typeSearch(page, "zzz"); // a new answer (without e1) re-renders the list pane on its own
    await page.locator("#treeArea .row[data-id='e1']").click({ modifiers: ["Control"] });
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 0, "ctrl-click on the tree row toggled it out");
  });
});

test("e2e: Select all adds the shown results to what is already selected", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, (u) => (u.searchParams.get("q") === "plot"
      ? [{ type: "scientific_object", total: 1, items: [{ id: "so-1", type: "scientific_object", label: "Plot 1" }] }]
      : ANN));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "plot");
    await page.locator("#rowlist .row", { hasText: "Plot 1" }).click();
    await typeSearch(page, "ann");
    await page.locator("#searchSelectAll").click();
    await page.waitForTimeout(150);
    assert.equal(await page.locator("#selList .sel-item").count(), 4, "Plot 1 stays, the 3 shown join it");
  });
});

test("e2e: clicking a search result never reorders the groups under the cursor", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, () => [
      { type: "person", total: 1, items: [{ id: "p1", type: "person", label: "Ann Smith" }] },
      { type: "scientific_object", total: 1, items: [{ id: "so-a", type: "scientific_object", label: "Ann plot" }] },
      { type: "germplasm", total: 1, items: [{ id: "g1", type: "germplasm", label: "Annika" }] },
    ]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "ann");
    const before = await page.locator("#rowlist .search-group").allTextContents();
    await page.locator("#rowlist .row[data-id='g1']").click();
    await page.waitForTimeout(150);
    assert.deepEqual(await page.locator("#rowlist .search-group").allTextContents(), before);
  });
});

test("e2e: with something selected, search says what each result is to it — can link first, already linked when known, can't link last", async () => {
  await withServerAndBrowser(async (base, page) => {
    await stubSearch(page, (u) => u.searchParams.get("q") === "plot"
      ? [{ type: "scientific_object", total: 1, items: [{ id: "so-1", type: "scientific_object", label: "Plot 1" }] }]
      : [
          { type: "person", total: 1, items: [{ id: "p1", type: "person", label: "Ann Smith" }] },
          { type: "germplasm", total: 2, items: [{ id: "g1", type: "germplasm", label: "Annika" }, { id: "g2", type: "germplasm", label: "Annikki" }] },
        ]);
    await page.goto(base);
    await page.waitForTimeout(1000);
    await typeSearch(page, "plot");
    await page.locator("#rowlist .row", { hasText: "Plot 1" }).click();
    await page.evaluate(() => { NODE_DETAIL["so-1"] = { relations: [{ label: "Germplasm", items: [{ id: "g2", type: "germplasm", label: "Annikki" }] }] }; });
    await typeSearch(page, "ann");

    const heads = await page.locator("#rowlist .search-group").allInnerTexts();
    assert.match(heads[0], /germplasm/i, "the type that can link comes first");
    const typeLine = (label: string) => page.locator("#rowlist .row", { hasText: label }).first().locator(".row-type").innerText();
    assert.match(await typeLine("Annika"), /can link/);
    assert.match(await typeLine("Annikki"), /already linked/);
    assert.match(await typeLine("Ann Smith"), /can't link/);

    // Nothing selected: no notes.
    await page.evaluate(() => { selection = new Map(); refreshLeftPane(); });
    assert.doesNotMatch(await typeLine("Annika"), /link/);
  });
});

// ---------- factors ----------
const FL = "https://phis.pheno.no/id/factor/exp.rep";
const levelDetail = (label = "Replicate") => ({
  uri: FL, actions: ["rename", "delete"], deleteRemovesLinks: true, deleteWarning: "It also removes its level from 100 scientific objects in PBar1x4.",
  relations: [
    { label: "Experiment", items: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] },
    { label: "Levels", items: [1, 2].map((n) => ({ id: `${FL}.${n}`, type: "factor_level", label: `${label}: ${n}`, factor: FL })) },
  ],
});

test("e2e: level chips select with ctrl; plant + level reads 'Set Replicate: 2 on PB001…'; two levels of one factor give a why, not a button; HTML names stay text", async () => {
  await withServerAndBrowser(async (base, page) => {
    const evil = `<img src=x onerror="window.__pwned=1">Rep`;
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(levelDetail(evil)) }));
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { selection = new Map([["so-1", { id: "so-1", type: "scientific_object", label: "PB001" }]]); });
    await page.evaluate(() => openNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.locator(`.chip[data-openid="${FL}.2"]`).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.match(await page.locator("#linkSelectionBtn").innerText(), /^Set .*Rep: 2 on PB001…$/);
    await page.locator(`.chip[data-openid="${FL}.1"]`).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar").innerText(), /Two levels of one factor can't both be on a scientific object/);
    assert.equal(await page.locator("img").count(), 0);
    assert.equal(await page.evaluate(() => (window as any).__pwned), undefined);
  });
});

test("e2e: set a level on a plant not in its experiment — asked to add it there first, then the level is set", async () => {
  await withServerAndBrowser(async (base, page) => {
    const links: any[] = [];
    await page.route("**/api/link", (r) => {
      const b = r.request().postDataJSON();
      links.push(b);
      const asks = links.length === 1;
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(asks
        ? { needsExperiment: { notInAny: [{ id: "so-1", label: "PB001" }], placeOptions: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] } }
        : { ok: true, linkedPairs: 1, alreadyLinked: 0, written: [{ id: "so-1", values: [`${FL}.2`], experiments: ["PBar1x4"], only: false }] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate((fl) => linkItems([{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${fl}.2` }]), FL);
    await page.waitForTimeout(400);
    assert.match((await page.locator("#actionbar").innerText()).replace(/\s+/g, " "), /PB001 isn't in PBar1x4, where this factor level belongs\. Add it there first\?/);
    await page.locator("#linkList .newmenu-item", { hasText: "PBar1x4" }).click();
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(500);
    assert.deepEqual(links[1].items, [{ type: "scientific_object", id: "so-1" }, { type: "experiment", id: "exp-1" }], "the plant is added to the experiment");
    assert.deepEqual(links[2].items, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FL}.2` }], "then the level is set");
  });
});

test("e2e: + New factor asks for levels (one per line) and posts them; with two experiments it is greyed", async () => {
  await withServerAndBrowser(async (base, page) => {
    let posted: any = null;
    await page.route("**/api/create", (r) => { posted = r.request().postDataJSON(); return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: FL, type: "factor", label: "Replicate" }) }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => { selection = new Map([["exp-1", { id: "exp-1", type: "experiment", label: "PBar1x4" }]]); renderActionbar(); });
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "factor" }).click();
    await page.locator("dialog input[name=name]").fill("Replicate");
    await page.locator("dialog textarea[name=levels]").fill("1\n2");
    await page.locator("dialog button[value=ok]").click();
    await page.waitForTimeout(400);
    // A form may send a textarea's line breaks as \r\n — the server splits on both.
    assert.deepEqual({ ...posted, fields: { levels: posted.fields.levels.replace(/\r/g, "") } }, { type: "factor", name: "Replicate", links: [{ type: "experiment", id: "exp-1" }], fields: { levels: "1\n2" } });

    await page.evaluate(() => { selection = new Map([["exp-1", { id: "exp-1", type: "experiment", label: "A" }], ["exp-2", { id: "exp-2", type: "experiment", label: "B" }]]); renderActionbar(); });
    await page.locator("#newBtn").click();
    const item = page.locator("#newList .newmenu-item", { hasText: "factor" });
    assert.equal(await item.isDisabled(), true);
    assert.match(await item.textContent() ?? "", /one experiment only/);
  });
});

test("e2e: the delete confirm counts again at delete time — a level set since the factor was opened is not missed", async () => {
  await withServerAndBrowser(async (base, page) => {
    let loads = 0;
    await page.route("**/api/node-detail*", (r) => {
      loads++;
      const d = levelDetail();
      d.deleteWarning = loads === 1 ? "No scientific object uses it." : "It also removes its level from 20 scientific objects in PBar1x4.";
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(d) });
    });
    let msg = "";
    page.on("dialog", (d) => { msg = d.message(); return d.dismiss(); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.evaluate(() => deleteNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    assert.match(msg, /removes its level from 20 scientific objects/);
  });
});

test("e2e: + New factor from the Factors list with two experiments picked says to pick one — before the form, nothing typed is lost", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Factors");
    await page.locator("#newStandaloneBtn").click();
    await page.waitForTimeout(200);
    assert.match(await page.locator("#linkList .linkmenu-title").textContent() ?? "", /in which experiment\?$/); // CSS-uppercased: read the text
    const rows = page.locator("#linkList .linkmenu-items .newmenu-item");
    await rows.nth(0).click();
    await rows.nth(1).click({ modifiers: ["Control"] });
    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator("dialog[open]").count(), 0, "no form opened");
    assert.match(await page.locator("#toast").textContent() ?? "", /A factor belongs to one experiment — pick just one/);
  });
});

test("e2e: plain click on a level opens the level's own page (Factors › Replicate › Replicate: 2) with its connections", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (r) => {
      const isLevel = new URL(r.request().url()).searchParams.get("type") === "factor_level";
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(isLevel
        ? { uri: `${FL}.2`, actions: ["link"], relations: [
            { label: "Factor", items: [{ id: FL, type: "factor", label: "Replicate" }] },
            { label: "Experiment", items: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] },
            { label: "Scientific objects", items: [{ id: "so-1", type: "scientific_object", label: "PB001" }] },
          ] }
        : levelDetail()) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openRelatedNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.locator(`.chip[data-openid="${FL}.2"]`).click();
    await page.waitForTimeout(400);
    const crumbs = (await page.locator(".crumb").allTextContents()).map((c) => c.trim());
    assert.deepEqual(crumbs.slice(-3), ["Factors", "Replicate", "Replicate: 2"]);
    assert.match(await page.locator("#detailBody").innerText(), /PB001/);
    assert.equal(await page.locator("#selList .sel-item").count(), 0, "a plain click opens, it doesn't select");
  });
});

test("e2e: deleting a factor confirms with the counted cascade", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(levelDetail()) }));
    let msg = "";
    page.on("dialog", (d) => { msg = d.message(); return d.dismiss(); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.evaluate(() => deleteNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(200);
    assert.equal(msg, "Delete Replicate? It also removes its level from 100 scientific objects in PBar1x4. This cannot be undone.");
  });
});

// ---------- a factor's level list ----------
test("e2e: + New factor level with one factor selected asks its name and posts it under that factor; two factors grey it", async () => {
  await withServerAndBrowser(async (base, page) => {
    let posted: any = null;
    await page.route("**/api/create", (r) => { posted = r.request().postDataJSON(); return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: `${FL}.3`, type: "factor_level", label: "Replicate: 3", factor: FL }) }); });
    let asked = "";
    page.on("dialog", (d) => { asked = d.message(); return d.accept("3"); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate((fl) => { selection = new Map([[fl, { id: fl, type: "factor", label: "Replicate" }]]); renderActionbar(); }, FL);
    await page.locator("#newBtn").click();
    await page.locator("#newList .newmenu-item", { hasText: "factor level" }).click();
    await page.waitForTimeout(400);
    assert.equal(asked, "Name for the new factor level?");
    assert.deepEqual(posted, { type: "factor_level", name: "3", links: [{ type: "factor", id: FL }], fields: {} });
    assert.match(await page.locator("#toast").textContent() ?? "", /Created Replicate: 3/);

    await page.evaluate((fl) => { selection = new Map([[fl, { id: fl, type: "factor", label: "A" }], ["f2", { id: "f2", type: "factor", label: "B" }]]); renderActionbar(); }, FL);
    await page.locator("#newBtn").click();
    const item = page.locator("#newList .newmenu-item", { hasText: "factor level" });
    assert.equal(await item.isDisabled(), true);
    assert.match(await item.textContent() ?? "", /one factor only/);
  });
});

test("e2e: a level's page renames it (the factor's list is fetched again) and its delete confirm counts the objects that lose it", async () => {
  await withServerAndBrowser(async (base, page) => {
    let renamedTo: any = null;
    const loads: string[] = [];
    // The factor as the server has it: level 2 is "3" once the rename went through.
    const renamedLevels = () => { const d = levelDetail(); if (renamedTo) d.relations[1].items[1].label = "Replicate: 3"; return d; };
    await page.route("**/api/node-detail*", (r) => {
      const type = new URL(r.request().url()).searchParams.get("type")!;
      loads.push(type);
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(type === "factor_level"
        ? { uri: `${FL}.2`, actions: ["rename", "delete", "link"], deleteRemovesLinks: true, deleteWarning: "It also removes it from 20 scientific objects in PBar1x4.", relations: [
            { label: "Factor", items: [{ id: FL, type: "factor", label: "Replicate" }] },
            { label: "Experiment", items: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] },
          ] }
        : renamedLevels()) });
    });
    await page.route("**/api/node", (r) => { renamedTo = r.request().postDataJSON(); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: `${FL}.2`, type: "factor_level", label: "Replicate: 3" }) }); });
    const dialogs: string[] = [];
    page.on("dialog", (d) => { dialogs.push(`${d.type()}: ${d.message()} [${d.defaultValue()}]`); return d.type() === "prompt" ? d.accept("Replicate: 3") : d.dismiss(); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await page.evaluate(() => openRelatedNode({ id: "https://phis.pheno.no/id/factor/exp.rep", type: "factor", label: "Replicate" }));
    await page.waitForTimeout(400);
    await page.locator(`.chip[data-openid="${FL}.2"]`).click();
    await page.waitForTimeout(400);
    await page.locator("#renameNodeBtn").click();
    await page.waitForTimeout(400);
    assert.equal(dialogs[0], "prompt: New name for Replicate: 2? [Replicate: 2]");
    assert.deepEqual(renamedTo, { type: "factor_level", id: `${FL}.2`, name: "Replicate: 3" });
    assert.match(await page.locator(".node-title").innerText(), /Replicate: 3/);
    const factorLoads = loads.filter((t) => t === "factor").length;
    await page.locator(".crumb", { hasText: /^Replicate$/ }).click();
    await page.waitForTimeout(400);
    assert.equal(loads.filter((t) => t === "factor").length, factorLoads + 1, "the factor's levels are fetched again after the rename");

    await page.locator(`.chip[data-openid="${FL}.2"]`).click();
    await page.waitForTimeout(400);
    await page.locator("#deleteNodeBtn").click();
    await page.waitForTimeout(400);
    assert.equal(dialogs.at(-1), "confirm: Delete Replicate: 3? It also removes it from 20 scientific objects in PBar1x4. This cannot be undone. []");
  });
});

// ---------- germplasm ----------
test("e2e: + New germplasm from the Germplasm list asks name, type and species (PHIS's species list) and posts them", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/germplasm-species", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "sp-barley", type: "germplasm", label: "Barley" }]) }));
    let posted: any = null;
    await page.route("**/api/create", (r) => { posted = r.request().postDataJSON(); return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "g-new", type: "germplasm", label: "Fager", kind: "variety" }) }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Trials");
    await openRow(page, "Germplasm");
    await page.locator("#newStandaloneBtn").click();
    await page.waitForTimeout(300);
    assert.deepEqual(await page.locator("dialog select[name=rdf_type] option").allTextContents(), ["Choose…", "Species", "Variety", "Accession"]);
    await page.locator("dialog input[name=name]").fill("Fager");
    await page.locator("dialog select[name=rdf_type]").selectOption("vocabulary:Variety");
    await page.locator("dialog select[name=species]").selectOption("sp-barley");
    await page.locator("dialog button[value=ok]").click();
    await page.waitForTimeout(400);
    assert.deepEqual(posted, { type: "germplasm", name: "Fager", links: [], fields: { rdf_type: "vocabulary:Variety", species: "sp-barley" } });
  });
});

test("e2e: a species and a variety selected read 'Set Oat as species of Annika…' and link; two species give a why; the germplasm list is reloaded after", async () => {
  await withServerAndBrowser(async (base, page) => {
    let linked: any = null;
    await page.route("**/api/link", (r) => { linked = r.request().postDataJSON(); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 1, alreadyLinked: 0 }) }); });
    let germplasmLoads = 0;
    await page.route("**/api/germplasm", (r) => { germplasmLoads++; return r.fulfill({ status: 200, contentType: "application/json", body: "[]" }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    const oat = { id: "sp-oat", type: "germplasm", label: "Oat", kind: "species" };
    const annika = { id: "v-annika", type: "germplasm", label: "Annika", kind: "variety" };
    const a1 = { id: "a-1", type: "germplasm", label: "A1", kind: "accession" };
    await page.evaluate((s) => { selection = new Map(s.map((x: any) => [x.id, x])); renderActionbar(); }, [annika, oat]);
    assert.equal(await page.locator("#linkSelectionBtn").innerText(), "Set Oat as species of Annika…");
    assert.equal(await page.locator("#unlinkSelectionBtn").count(), 0, "a species can't be unlinked from a variety");

    await page.evaluate((s) => { selection = new Map(s.map((x: any) => [x.id, x])); renderActionbar(); }, [annika, a1]);
    assert.equal(await page.locator("#linkSelectionBtn").innerText(), "Set Annika as variety of A1…");

    await page.evaluate((s) => { selection = new Map(s.map((x: any) => [x.id, x])); renderActionbar(); }, [oat, { ...oat, id: "sp-2", label: "Rye" }, annika]);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar").innerText(), /Select one species or variety, and the germplasm to set it on/);

    await page.evaluate((s) => { selection = new Map(s.map((x: any) => [x.id, x])); renderActionbar(); }, [annika, oat]);
    const before = germplasmLoads;
    await page.locator("#linkSelectionBtn").click();
    await page.waitForTimeout(400);
    assert.deepEqual(linked, { items: [{ type: "germplasm", id: "v-annika" }, { type: "germplasm", id: "sp-oat" }] });
    assert.equal(germplasmLoads, before + 1);
  });
});

// ---------- people ----------
test("e2e: People lists Accounts, Groups and Profiles; a supervisor chip opens the person's page with its facts and connections, read-only", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/node-detail*", (r) => {
      const type = new URL(r.request().url()).searchParams.get("type");
      return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(type === "person"
        ? { uri: "https://orcid.org/1", actions: [], facts: [{ label: "Email", value: "<b>anna</b>@uit.no" }, { label: "Affiliation", value: "UiT" }],
            relations: [{ label: "Account", items: [{ id: "acc-1", type: "account", label: "Anna Berg" }] }, { label: "Scientific supervisor of", items: [{ id: "exp-1", type: "experiment", label: "PBar1x4" }] }] }
        : { uri: "exp-1", actions: ["rename", "delete", "link"], relations: [{ label: "Scientific supervisors", field: "scientific_supervisors", items: [{ id: "https://orcid.org/1", type: "person", label: "Anna Berg" }] }] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "People");
    const labels = (await page.locator("#rowlist .row .row-label").allTextContents()).map((t) => t.trim());
    for (const l of ["Persons", "Accounts", "Groups", "Profiles"]) assert.ok(labels.includes(l), `${l} in ${labels}`);

    await page.evaluate(() => openRelatedNode({ id: "exp-1", type: "experiment", label: "PBar1x4" }));
    await page.waitForTimeout(400);
    await page.locator(`.chip[data-openid="https://orcid.org/1"]`).click();
    await page.waitForTimeout(400);
    const body = await page.locator("#detailBody").innerText();
    assert.match(body, /Email\s+<b>anna<\/b>@uit\.no/, "facts shown, as text");
    assert.match(body, /Affiliation\s+UiT/);
    assert.match(body, /Anna Berg/);
    assert.match(body, /PBar1x4/);
    assert.equal(await page.locator("#renameNodeBtn, #deleteNodeBtn").count(), 0, "read-only");
    const crumbs = (await page.locator(".crumb").allTextContents()).map((c) => c.trim());
    assert.deepEqual(crumbs.slice(-2), ["Persons", "Anna Berg"]);
  });
});

// ---------- devices ----------
test("e2e: devices + a facility read 'Move Specim FX10e to HOLT_BR_1…', ask the date (today) and post it; two facilities give a why; no Unlink selection", async () => {
  await withServerAndBrowser(async (base, page) => {
    let linked: any = null;
    await page.route("**/api/link", (r) => { linked = r.request().postDataJSON(); return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 1, alreadyLinked: 0 }) }); });
    let asked = "";
    page.on("dialog", (d) => { asked = `${d.message()} [${d.defaultValue()}]`; return d.accept("2026-09-30"); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    const dev = { id: "dev-1", type: "device", label: "Specim FX10e" };
    const fac = { id: "fac-1", type: "facility", label: "HOLT_BR_1" };
    const set = (s: any[]) => page.evaluate((x) => { selection = new Map(x.map((i: any) => [i.id, i])); renderActionbar(); }, s);
    await set([dev, fac]);
    assert.equal(await page.locator("#linkSelectionBtn").innerText(), "Move Specim FX10e to HOLT_BR_1…");
    assert.equal(await page.locator("#unlinkSelectionBtn").count(), 0);
    await page.locator("#linkSelectionBtn").click();
    await page.waitForTimeout(400);
    assert.equal(asked, `Moved to HOLT_BR_1 on which date? (YYYY-MM-DD) [${new Date().toISOString().slice(0, 10)}]`);
    assert.deepEqual(linked, { items: [{ type: "device", id: "dev-1" }, { type: "facility", id: "fac-1" }], date: "2026-09-30" });

    await set([dev, fac, { id: "fac-2", type: "facility", label: "HOLT_PT" }]);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
    assert.match(await page.locator("#actionbar").innerText(), /A device is in one facility at a time — select one facility/);
  });
});

test("e2e: + New device from the Devices list asks name, type (OpenSILEX's device classes) and optional brand, model, serial number", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.route("**/api/device-types", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "vocabulary:RGBCamera", type: "rdf_type", label: "RGB camera" }]) }));
    let posted: any = null;
    await page.route("**/api/create", (r) => { posted = r.request().postDataJSON(); return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "dev-new", type: "device", label: "ZZ cam" }) }); });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Setup");
    await openRow(page, "Devices");
    await page.locator("#newStandaloneBtn").click();
    await page.waitForTimeout(300);
    await page.locator("dialog input[name=name]").fill("ZZ cam");
    await page.locator("dialog select[name=rdf_type]").selectOption("vocabulary:RGBCamera");
    await page.locator("dialog input[name=brand]").fill("Nikon");
    await page.locator("dialog button[value=ok]").click();
    await page.waitForTimeout(400);
    assert.deepEqual(posted, { type: "device", name: "ZZ cam", links: [], fields: { rdf_type: "vocabulary:RGBCamera", brand: "Nikon" } }); // empty optional fields are left out
  });
});
