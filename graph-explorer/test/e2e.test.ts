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
  { branch: "Scientific Organization", label: "Organizations", fakeIdPrefix: "org-" },
  { branch: "Scientific Organization", label: "Experiments", fakeIdPrefix: "exp-" },
  { branch: "Scientific Organization", label: "Factors", fakeIdPrefix: "fac-irrigation" },
  { branch: "Scientific Organization", label: "Projects", fakeIdPrefix: "proj-" },
  { branch: "Scientific Organization", label: "Facilities", fakeIdPrefix: "fac-" },
  { branch: "Scientific Organization", label: "Devices", fakeIdPrefix: "dev-" },
  { branch: "Scientific Organization", label: "Sites", fakeIdPrefix: "site-" },
  { branch: "Scientific Organization", label: "Persons", fakeIdPrefix: "person-" },
  { branch: "Scientific Information", label: "Scientific Objects", fakeIdPrefix: "so-" },
  { branch: "Scientific Information", label: "Variables", fakeIdPrefix: "var-" },
  { branch: "Scientific Information", label: "Germplasm", fakeIdPrefix: "germ-" },
  { branch: "Data", label: "Data files", fakeIdPrefix: "datafile-" },
  { branch: "Data", label: "Provenances", fakeIdPrefix: "prov-" },
  { branch: "Data", label: "Events", fakeIdPrefix: "event-" },
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
  });
});

test("e2e: '+ New' menu shows the INTERSECTION of creatable types across a real multi-selection", async () => {
  // A single new node gets linked to every selected item at once, so the menu must offer only
  // types adjacent to ALL selected nodes — not the union of what's adjacent to any one of them.
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select one real Experiment
    await openRow(page, "Scientific Organization");
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    const soloItems = await page.locator("#newList .newmenu-item").allTextContents();
    // ADJACENT.experiment in full — 6 types, proving the solo case is unconstrained.
    assert.deepEqual(
      new Set(soloItems.map((s) => s.trim())),
      new Set(["organization", "facility", "project", "person", "factor", "scientific object"])
    );
    await page.locator("#newBtn").click(); // close

    // Ctrl-click a real Project into the selection too
    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
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
    assert.deepEqual(new Set(comboItems.map((s) => s.trim())), new Set(["project", "person"]));
  });
});

test("e2e: '+ New' menu shows the honest empty state when a multi-selection shares no adjacent type", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select the Sites category (group-select = every site) and ctrl-click the
    // Projects category (every project) — ADJACENT.site ∩ ADJACENT.project = {}.
    await openRow(page, "Scientific Organization");
    await page.locator(".row[data-id]", { hasText: "Sites" }).first().click();
    await page.waitForTimeout(200);
    await page.locator(".row[data-id]", { hasText: "Projects" }).first().click({ modifiers: ["Control"] });
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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

    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    await page.locator("#newBtn").click();
    await page.waitForTimeout(150);
    await page.locator("#newList .newmenu-item", { hasText: "facility" }).click();
    await page.waitForTimeout(300);

    const toastText = await page.locator("#toast").textContent();
    assert.match(toastText ?? "", /Created Mock New Facility/);

    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row .row-nav").first().click();
    await page.waitForTimeout(400);

    // Follow the "Mock Facility" relation chip from the organization's detail pane.
    await page.locator(".chip[data-openid='mock-fac-1']").click();
    await page.waitForTimeout(400);

    const crumbs = await page.locator(".crumb").allTextContents();
    // Lands on Facility's own canonical path (Scientific Organization > Facilities > it) —
    // not "...Organizations > <org> > Mock Facility", which is what appending would produce.
    assert.deepEqual(crumbs.map((c) => c.trim()), ["Graph", "Scientific Organization", "Facilities", "Mock Facility"]);
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
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    // Pre-select a real Experiment first — ctrl-clicking the chip below must ADD to this,
    // never replace it (same reasoning as the simulated graph panel's pick behavior).
    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
    await page.waitForTimeout(200);
    await openRow(page, "Experiments");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    const preExistingLabel = await page.locator(".selection-summary .selection-names").textContent();

    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Information");
    await openRow(page, "Scientific Objects");
    const box = page.locator("details.type-info");
    assert.match((await box.locator("summary").textContent()) ?? "", /How scientific objects work/);
    assert.equal(await box.evaluate((d: HTMLDetailsElement) => d.open), false, "collapsed by default");
    await box.locator("summary").click();
    assert.match((await box.textContent()) ?? "", /separate copy of it in each experiment/);
    await page.waitForTimeout(200); // "toggle" fires async — let it be stored before reloading

    await page.reload();
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Information");
    await openRow(page, "Scientific Objects");
    assert.equal(await page.locator("details.type-info").evaluate((d: HTMLDetailsElement) => d.open), true, "open state remembered");
  });
});

test("e2e: opening a real experiment shows its relations as chips with Rename and Delete", async () => {
  // Hits the real backend + real OpenSILEX read path (no mock) — read-only, nothing clicked.
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
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
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    await page.locator("#treeToggleBtn").click();
    await page.waitForTimeout(300);
    await page.locator("#rowlist .row .row-nav").last().click(); // the tree row's open arrow
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
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    // No link button yet — only one node selected.
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);

    // Ctrl-click one real Facility in too — organization and facility are adjacent.
    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
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

test("e2e: selecting only same-type nodes never offers \"Link selection\" (direction would be ambiguous)", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").nth(0).click();
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#linkSelectionBtn").count(), 0);
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

    await openRow(page, "Scientific Organization");
    await openRow(page, "Facilities");
    await page.locator("#rowlist .row").nth(0).click();
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(150);
    await page.locator("#rowlist .row").nth(2).click({ modifiers: ["Control"] });
    await page.waitForTimeout(150);

    await page.locator(".crumb", { hasText: "Scientific Organization" }).click();
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

test("e2e: \"Link existing…\" is a two-level type-then-item browser: pick a type, search, multi-pick, then confirm once", async () => {
  await withServerAndBrowser(async (base, page) => {
    let capturedBody: unknown = null;
    await page.route("**/api/link", (route) => {
      capturedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, linkedPairs: 2 }) });
    });
    // The popover now fetches the anchor's own detail before rendering candidates, to filter
    // out anything already related (see linkPickerCandidatesByType) — mock it empty so this
    // test's candidate count depends only on real facilities existing, not on which real org
    // happens to be first in the list or what it's already linked to.
    await page.route("**/api/node-detail*", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "mock", relations: [] }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);

    // Select one real Organization — stays put, never navigates to Facilities.
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    const linkExistingBtn = page.locator("#linkExistingBtn");
    await linkExistingBtn.waitFor({ state: "visible" });
    await linkExistingBtn.click();
    await page.waitForTimeout(150);

    // Level 1: a type list (categorical, not a flat dump of every candidate).
    const typeButton = page.locator("#linkPickerBody .newmenu-item", { hasText: "facility" });
    await typeButton.waitFor({ state: "visible" });
    await typeButton.click();
    await page.waitForTimeout(150);

    // Level 2: the breadcrumb back-link and a search box are present.
    await page.locator(".linkmenu-back").waitFor({ state: "visible" });
    const firstLabel = await page.locator("#linkPickerBody .newmenu-item").first().textContent();
    await page.locator(".linkmenu-search").fill((firstLabel ?? "").slice(0, 4));
    await page.waitForTimeout(150);
    assert.ok((await page.locator("#linkPickerBody .newmenu-item").count()) >= 1);

    // Picking is not instant-link: clicking gathers into a set, the popover stays open.
    await page.locator("#linkPickerBody .newmenu-item").nth(0).click();
    await page.waitForTimeout(100);
    assert.ok(await page.locator("#linkMenu").evaluate((el) => el.classList.contains("open")));
    await page.locator(".linkmenu-search").fill("");
    await page.waitForTimeout(100);
    await page.locator("#linkPickerBody .newmenu-item.selected").first().waitFor({ state: "visible" });
    // Ctrl-click ADDS a second pick — same rule as the main rowlist. A plain click here would
    // instead replace the pick set (covered by its own test below).
    await page.locator("#linkPickerBody .newmenu-item").nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(100);

    const confirmBtn = page.locator(".linkmenu-confirm");
    await confirmBtn.waitFor({ state: "visible" });
    assert.match((await confirmBtn.textContent()) ?? "", /Link 2 picked/);
    await confirmBtn.click();
    await page.waitForTimeout(300);

    const { items } = capturedBody as { items: { type: string; id: string }[] };
    assert.equal(items.length, 3);
    assert.equal(items.filter((i) => i.type === "facility").length, 2);
    const crumbs = await page.locator(".crumb").allTextContents();
    assert.match(crumbs.join(" "), /Organizations/);
    assert.match((await page.locator("#toast").textContent()) ?? "", /Linked 2 relations\b/);
  });
});

test("e2e: \"Link existing…\" picking follows the exact same click/ctrl/shift rules as the main rowlist — plain click REPLACES, ctrl toggles", async () => {
  await withServerAndBrowser(async (base, page) => {
    // See the identical mock in the test above — decouples candidate availability from real
    // backend relations so this purely-interaction-mechanics test isn't at the mercy of how
    // many real facilities happen to be linked to whichever org is first in the list.
    await page.route("**/api/node-detail*", (route) => {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ uri: "mock", relations: [] }) });
    });
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    await page.locator("#linkExistingBtn").click();
    await page.waitForTimeout(150);
    await page.locator("#linkPickerBody .newmenu-item", { hasText: "facility" }).click();
    await page.waitForTimeout(150);

    const rows = page.locator("#linkPickerBody .newmenu-item");
    await rows.first().waitFor({ state: "visible" });

    // Plain click on row 0, then plain click on row 1: row 1 REPLACES row 0 (never both picked).
    await rows.nth(0).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#linkPickerBody .newmenu-item.selected").count(), 1);
    await rows.nth(1).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#linkPickerBody .newmenu-item.selected").count(), 1);
    assert.match((await page.locator(".linkmenu-confirm").textContent()) ?? "", /Link 1 picked/);

    // Ctrl-click row 2 ADDS to row 1 (now 2 picked), ctrl-click row 1 again removes it (back to 1).
    await rows.nth(2).click({ modifiers: ["Control"] });
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#linkPickerBody .newmenu-item.selected").count(), 2);
    await rows.nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#linkPickerBody .newmenu-item.selected").count(), 1);
  });
});

test("e2e: with exactly one organization selected, \"Link existing…\" offers organizations as normal picks, and confirming routes them to the ranking modal instead of linking blindly", async () => {
  await withServerAndBrowser(async (base, page) => {
    const putCalls: { type: string; id: string; link: { field: string; uris: string[] } }[] = [];
    await page.route("**/api/node", (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      putCalls.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "x", type: "organization", label: "x" }) });
    });

    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);

    await page.locator("#linkExistingBtn").click();
    await page.waitForTimeout(150);
    // organization is offered as a candidate type here (the one same-type exception) — and
    // picked with the exact same click/ctrl rules as any other type, no special buttons.
    await page.locator("#linkPickerBody .newmenu-item", { hasText: "organization" }).click();
    await page.waitForTimeout(150);

    const rows = page.locator("#linkPickerBody .newmenu-item");
    await rows.first().waitFor({ state: "visible" });
    await rows.nth(0).click();
    await page.waitForTimeout(100);
    await rows.nth(1).click({ modifiers: ["Control"] });
    await page.waitForTimeout(100);

    await page.locator(".linkmenu-confirm").click();
    await page.waitForTimeout(300);

    // Confirming with ambiguous (organization) picks opens the ranking modal instead of
    // linking blindly — no PUT has fired yet.
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
    assert.equal(await page.locator(".ranking-overlay").evaluate((el) => el.classList.contains("open")), false);
  });
});

test("e2e: \"Link existing…\" popover closes via its own × button, not just an outside click", async () => {
  await withServerAndBrowser(async (base, page) => {
    await page.goto(base);
    await page.waitForTimeout(1000);
    await openRow(page, "Scientific Organization");
    await openRow(page, "Organizations");
    await page.locator("#rowlist .row").first().click();
    await page.waitForTimeout(200);
    await page.locator("#linkExistingBtn").click();
    await page.waitForTimeout(150);
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
