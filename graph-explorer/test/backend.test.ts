import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest, _resetAuthCacheForTests } from "../src/index.ts";

// Real network calls are never made in this file — fetch is replaced per test
// so we can simulate exactly the "unexpected turns" a live OpenSILEX server
// can throw at us: auth expiry, malformed bodies, downtime.
const realFetch = globalThis.fetch;

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    globalThis.fetch = realFetch;
    _resetAuthCacheForTests();
  }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("GET /api/organizations returns 200 with mapped items on a normal response", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok-1" } });
      if (url.includes("/core/organisations")) {
        return jsonResponse(200, { result: [{ uri: "u1", name: "Org One" }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/organizations`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, [{ id: "u1", type: "organization", label: "Org One" }]);
  });
});

test("a 401 on first use triggers one retry authentication, then succeeds", async () => {
  await withServer(async (base) => {
    let authCalls = 0;
    let orgCalls = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) {
        authCalls++;
        return jsonResponse(200, { result: { token: `tok-${authCalls}` } });
      }
      if (url.includes("/core/organisations")) {
        orgCalls++;
        if (orgCalls === 1) return jsonResponse(401, { result: { message: "expired" } });
        return jsonResponse(200, { result: [{ uri: "u1", name: "Org One" }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/organizations`);
    assert.equal(res.status, 200);
    // token starts null, so the initial call authenticates once, then the 401 forces a second
    // (retry) authentication — two auth calls total, not one.
    assert.equal(authCalls, 2);
    assert.equal(orgCalls, 2);
  });
});

test("persistent 401 (bad credentials) surfaces as 502, never hangs or retries forever", async () => {
  await withServer(async (base) => {
    let orgCalls = 0;
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations")) {
        orgCalls++;
        return jsonResponse(401, { result: { message: "still expired" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/organizations`);
    assert.equal(res.status, 502);
    assert.equal(orgCalls, 2); // one initial attempt + exactly one retry, no infinite loop
  });
});

test("malformed response body (missing 'result') surfaces as 502, not a crash", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations")) return jsonResponse(200, { unexpected: "shape" });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/organizations`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /did not contain a result list/);
  });
});

test("OpenSILEX server unreachable (network error) surfaces as 502", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/organizations`);
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.match(body.error, /ECONNREFUSED/);
  });
});

test("auth endpoint returning non-ok status surfaces as 502", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(403, { result: { message: "bad creds" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/experiments`);
    assert.equal(res.status, 502);
  });
});

test("GET / serves the mockup HTML", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    const text = await res.text();
    assert.match(text, /<title>Graph Explorer<\/title>/);
  });
});

test("unknown route returns 404", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test("every response carries permissive CORS header, even on error paths", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/nope`);
    assert.equal(res.headers.get("access-control-allow-origin"), "*");
  });
});

test("POST /api/create rejects a missing type/name/links", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/create rejects a type with no creation config", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "germplasm", name: "x", links: [] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not implemented/);
  });
});

test("POST /api/create rejects a link selection that isn't a valid adjacency for the type", async () => {
  // facility is not adjacent to project (see adjacency.js ADJACENT.facility), so this must be
  // rejected server-side even though it never reaches OpenSILEX — same rule the "+ New" menu
  // itself used to offer the type in the first place, enforced again so the API can't be
  // driven into creating an orphan by a client that skips the UI's own check.
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "facility", name: "x", links: [{ type: "project", id: "u1" }] }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /not a valid link target/);
  });
});

test("POST /api/create builds the CreationDTO payload, groups same-type links into one array (N:N), and returns the created node", async () => {
  await withServer(async (base) => {
    let capturedBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities") && init?.method === "POST") {
        capturedBody = JSON.parse(String(init.body));
        return jsonResponse(201, { result: "phis:id/facility/new-one" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "facility",
        name: "New Facility",
        // Two organizations selected at once — a facility can belong to more than one
        // (N:N), so both must land in the same "organizations" array, not overwrite each other.
        links: [
          { type: "organization", id: "org-1" },
          { type: "organization", id: "org-2" },
        ],
      }),
    });

    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: "phis:id/facility/new-one", type: "facility", label: "New Facility" });
    assert.deepEqual(capturedBody, { name: "New Facility", organizations: ["org-1", "org-2"] });
  });
});

test("POST /api/create with no links at all creates a standalone node — clusters have to start somewhere", async () => {
  await withServer(async (base) => {
    let capturedBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities") && init?.method === "POST") {
        capturedBody = JSON.parse(String(init.body));
        return jsonResponse(201, { result: "phis:id/facility/lonely-one" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "facility", name: "Standalone Facility" }),
    });

    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { id: "phis:id/facility/lonely-one", type: "facility", label: "Standalone Facility" });
    assert.deepEqual(capturedBody, { name: "Standalone Facility" });
  });
});

test("POST /api/create experiment: requires objective/start_date, sends only declared fields, refuses a not-yet-wired link type", async () => {
  await withServer(async (base) => {
    let posted: any = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.endsWith("/core/experiments") && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return jsonResponse(201, { result: "phis:id/experiment/new" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const create = (body: unknown) =>
      realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const missing = await create({ type: "experiment", name: "E", fields: { objective: "o" } });
    assert.equal(missing.status, 400);
    assert.match((await missing.json()).error, /Start date is required/);

    const viaGermplasm = await create({ type: "scientific_object", name: "P", links: [{ type: "germplasm", id: "g1" }], fields: { rdf_type: "vocabulary:Plant" } });
    assert.equal(viaGermplasm.status, 400);
    assert.match((await viaGermplasm.json()).error, /germplasm isn't supported yet/);
    assert.equal(posted, null, "neither refusal may reach OpenSILEX");

    const ok = await create({
      type: "experiment", name: "E", links: [{ type: "organization", id: "org-1" }, { type: "facility", id: "fac-1" }],
      fields: { objective: "o", start_date: "2026-10-01", end_date: "", is_public: true },
    });
    assert.equal(ok.status, 201);
    assert.deepEqual(posted, { name: "E", objective: "o", start_date: "2026-10-01", organisations: ["org-1"], facilities: ["fac-1"] });
  });
});

test("POST /api/create project from experiments: POSTs the project, then PUTs each experiment with it added (linkedFrom); a failed PUT is a warning on the 201", async () => {
  await withServer(async (base) => {
    let posted: any = null;
    const puts: any[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.endsWith("/core/projects") && init?.method === "POST") {
        posted = JSON.parse(String(init.body));
        return jsonResponse(201, { result: "phis:id/project/new" });
      }
      if (url.includes("/core/experiments/")) {
        const id = decodeURIComponent(url.split("/core/experiments/")[1]);
        if (id === "exp-gone") return jsonResponse(404, { result: { message: "URI not found" } });
        return jsonResponse(200, { result: { uri: id, name: "E", objective: "o", projects: [{ uri: "p-old", name: "Old" }] } });
      }
      if (url.endsWith("/core/experiments") && init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return jsonResponse(200, { result: "ok" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const res = await realFetch(`${base}/api/create`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "project", name: "P", links: [{ type: "experiment", id: "exp-1" }, { type: "experiment", id: "exp-gone" }], fields: { start_date: "2026-01-01" } }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(posted, { name: "P", start_date: "2026-01-01" }, "a project's DTO has no experiment field");
    assert.equal(puts.length, 1);
    assert.equal(puts[0].uri, "exp-1");
    assert.equal(puts[0].objective, "o", "full-replace PUT keeps the experiment's other fields");
    assert.deepEqual(puts[0].projects, ["p-old", "phis:id/project/new"]);
    assert.match((await res.json()).warning, /not linked to 1 of 2 — exp-gone/);
  });
});

test("POST /api/create returns the id PREFIXED (phis:id/...) like every list does, not the full uri OpenSILEX's POST returns", async () => {
  // Otherwise a node created this session and later reached via a relation chip exists under
  // two ids in the frontend, and deleting one leaves the other listed until a reload.
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) {
        return jsonResponse(200, { result: { "phis-orga": "https://phis.pheno.no/set/organization#", phis: "https://phis.pheno.no/" } });
      }
      if (url.includes("/core/facilities") && init?.method === "POST") {
        return jsonResponse(201, { result: "https://phis.pheno.no/id/organization/facility.new" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "facility", name: "New" }),
    });

    assert.equal(res.status, 201);
    assert.equal((await res.json()).id, "phis:id/organization/facility.new");
  });
});

test("experiment: node-detail maps {uri,name} AND bare-uri refs and advertises its actions; linking a facility keeps every other field (incl. bare-uri supervisors)", async () => {
  await withServer(async (base) => {
    const writes: string[] = [];
    let putBody: any = null;
    const dto = {
      uri: "exp-1", name: "E", objective: "obj", start_date: "2026-01-01", species: ["sp-1"], is_public: true,
      organisations: [{ uri: "org-1", name: "NMBU" }], facilities: [], projects: [{ uri: "prj-1", name: "P" }],
      scientific_supervisors: ["https://orcid.org/0000-1"], technical_supervisors: [], factors: ["fac-lvl-1"], groups: [],
    };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.endsWith("/core/experiments") && init?.method === "PUT") { putBody = JSON.parse(String(init.body)); return jsonResponse(200, { result: "exp-1" }); }
      if (init?.method && init.method !== "GET") { writes.push(`${init.method} ${url}`); return jsonResponse(200, { result: "x" }); }
      if (url.includes("/exp-1/species")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-1")) return jsonResponse(200, { result: dto });
      if (url.includes("/core/scientific_objects?experiment=")) return jsonResponse(200, { result: [] });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const detail = await (await realFetch(`${base}/api/node-detail?type=experiment&id=exp-1`)).json();
    assert.deepEqual(detail.actions, ["rename", "delete", "link"]);
    assert.equal(detail.deleteRemovesLinks, true);
    assert.deepEqual(detail.relations.find((r: any) => r.label === "Scientific supervisors").items, [
      { id: "https://orcid.org/0000-1", type: "person", label: "https://orcid.org/0000-1" },
    ]);

    const link = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ type: "experiment", id: "exp-1" }, { type: "facility", id: "fac-9" }] }),
    });
    assert.equal(link.status, 200);
    assert.deepEqual(putBody, {
      uri: "exp-1", name: "E", objective: "obj", start_date: "2026-01-01", species: ["sp-1"], is_public: true, groups: [],
      organisations: ["org-1"], facilities: ["fac-9"], projects: ["prj-1"],
      scientific_supervisors: ["https://orcid.org/0000-1"], technical_supervisors: [], factors: ["fac-lvl-1"],
    });
    assert.deepEqual(writes, []);
  });
});

test("DELETE experiment: refused (409, nothing deleted) while it holds scientific objects; goes through once empty", async () => {
  await withServer(async (base) => {
    let sos = [{ uri: "so-1", name: "Plant 1" }];
    const deletes: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (init?.method === "DELETE") { deletes.push(url); return jsonResponse(200, { result: "ok" }); }
      if (url.includes("/core/scientific_objects?experiment=")) return jsonResponse(200, { result: sos });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const blocked = await realFetch(`${base}/api/node?type=experiment&id=exp-1`, { method: "DELETE" });
    assert.equal(blocked.status, 409);
    assert.match((await blocked.json()).error, /still holds 1 scientific objects \(Plant 1\).*orphan/);
    assert.deepEqual(deletes, [], "a blocked delete must never reach OpenSILEX");

    sos = [];
    const ok = await realFetch(`${base}/api/node?type=experiment&id=exp-1`, { method: "DELETE" });
    assert.equal(ok.status, 200);
    assert.equal(deletes.length, 1);
    assert.match(deletes[0], /\/core\/experiments\/exp-1$/);
  });
});

test("experiment node-detail appends a 'Scientific objects' group from the SO-by-experiment query (read-only, no field)", async () => {
  await withServer(async (base) => {
    let queried = "";
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/exp-1/species")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-1")) return jsonResponse(200, { result: { uri: "exp-1", name: "E", organisations: [] } });
      if (url.includes("/core/scientific_objects?experiment=")) {
        queried = url;
        return jsonResponse(200, { result: [{ uri: "so-1", name: "Plant 1" }] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const detail = await (await realFetch(`${base}/api/node-detail?type=experiment&id=exp-1`)).json();
    assert.match(queried, /experiment=exp-1/);
    assert.deepEqual(detail.relations, [{ label: "Scientific objects", field: "scientific_object", blocksDelete: true, items: [{ id: "so-1", type: "scientific_object", label: "Plant 1" }] }]);
  });
});

test("germplasm node-detail: single-uri species labelled from species_name, members minus itself (full vs prefixed uri), view-only", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/core/germplasm?species=")) {
        return jsonResponse(200, { result: [{ uri: "https://phis.pheno.no/id/sp", name: "Barley" }, { uri: "https://phis.pheno.no/id/acc", name: "A1" }] });
      }
      if (url.includes("/experiments?")) return jsonResponse(200, { result: [{ uri: "exp-1", name: "E" }] });
      if (url.includes("/core/germplasm/")) {
        return jsonResponse(200, { result: { uri: "phis:id/sp", name: "Barley", rdf_type_name: "Species", species: "phis:id/parent", species_name: "Parent", variety: null } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const detail = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=phis:id/sp`)).json();
    assert.deepEqual(detail.actions, []);
    assert.deepEqual(detail.relations, [
      { label: "Species", items: [{ id: "phis:id/parent", type: "germplasm", label: "Parent" }] },
      { label: "Varieties and accessions", items: [{ id: "phis:id/acc", type: "germplasm", label: "A1" }] },
      { label: "Experiments", items: [{ id: "exp-1", type: "experiment", label: "E" }] },
    ]);
  });
});

test("GET /api/germplasm: ids and species parents compacted to one form; an unknown parent is dropped, not hidden under", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/core/germplasm?")) {
        return jsonResponse(200, { result: [
          { uri: "https://phis.pheno.no/id/sp", name: "Barley", species: null },
          { uri: "https://phis.pheno.no/id/v1", name: "Annika", species: "phis:id/sp" },
          { uri: "https://phis.pheno.no/id/a1", name: "A1", species: "https://phis.pheno.no/id/sp" },
          { uri: "https://phis.pheno.no/id/a2", name: "A2", species: "phis:id/gone" },
        ] });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const rows = await (await realFetch(`${base}/api/germplasm`)).json();
    assert.deepEqual(rows, [
      { id: "phis:id/sp", type: "germplasm", label: "Barley" },
      { id: "phis:id/v1", type: "germplasm", label: "Annika", parent: "phis:id/sp" },
      { id: "phis:id/a1", type: "germplasm", label: "A1", parent: "phis:id/sp" },
      { id: "phis:id/a2", type: "germplasm", label: "A2" },
    ]);
  });
});

test("POST /api/create scientific_object: one POST per experiment (same uri for the copies), rdf_type required; a failed copy is a warning on a 201, not a failed create", async () => {
  await withServer(async (base) => {
    const posts: any[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.endsWith("/core/scientific_objects") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posts.push(body);
        if (body.experiment === "exp-clash") return jsonResponse(400, { result: { message: "Object name <P1> must be unique onto the graph" } });
        return jsonResponse(201, { result: "phis:id/so/new" });
      }
      // The extra copy goes through the shared SO<->experiment link: its current experiments,
      // then the global copy's name/type.
      if (url.endsWith("/experiments")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/scientific_objects/")) return jsonResponse(200, { result: { uri: "phis:id/so/new", name: "P1", rdf_type: "vocabulary:Plant" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const create = (body: unknown) =>
      realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const noType = await create({ type: "scientific_object", name: "P1", links: [{ type: "experiment", id: "exp-1" }] });
    assert.equal(noType.status, 400);
    assert.equal(posts.length, 0);

    const two = await create({ type: "scientific_object", name: "P1", links: [{ type: "experiment", id: "exp-1" }, { type: "experiment", id: "exp-2" }], fields: { rdf_type: "vocabulary:Plant" } });
    assert.equal(two.status, 201);
    assert.equal((await two.json()).warning, undefined);
    assert.deepEqual(posts, [
      { name: "P1", rdf_type: "vocabulary:Plant", experiment: "exp-1" },
      { name: "P1", rdf_type: "vocabulary:Plant", experiment: "exp-2", uri: "phis:id/so/new" },
    ]);

    posts.length = 0;
    const clash = await create({ type: "scientific_object", name: "P1", links: [{ type: "experiment", id: "exp-1" }, { type: "experiment", id: "exp-clash" }], fields: { rdf_type: "vocabulary:Plant" } });
    assert.equal(clash.status, 201, "the object exists in exp-1 — not a failed create");
    assert.match((await clash.json()).warning, /not linked to 1 of 2 — exp-clash: .*unique/);
  });
});

test("the page's '+ New' rule never offers a link /api/create would refuse", async () => {
  // Mirrors the check in the page's "+ New" menu: a link is offered if the new type's DTO holds
  // it, or both types are linkable and distinct (then /api/create links it after the POST).
  const { ADJACENT, creatableTypesFor } = await import("../src/adjacency.js");
  const { CREATABLE } = await import("../src/creation.js");
  const { NODE_TYPES, allows, resolveLink } = await import("../src/node-types.ts");
  const linkable = new Set(Object.keys(NODE_TYPES).filter((t) => allows(NODE_TYPES[t], "link")));
  for (const v of Object.keys(ADJACENT)) {
    for (const t of creatableTypesFor([v])) {
      if (!(t in CREATABLE)) continue;
      const offered = CREATABLE[t].linkFields[v] || (v !== t && linkable.has(t) && linkable.has(v));
      if (offered) assert.ok(CREATABLE[t].linkFields[v] || resolveLink(t, v), `${v} -> new ${t} is offered but can't be linked`);
    }
  }
});

test("scientific object: detail lists its REAL experiments (unlinkable) + class name; no rename; DELETE removes each experiment copy, then the global copy", async () => {
  await withServer(async (base) => {
    const deletes: string[] = [];
    let puts = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (init?.method === "DELETE") { deletes.push(url); return jsonResponse(200, { result: "ok" }); }
      if (init?.method === "PUT") { puts++; return jsonResponse(200, { result: "x" }); }
      if (url.includes("/experiments")) {
        return jsonResponse(200, { result: [
          { uri: "so-1", name: "P1", experiment: "exp-1", experiment_name: "Trial A" },
          { uri: "so-1", name: "P1", experiment: "phis:set/scientific-object", experiment_name: null },
        ] });
      }
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "P1", rdf_type: "vocabulary:Plant", rdf_type_name: "plant", relations: [] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const detail = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-1`)).json();
    assert.deepEqual(detail, {
      uri: "so-1",
      typeName: "plant",
      actions: ["delete", "link"],
      deleteRemovesLinks: true,
      relations: [{ label: "In experiments", field: "experiment", items: [{ id: "exp-1", label: "Trial A", type: "experiment", groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", items: [] }, { label: "Part of", items: [] }] }] }],
    });
    const put = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "scientific_object", id: "so-1", name: "X" }) });
    assert.equal(put.status, 400);
    assert.equal(puts, 0);

    const del = await realFetch(`${base}/api/node?type=scientific_object&id=so-1`, { method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal(deletes.length, 2);
    assert.match(deletes[0], /scientific_objects\/so-1\?experiment=exp-1$/, "experiment copy first");
    assert.match(deletes[1], /scientific_objects\/so-1$/, "then the global copy");
  });
});

test("scientific object: germplasm and parent are read from EACH experiment copy (not the global one), named in one call per row", async () => {
  await withServer(async (base) => {
    const named: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/so-1/experiments")) {
        return jsonResponse(200, { result: [
          { experiment: "exp-a", experiment_name: "Barley 2025" },
          { experiment: "exp-b", experiment_name: "Barley 2026" },
        ] });
      }
      if (url.includes("/by_uris")) {
        const uris = JSON.parse(String(init?.body)) as string[];
        named.push(`${url.includes("germplasm") ? "germplasm" : "so"}:${uris.join(",")}`);
        const names: Record<string, string> = { "phis:id/annika": "Annika", "phis:id/arild": "Arild", "phis:id/block-a": "Block A" };
        return jsonResponse(200, { result: uris.map((u) => ({ uri: u.replace("phis:", "https://phis.pheno.no/"), name: names[u] })) });
      }
      if (url.includes("so-1?experiment=exp-a")) {
        return jsonResponse(200, { result: { uri: "so-1", name: "Plot 1", relations: [{ property: "vocabulary:hasGermplasm", value: "phis:id/annika" }] } });
      }
      if (url.includes("so-1?experiment=exp-b")) {
        return jsonResponse(200, { result: { uri: "so-1", name: "Plot 1", relations: [
          { property: "http://www.opensilex.org/vocabulary/oeso#hasGermplasm", value: "phis:id/arild" },
          { property: "vocabulary:hasGermplasm", value: "phis:id/annika" },
          { property: "vocabulary:isPartOf", value: "phis:id/block-a" },
        ] } });
      }
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "Plot 1", relations: [] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const detail = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-1`)).json();
    const g = (id: string, label: string) => ({ id, type: "germplasm", label });
    assert.deepEqual(detail.relations, [{ label: "In experiments", field: "experiment", items: [
      { id: "exp-a", type: "experiment", label: "Barley 2025", groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", items: [g("phis:id/annika", "Annika")] }, { label: "Part of", items: [] }] },
      { id: "exp-b", type: "experiment", label: "Barley 2026", groups: [
        { label: "Germplasm", field: "hasGermplasm", type: "germplasm", items: [g("phis:id/arild", "Arild"), g("phis:id/annika", "Annika")] },
        { label: "Part of", items: [{ id: "phis:id/block-a", type: "scientific_object", label: "Block A" }] },
      ] },
    ] }]);
    assert.deepEqual(named.sort(), ["germplasm:phis:id/annika", "germplasm:phis:id/arild,phis:id/annika", "so:phis:id/block-a"]);
  });
});

test("PUT /api/node with an experiment: germplasm add/remove rewrites ONLY that copy, keeps every other relation, dedupes, never sends geometry", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    let rels: { property: string; value: string; inverse: boolean }[] = [
      { property: "vocabulary:isPartOf", value: "phis:id/block-a", inverse: false },
      { property: "vocabulary:hasGermplasm", value: "phis:id/annika", inverse: false },
    ];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { const b = JSON.parse(String(init.body)); puts.push(b); rels = b.relations; return jsonResponse(200, { result: "so-1" }); }
      if (url.includes("so-1?experiment=exp-b")) {
        return jsonResponse(200, { result: { uri: "so-1", name: "Plot 1", rdf_type: "vocabulary:Plot", geometry: { type: "Point" }, factor_level: [], relations: rels } });
      }
      if (url.includes("/so-1/experiments")) return jsonResponse(200, { result: [{ experiment: "exp-b", experiment_name: "Barley 2026" }] });
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u.split("/").pop() })) });
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "Plot 1", relations: [] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const put = (body: unknown) => realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const added = await put({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "hasGermplasm", uris: ["https://phis.pheno.no/id/annika", "phis:id/arild"] } });
    assert.equal(added.status, 200);
    assert.deepEqual(puts[0], {
      uri: "so-1", name: "Plot 1", rdf_type: "vocabulary:Plot", experiment: "exp-b",
      relations: [
        { property: "vocabulary:isPartOf", value: "phis:id/block-a", inverse: false },
        { property: "vocabulary:hasGermplasm", value: "phis:id/annika", inverse: false },
        { property: "vocabulary:hasGermplasm", value: "phis:id/arild", inverse: false },
      ],
    }, "annika already there (full vs prefixed uri) is not added twice; parent kept; no geometry");
    const box = (await added.json()).relations[0].items[0];
    assert.deepEqual(box.groups[0].items.map((i: any) => i.id), ["phis:id/annika", "phis:id/arild"]);

    await put({ type: "scientific_object", id: "so-1", experiment: "exp-b", unlink: { field: "hasGermplasm", uri: "https://phis.pheno.no/id/annika" } });
    assert.deepEqual(puts[1].relations.map((r: any) => r.value), ["phis:id/block-a", "phis:id/arild"]);

    const partOf = await put({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "isPartOf", uris: ["x"] } });
    assert.equal(partOf.status, 400, "Part of isn't writable yet");
    assert.equal(puts.length, 2);
  });
});

test("PUT /api/node with an experiment refuses (409, no PUT) when the copy has factor levels not carried in its relations", async () => {
  await withServer(async (base) => {
    let puts = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (init?.method === "PUT") { puts++; return jsonResponse(200, { result: "so-1" }); }
      if (url.includes("so-1?experiment=exp-b")) return jsonResponse(200, { result: { uri: "so-1", name: "P", rdf_type: "vocabulary:Plot", factor_level: [{ uri: "fl-1" }], relations: [] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const res = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "hasGermplasm", uris: ["g"] } }) });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /factor levels/);
    assert.equal(puts, 0);
  });
});

test("scientific object in no experiment says why nothing can be set; an experiment lists its derived Species", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/so-lone/experiments")) return jsonResponse(200, { result: [{ experiment: "phis:set/scientific-object", experiment_name: null }] });
      if (url.includes("/core/scientific_objects/so-lone")) return jsonResponse(200, { result: { uri: "so-lone", name: "Lone" } });
      if (url.includes("/exp-1/species")) return jsonResponse(200, { result: [{ uri: "https://phis.pheno.no/id/barley", name: "Hordeum vulgare" }] });
      if (url.includes("/core/scientific_objects?experiment=")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/experiments/exp-1")) return jsonResponse(200, { result: { uri: "exp-1", name: "E" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const so = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-lone`)).json();
    assert.deepEqual(so.relations, [{ label: "In experiments", field: "experiment", items: [], emptyText: "Not in any experiment. Germplasm and parent can only be set inside an experiment." }]);
    const exp = await (await realFetch(`${base}/api/node-detail?type=experiment&id=exp-1`)).json();
    assert.deepEqual(exp.relations, [{ label: "Species", items: [{ id: "phis:id/barley", type: "germplasm", label: "Hordeum vulgare" }] }]);
  });
});

test("scientific object <-> experiment links are operations: /api/link POSTs a copy (skipping ones already there), unlink deletes only that experiment's copy", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    let posted: any = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      const m = init?.method ?? "GET";
      if (m === "POST") { posted = JSON.parse(String(init!.body)); calls.push("POST"); return jsonResponse(201, { result: "so-1" }); }
      if (m === "DELETE") { calls.push("DELETE " + url.split("/core/")[1]); return jsonResponse(200, { result: "ok" }); }
      if (url.includes("/so-1/experiments")) return jsonResponse(200, { result: [{ experiment: "exp-A", experiment_name: "A" }] });
      // With experiment + object selected, the experiment side owns the link: it reads its own SOs.
      if (url.includes("scientific_objects?experiment=exp-A")) return jsonResponse(200, { result: [{ uri: "so-1", name: "Plant 1" }] });
      if (url.includes("scientific_objects?experiment=exp-B")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "Plant 1", rdf_type: "vocabulary:Plant" } });
      throw new Error(`unexpected fetch: ${m} ${url}`);
    }) as typeof fetch;

    const link = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ type: "experiment", id: "exp-A" }, { type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }] }),
    });
    assert.equal(link.status, 200);
    assert.deepEqual(await link.json(), { ok: true, linkedPairs: 1, alreadyLinked: 1 });
    assert.deepEqual(posted, { uri: "so-1", name: "Plant 1", rdf_type: "vocabulary:Plant", experiment: "exp-B" }, "a copy into exp-B, carrying the global name/type");

    calls.length = 0;
    const unlink = await realFetch(`${base}/api/node`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "scientific_object", id: "so-1", unlink: { field: "experiment", uri: "exp-A" } }),
    });
    assert.equal(unlink.status, 200);
    assert.deepEqual(calls, ["DELETE scientific_objects/so-1?experiment=exp-A"], "only exp-A's copy — never the global one");
  });
});

test("/api/link offers carry-over: germplasm an object has in OTHER experiments, once per value, none for objects without labels; writes nothing itself", async () => {
  await withServer(async (base) => {
    const writes: string[] = [];
    const copies: Record<string, { property: string; value: string }[]> = {
      "so-1|exp-A": [{ property: "vocabulary:hasGermplasm", value: "phis:id/annika" }, { property: "vocabulary:isPartOf", value: "phis:id/blk" }],
      "so-1|exp-C": [{ property: "vocabulary:hasGermplasm", value: "phis:id/arild" }, { property: "vocabulary:hasGermplasm", value: "phis:id/annika" }],
      "so-1|exp-B": [], "so-2|exp-A": [], "so-2|exp-B": [],
    };
    const names: Record<string, string> = { "exp-A": "Barley 2025", "exp-B": "Barley 2027", "exp-C": "Barley 2026" };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      const m = init?.method ?? "GET";
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u.split("/").pop() })) });
      if (m !== "GET") { writes.push(`${m} ${url.split("/core/")[1]}`); return jsonResponse(201, { result: "x" }); }
      const exps = url.match(/\/(so-\d)\/experiments/);
      if (exps) {
        const ids = Object.keys(copies).filter((k) => k.startsWith(exps[1] + "|")).map((k) => k.split("|")[1]);
        return jsonResponse(200, { result: ids.map((e) => ({ experiment: e, experiment_name: names[e] })) });
      }
      if (url.includes("scientific_objects?experiment=exp-B")) return jsonResponse(200, { result: [] });
      const copy = url.match(/scientific_objects\/(so-\d)\?experiment=(exp-\w)/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], relations: copies[`${copy[1]}|${copy[2]}`] } });
      const glob = url.match(/scientific_objects\/(so-\d)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: glob[1] === "so-1" ? "Plot 1" : "Plot 2", rdf_type: "vocabulary:Plot" } });
      throw new Error(`unexpected fetch: ${m} ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ type: "experiment", id: "exp-B" }, { type: "scientific_object", id: "so-1" }, { type: "scientific_object", id: "so-2" }] }),
    });
    const body = await res.json();
    const offer = (value: string, label: string, from: string) => ({
      type: "scientific_object", id: "so-1", label: "Plot 1", experiment: "exp-B", experimentLabel: "Barley 2027",
      field: "hasGermplasm", value, valueType: "germplasm", valueLabel: label, from,
    });
    assert.deepEqual(body.carryOver, [offer("phis:id/annika", "annika", "Barley 2025"), offer("phis:id/arild", "arild", "Barley 2026")],
      "annika once (from the first experiment that has it); parent not offered; nothing for so-2");
    assert.deepEqual(writes, ["POST scientific_objects", "POST scientific_objects"], "only the two new copies — no label written");
  });
});

test("GET /api/node-detail rejects an unsupported type or missing id", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/node-detail?type=germplasm&id=x`);
    assert.equal(res.status, 400);
  });
});

test("GET /api/node-detail maps a FacilityGetDTO into relation groups", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/fac-1")) {
        return jsonResponse(200, {
          result: {
            uri: "fac-1",
            name: "Greenhouse 1",
            organizations: [{ uri: "org-1", name: "UiT" }],
            sites: [],
            devices: [{ uri: "dev-1", name: "Camera A" }],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node-detail?type=facility&id=fac-1`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      uri: "fac-1",
      actions: ["rename", "delete", "link"],
      relations: [
        // "field" present = unlinkable from the detail pane (see updateLinkFields); Devices
        // isn't settable on FacilityUpdateDTO at all, so it has no field.
        { label: "Organizations", field: "organizations", items: [{ id: "org-1", type: "organization", label: "UiT" }] },
        { label: "Devices", items: [{ id: "dev-1", type: "device", label: "Camera A" }] },
      ],
    });
  });
});

test("GET /api/node-detail maps an OrganizationGetDTO into relation groups, skipping empty ones (children/sites/experiments)", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-1")) {
        return jsonResponse(200, {
          result: {
            uri: "org-1",
            name: "UiT",
            parents: [],
            children: [{ uri: "org-2", name: "BFE" }],
            facilities: [{ uri: "fac-1", name: "Greenhouse 1" }],
            sites: [],
            experiments: [],
          },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node-detail?type=organization&id=org-1`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      uri: "org-1",
      actions: ["rename", "delete", "link"],
      relations: [
        // children isn't settable on OrganizationUpdateDTO — no field. facilities is.
        { label: "Child organizations", items: [{ id: "org-2", type: "organization", label: "BFE" }] },
        { label: "Facilities", field: "facilities", items: [{ id: "fac-1", type: "facility", label: "Greenhouse 1" }] },
      ],
    });
  });
});

test("PUT /api/node on an organization carries only its settable link fields (parents/facilities) forward, not read-only ones (children/sites/experiments)", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-1") && init?.method === undefined) {
        return jsonResponse(200, {
          result: {
            uri: "org-1",
            name: "Old Name",
            parents: [{ uri: "parent-1" }],
            children: [{ uri: "child-1" }],
            facilities: [{ uri: "fac-1" }],
            sites: [{ uri: "site-1" }],
            experiments: [{ uri: "exp-1" }],
          },
        });
      }
      if (url.endsWith("/core/organisations") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "org-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "organization", id: "org-1", name: "New Name" }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(putBody, { uri: "org-1", name: "New Name", parents: ["parent-1"], facilities: ["fac-1"] });
  });
});

test("PUT /api/node with `unlink` drops just that one uri from its field, keeps the current name, and returns the refreshed relations (not a second GET needed)", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/fac-1") && init?.method === undefined) {
        return jsonResponse(200, {
          result: {
            uri: "fac-1",
            name: "Greenhouse 1",
            organizations: [
              { uri: "org-1", name: "UiT" },
              { uri: "org-2", name: "NMBU" },
            ],
            sites: [],
          },
        });
      }
      if (url.endsWith("/core/facilities") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "fac-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "facility", id: "fac-1", unlink: { field: "organizations", uri: "org-1" } }),
    });

    assert.equal(res.status, 200);
    // name wasn't in the request body — carried forward from the current DTO, not blanked.
    assert.deepEqual(putBody, { uri: "fac-1", name: "Greenhouse 1", organizations: ["org-2"], sites: [] });
    const body = await res.json();
    assert.deepEqual(body.relations, [
      { label: "Organizations", field: "organizations", items: [{ id: "org-2", type: "organization", label: "NMBU" }] },
    ]);
  });
});

test("GET /api/node-detail surfaces a real OpenSILEX error (e.g. 404) as its own status/message, not a generic 502", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/missing")) {
        return jsonResponse(404, { result: { message: "Facility URI not found" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node-detail?type=facility&id=missing`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, "Facility URI not found");
  });
});

test("PUT /api/node reads the current facility first and carries organizations/sites forward unchanged (no accidental unlink)", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/fac-1") && (!init || init.method === undefined)) {
        return jsonResponse(200, {
          result: { uri: "fac-1", name: "Old Name", organizations: [{ uri: "org-1" }], sites: [{ uri: "site-1" }] },
        });
      }
      if (url.endsWith("/core/facilities") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "fac-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "facility", id: "fac-1", name: "New Name" }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "fac-1", type: "facility", label: "New Name" });
    assert.deepEqual(putBody, { uri: "fac-1", name: "New Name", organizations: ["org-1"], sites: ["site-1"] });
  });
});

test("PUT /api/node with `link` (no name) adds the uri to that field, carries the current name forward, and doesn't require a second endpoint", async () => {
  // This is what powers explicit organization<->organization direction ("set as parent" /
  // "set as child") — a plain PUT /api/node, not a new route, since the only thing that
  // differs from unlink is adding instead of removing.
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-a") && init?.method === undefined) {
        return jsonResponse(200, { result: { uri: "org-a", name: "Org A", parents: [{ uri: "org-existing" }], facilities: [] } });
      }
      if (url.endsWith("/core/organisations") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "org-a" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "organization", id: "org-a", link: { field: "parents", uris: ["org-b"] } }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { id: "org-a", type: "organization", label: "Org A" });
    assert.deepEqual(putBody, { uri: "org-a", name: "Org A", parents: ["org-existing", "org-b"], facilities: [] });
  });
});

test("DELETE /api/node surfaces an OpenSILEX 409 (referential-integrity conflict) with its real message", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/fac-1") && init?.method === "DELETE") {
        return jsonResponse(409, { result: { message: "The facility cannot be deleted because it is used in 1 Triples" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node?type=facility&id=fac-1`, { method: "DELETE" });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.match(body.error, /cannot be deleted/);
  });
});

test("DELETE /api/node succeeds when OpenSILEX allows it", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/facilities/fac-1") && init?.method === "DELETE") {
        return jsonResponse(200, { result: "fac-1" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/node?type=facility&id=fac-1`, { method: "DELETE" });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
});


test("POST /api/link rejects fewer than two items", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ type: "organization", id: "org-1" }] }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/link rejects a selection where nothing resolves (all same type)", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "organization", id: "org-1" },
          { type: "organization", id: "org-2" },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /nothing in this selection can be linked directly/);
  });
});

test("POST /api/link rejects a type pair with no settable relation between them", async () => {
  await withServer(async (base) => {
    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "organization", id: "org-1" },
          { type: "device", id: "dev-1" },
        ],
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /nothing in this selection can be linked directly/);
  });
});

test("POST /api/link with a 1:1 pair adds the other node's uri to the owning side's field, keeping existing links and its own name", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-1") && init?.method === undefined) {
        return jsonResponse(200, { result: { uri: "org-1", name: "UiT", parents: [], facilities: [{ uri: "fac-existing" }] } });
      }
      if (url.endsWith("/core/organisations") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "org-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "organization", id: "org-1" },
          { type: "facility", id: "fac-new" },
        ],
      }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, linkedPairs: 1, alreadyLinked: 0 });
    // The organization owns the "facilities" field — its existing link (fac-existing) stays,
    // the new one (fac-new) is appended, and its own name is carried forward untouched.
    assert.deepEqual(putBody, { uri: "org-1", name: "UiT", parents: [], facilities: ["fac-existing", "fac-new"] });
  });
});

test("POST /api/link is a no-op on the wire if the two are already linked (no duplicate uri)", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-1") && init?.method === undefined) {
        return jsonResponse(200, { result: { uri: "org-1", name: "UiT", parents: [], facilities: [{ uri: "fac-1" }] } });
      }
      if (url.endsWith("/core/organisations") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "org-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "organization", id: "org-1" },
          { type: "facility", id: "fac-1" },
        ],
      }),
    });

    assert.equal(res.status, 200);
    // The uri was already linked, so the count reports it as such rather than claiming a fresh
    // link happened for what was actually a no-op PUT.
    assert.deepEqual(await res.json(), { ok: true, linkedPairs: 0, alreadyLinked: 1 });
    assert.deepEqual(putBody, { uri: "org-1", name: "UiT", parents: [], facilities: ["fac-1"] });
  });
});

test("POST /api/link with N facilities and 1 organization batches all N into ONE PUT to the org, not N separate calls", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    let putCount = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/organisations/org-1") && init?.method === undefined) {
        return jsonResponse(200, { result: { uri: "org-1", name: "UiT", parents: [], facilities: [] } });
      }
      if (url.endsWith("/core/organisations") && init?.method === "PUT") {
        putCount++;
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "org-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [
          { type: "organization", id: "org-1" },
          { type: "facility", id: "fac-1" },
          { type: "facility", id: "fac-2" },
          { type: "facility", id: "fac-3" },
          { type: "facility", id: "fac-4" },
        ],
      }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, linkedPairs: 4, alreadyLinked: 0 });
    assert.equal(putCount, 1, "expected exactly one PUT to the organization, not one per facility");
    assert.deepEqual(putBody, { uri: "org-1", name: "UiT", parents: [], facilities: ["fac-1", "fac-2", "fac-3", "fac-4"] });
  });
});

for (const withAddress of [false, true]) {
  test(`PUT /api/node rename on a site ${withAddress ? "WITH an address is refused (409, no PUT) — OpenSILEX corrupts it" : "keeps non-link fields (description/rdf_type/groups) — a full-replace PUT must not wipe them"}`, async () => {
    await withServer(async (base) => {
      let putBody: unknown = null;
      const dto = {
        uri: "site-1", name: "Old", rdf_type: "org:Site", description: "Holt farm", address: withAddress ? { locality: "Tromsø" } : null,
        groups: [{ uri: "grp-1", name: "G" }], organizations: [{ uri: "org-1", name: "NIBIO" }], facilities: [],
      };
      globalThis.fetch = (async (url: string, init?: RequestInit) => {
        if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
        if (url.includes("/core/sites/site-1") && init?.method === undefined) return jsonResponse(200, { result: dto });
        if (url.endsWith("/core/sites") && init?.method === "PUT") {
          putBody = JSON.parse(String(init.body));
          return jsonResponse(200, { result: "site-1" });
        }
        throw new Error(`unexpected fetch: ${url} ${init?.method}`);
      }) as typeof fetch;

      const res = await realFetch(`${base}/api/node`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "site", id: "site-1", name: "New" }),
      });

      if (withAddress) {
        assert.equal(res.status, 409);
        assert.equal(putBody, null, "must not PUT at all");
      } else {
        assert.equal(res.status, 200);
        assert.deepEqual(putBody, {
          uri: "site-1", name: "New", rdf_type: "org:Site", description: "Holt farm", address: null,
          groups: ["grp-1"], organizations: ["org-1"], facilities: [],
        });
      }
    });
  });
}

test("POST /api/link with an organization and a site PUTs to the SITE (org's `sites` is derived, not settable)", async () => {
  await withServer(async (base) => {
    let putBody: unknown = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/sites/site-1") && init?.method === undefined) {
        return jsonResponse(200, { result: { uri: "site-1", name: "Holt", organizations: [], facilities: [] } });
      }
      if (url.endsWith("/core/sites") && init?.method === "PUT") {
        putBody = JSON.parse(String(init.body));
        return jsonResponse(200, { result: "site-1" });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method}`);
    }) as typeof fetch;

    const res = await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ type: "organization", id: "org-1" }, { type: "site", id: "site-1" }] }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(putBody, { uri: "site-1", name: "Holt", organizations: ["org-1"], facilities: [] });
  });
});
