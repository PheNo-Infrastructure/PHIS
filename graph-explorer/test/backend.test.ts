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
      body: JSON.stringify({ type: "variable", name: "x", links: [] }),
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
      if (url.includes("/exp-1/factors")) return jsonResponse(200, { result: [] });
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
    assert.match((await blocked.json()).error, /Plant 1 is still in it \(scientific objects\)\. Remove it first/);
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
      if (url.includes("/exp-1/factors")) return jsonResponse(200, { result: [] });
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

test("germplasm node-detail: single-uri species labelled from species_name, members minus itself (full vs prefixed uri); rename, delete and link", async () => {
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
    assert.deepEqual(detail.actions, ["rename", "delete", "link"]);
    assert.deepEqual(detail.relations, [
      { label: "Species", items: [{ id: "phis:id/parent", type: "germplasm", label: "Parent", kind: "species" }] },
      { label: "Varieties and accessions", items: [{ id: "phis:id/acc", type: "germplasm", label: "A1" }] },
      { label: "Experiments", items: [{ id: "exp-1", type: "experiment", label: "E" }] },
    ]);
  });
});

test("visibility: node-detail says isPublic for germplasm; PUT isPublic keeps the germplasm's own species/variety; refused for types without the flag", async () => {
  await withServer(async (base) => {
    let putBody: any = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.endsWith("/core/germplasm") && init?.method === "PUT") { putBody = JSON.parse(String(init.body)); return jsonResponse(200, { result: "g-1" }); }
      if (url.includes("/core/germplasm?species=") || url.includes("/experiments?")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/germplasm/")) {
        return jsonResponse(200, { result: { uri: "g-1", name: "Tiril", rdf_type: "vocabulary:Variety", species: "sp-1", species_name: "Barley", variety: null, is_public: false, groups: [] } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const detail = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=g-1`)).json();
    assert.equal(detail.isPublic, false);

    const put = (body: unknown) => realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await put({ type: "germplasm", id: "g-1", isPublic: true })).status, 200);
    assert.deepEqual(putBody, { uri: "g-1", name: "Tiril", rdf_type: "vocabulary:Variety", species: "sp-1", species_name: "Barley", variety: null, is_public: true, groups: [] });

    putBody = null;
    assert.equal((await put({ type: "facility", id: "f-1", isPublic: true })).status, 400);
    assert.equal((await put({ type: "germplasm", id: "g-1", isPublic: "yes" })).status, 400);
    assert.equal(putBody, null);
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
      const inExperimentOnly = NODE_TYPES[t]?.inExperiment?.byType[v] || NODE_TYPES[v]?.inExperiment?.byType[t];
      const offered = CREATABLE[t].linkFields[v] || (v !== t && linkable.has(t) && linkable.has(v) && !inExperimentOnly);
      if (offered) assert.ok(CREATABLE[t].linkFields[v] || resolveLink(t, v), `${v} -> new ${t} is offered but can't be linked`);
    }
  }
});

test("scientific object: detail lists its REAL experiments (unlinkable, with its name in each) + class name; DELETE removes each experiment copy, then the global copy", async () => {
  await withServer(async (base) => {
    const deletes: string[] = [];
    let puts = 0;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: 0 }); // no measured values
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
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
      actions: ["rename", "delete", "link"],
      deleteRemovesLinks: true,
      relations: [{ label: "In experiments", field: "experiment", items: [{ id: "exp-1", label: "Trial A", name: "P1", type: "experiment", groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [] }, { label: "Part of", field: "isPartOf", type: "scientific_object", items: [] }, { label: "Contains", field: "contains", type: "scientific_object", items: [] }, { label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [] }] }] }],
    });
    const del = await realFetch(`${base}/api/node?type=scientific_object&id=so-1`, { method: "DELETE" });
    assert.equal(del.status, 200);
    assert.equal(puts, 0);
    assert.equal(deletes.length, 2);
    assert.match(deletes[0], /scientific_objects\/so-1\?experiment=exp-1$/, "experiment copy first");
    assert.match(deletes[1], /scientific_objects\/so-1$/, "then the global copy");
  });
});

// Probed 2026-10-02: each copy has its own name; renaming one leaves the others alone.
test("scientific object rename: only the copy in the given experiment (relations sent back), its only experiment (+ the global copy) when it has one, the global copy when in none; several ask; a name taken in that experiment is refused", async () => {
  await withServer(async (base) => {
    const puts: Record<string, unknown>[] = [];
    let experimentsOf: Record<string, unknown>[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "so-1" }); }
      if (url.includes("/so-1/experiments")) return jsonResponse(200, { result: experimentsOf });
      // The taken-name check: exp-b already has a "P9".
      if (url.includes("&name=")) return jsonResponse(200, { result: url.includes("exp-b") && /p9/i.test(decodeURIComponent(url)) ? [{ uri: "so-9", name: "P9" }] : [] });
      if (url.includes("/core/scientific_objects/so-1")) {
        const exp = new URL(url).searchParams.get("experiment");
        return jsonResponse(200, { result: { uri: "so-1", name: exp ? `P1 in ${exp}` : "P1", rdf_type: "vocabulary:Plant", relations: exp ? [{ property: "vocabulary:isPartOf", value: "so-0", inverse: false }] : [] } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const nodePut = (b: string, body: unknown) => realFetch(`${b}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const A = { experiment: "exp-a", experiment_name: "Trial A", name: "P1" };
    const B = { experiment: "exp-b", experiment_name: "Trial B", name: "P1" };

    experimentsOf = [A, B];
    const inB = await nodePut(base, { type: "scientific_object", id: "so-1", name: " P2 ", experiment: "exp-b" });
    assert.equal(inB.status, 200, await inB.clone().text());
    assert.equal((await inB.json()).label, "P2");
    assert.deepEqual(puts.pop(), { uri: "so-1", name: "P2", rdf_type: "vocabulary:Plant", experiment: "exp-b", relations: [{ property: "vocabulary:isPartOf", value: "so-0", inverse: false }] });

    const several = await nodePut(base, { type: "scientific_object", id: "so-1", name: "P2" });
    assert.equal(several.status, 400);
    assert.match((await several.json()).error, /own name in each of its experiments \(Trial A, Trial B\)/);

    const taken = await nodePut(base, { type: "scientific_object", id: "so-1", name: "p9", experiment: "exp-b" });
    assert.equal(taken.status, 400);
    assert.match((await taken.json()).error, /already a scientific object in Trial B named "P9"/);

    const elsewhere = await nodePut(base, { type: "scientific_object", id: "so-1", name: "P2", experiment: "exp-z" });
    assert.equal(elsewhere.status, 400);
    assert.equal(puts.length, 0, "refusals write nothing");

    experimentsOf = [A];
    assert.equal((await nodePut(base, { type: "scientific_object", id: "so-1", name: "P3" })).status, 200);
    assert.deepEqual(puts.splice(0).map((p) => [p.name, p.experiment]), [["P3", "exp-a"], ["P3", undefined]], "its one experiment, and the global copy with it (search reads global names)");
    assert.equal((await nodePut(base, { type: "scientific_object", id: "so-1", name: "P5", experiment: "exp-a" })).status, 200);
    assert.equal(puts.splice(0).length, 2, "the same from the box");

    experimentsOf = [{ experiment: "phis:set/scientific-object", experiment_name: null, name: "P1" }];
    assert.equal((await nodePut(base, { type: "scientific_object", id: "so-1", name: "P4" })).status, 200);
    const global = puts.pop()!;
    assert.equal(global.name, "P4");
    assert.ok(!("experiment" in global), "the global copy");
  });
});

test("scientific object: germplasm and parent are read from EACH experiment copy (not the global one), named in one call per row", async () => {
  await withServer(async (base) => {
    const named: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: 0 }); // no measured values
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
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
      { id: "exp-a", type: "experiment", label: "Barley 2025", groups: [{ label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [g("phis:id/annika", "Annika")] }, { label: "Part of", field: "isPartOf", type: "scientific_object", items: [] }, { label: "Contains", field: "contains", type: "scientific_object", items: [] }, { label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [] }] },
      { id: "exp-b", type: "experiment", label: "Barley 2026", groups: [
        { label: "Germplasm", field: "hasGermplasm", type: "germplasm", addable: true, items: [g("phis:id/arild", "Arild"), g("phis:id/annika", "Annika")] },
        { label: "Part of", field: "isPartOf", type: "scientific_object", items: [{ id: "phis:id/block-a", type: "scientific_object", label: "Block A" }] },
        { label: "Contains", field: "contains", type: "scientific_object", items: [] },
        { label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [] },
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
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] });
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

    const partOf = await put({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "isPartOf", uris: ["phis:id/block-b"] } });
    assert.equal(partOf.status, 200);
    assert.deepEqual(puts[2].relations.map((r: any) => r.value), ["phis:id/arild", "phis:id/block-b"], "one parent: block-a replaced, germplasm kept");

    const bad = await put({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "hasNothing", uris: ["x"] } });
    assert.equal(bad.status, 400, "only the per-experiment rows can be written");
    assert.equal(puts.length, 3);
  });
});

test("scientific object: factor levels show per experiment as selectable levels ('Replicate: 2'), removable, and a germplasm edit sends them back", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    const rels = [{ property: "vocabulary:hasFactorLevel", value: "https://phis.pheno.no/id/factor/rep.2", inverse: false }];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: 0 }); // no measured values
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "so-1" }); }
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] });
      if (url.includes("/experiments/exp-b/factors")) {
        return jsonResponse(200, { result: [{ uri: "https://phis.pheno.no/id/factor/rep", name: "Replicate", levels: [{ uri: "https://phis.pheno.no/id/factor/rep.1", name: "1" }, { uri: "https://phis.pheno.no/id/factor/rep.2", name: "2" }] }] });
      }
      if (url.includes("so-1?experiment=exp-b")) return jsonResponse(200, { result: { uri: "so-1", name: "P", rdf_type: "vocabulary:Plot", factor_level: null, relations: rels } });
      if (url.includes("/so-1/experiments")) return jsonResponse(200, { result: [{ experiment: "exp-b", experiment_name: "Barley 2026" }] });
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u })) });
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "P", relations: [] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const detail = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-1`)).json();
    const row = detail.relations[0].items[0].groups.find((g: any) => g.label === "Factor levels");
    assert.deepEqual(row, { label: "Factor levels", field: "hasFactorLevel", type: "factor_level", items: [{ id: "https://phis.pheno.no/id/factor/rep.2", type: "factor_level", label: "Replicate: 2", factor: "https://phis.pheno.no/id/factor/rep" }] });

    const res = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "scientific_object", id: "so-1", experiment: "exp-b", link: { field: "hasGermplasm", uris: ["phis:id/g"] } }) });
    assert.equal(res.status, 200);
    assert.deepEqual(puts[0].relations.map((r: any) => r.property), ["vocabulary:hasFactorLevel", "vocabulary:hasGermplasm"]);
  });
});

test("scientific object in no experiment says why nothing can be set; an experiment lists its derived Species", async () => {
  await withServer(async (base) => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: 0 }); // no measured values
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/so-lone/experiments")) return jsonResponse(200, { result: [{ experiment: "phis:set/scientific-object", experiment_name: null }] });
      if (url.includes("/core/scientific_objects/so-lone")) return jsonResponse(200, { result: { uri: "so-lone", name: "Lone" } });
      if (url.includes("/exp-1/species")) return jsonResponse(200, { result: [{ uri: "https://phis.pheno.no/id/barley", name: "Hordeum vulgare" }] });
      if (url.includes("/exp-1/factors")) return jsonResponse(200, { result: [] });
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

test("scientific object with measured values: Delete is blocked with the count and where they came from, the fix deletes only its values (counted with the object in the body), then Delete goes through", async () => {
  await withServer(async (base) => {
    let values = 189;
    const writes: string[] = [];
    const counted: unknown[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) { counted.push(JSON.parse(String(init?.body))); return jsonResponse(200, { result: values }); }
      if (url.includes("/core/data/provenances/by_targets")) return jsonResponse(200, { result: [{ uri: "prov-1", name: "TraitFinder import 5 Oct" }] });
      if (method === "DELETE") { writes.push(`DELETE ${url.replace(/^.*\/rest/, "")}`); if (url.includes("/core/data?")) values = 0; return jsonResponse(200, { result: "ok" }); }
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/so-1/experiments")) return jsonResponse(200, { result: [{ experiment: "phis:set/scientific-object", experiment_name: null }] });
      if (url.includes("/core/scientific_objects/so-1")) return jsonResponse(200, { result: { uri: "so-1", name: "PB001" } });
      throw new Error(`unexpected fetch: ${method} ${url}`);
    }) as typeof fetch;

    const so = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-1`)).json();
    assert.equal(so.deleteBlocked, "has 189 measured values (from TraitFinder import 5 Oct). Delete them first.");
    assert.deepEqual(so.deleteFix, { label: "Delete its 189 measured values", confirm: "Delete PB001's 189 measured values (from TraitFinder import 5 Oct)? Measured values are research data: they can't be recovered." });
    assert.deepEqual(counted[0], ["so-1"], "the object in the body — as a query parameter PHIS counts everything");

    const refused = await realFetch(`${base}/api/node?type=scientific_object&id=so-1`, { method: "DELETE" });
    assert.equal(refused.status, 409, "the server enforces the block too");
    assert.deepEqual(writes, []);

    assert.equal((await realFetch(`${base}/api/node/delete-fix?type=scientific_object&id=so-1`, { method: "POST" })).status, 200);
    assert.deepEqual(writes, ["DELETE /core/data?target=so-1"], "only this object's values");
    const after = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-1`)).json();
    assert.equal(after.deleteBlocked, undefined);
    assert.equal(after.deleteFix, undefined);
    assert.equal((await realFetch(`${base}/api/node?type=scientific_object&id=so-1`, { method: "DELETE" })).status, 200);
  });
});

test("scientific object <-> experiment links are operations: /api/link POSTs a copy (skipping ones already there), unlink deletes only that experiment's copy", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    let posted: any = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
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
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
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

test("/api/link object + germplasm: one experiment = written there; several = needsExperiment (nothing written); picked = only those copies; none = notInAny", async () => {
  await withServer(async (base) => {
    const puts: { so: string; exp: string; values: string[] }[] = [];
    const inExps: Record<string, string[]> = { "so-one": ["exp-a"], "so-two": ["exp-a", "exp-b"], "so-b": ["exp-b"], "so-none": [] };
    const names: Record<string, string> = { "exp-a": "Barley 2025", "exp-b": "Barley 2026" };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") {
        const b = JSON.parse(String(init.body));
        puts.push({ so: b.uri, exp: b.experiment, values: b.relations.map((r: any) => r.value) });
        return jsonResponse(200, { result: b.uri });
      }
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] });
      const exps = url.match(/\/(so-[\w-]+)\/experiments/);
      if (exps) return jsonResponse(200, { result: inExps[exps[1]].map((e) => ({ experiment: e, experiment_name: names[e] })) });
      const copy = url.match(/scientific_objects\/(so-[\w-]+)\?experiment=/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], name: copy[1], rdf_type: "vocabulary:Plot", relations: [] } });
      const glob = url.match(/scientific_objects\/(so-[\w-]+)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: `Name of ${glob[1]}` } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const link = async (sos: string[], experiments?: string[]) => (await realFetch(`${base}/api/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [...sos.map((id) => ({ type: "scientific_object", id })), { type: "germplasm", id: "phis:id/annika" }], ...(experiments ? { experiments } : {}) }),
    })).json();

    assert.deepEqual(await link(["so-one"]), {
      ok: true, linkedPairs: 1, alreadyLinked: 0, touched: ["exp-a"],
      written: [{ id: "so-one", values: ["phis:id/annika"], experiments: ["Barley 2025"], only: true }],
    }, "says where, and that nobody was asked (its only experiment)");
    assert.deepEqual(puts, [{ so: "so-one", exp: "exp-a", values: ["phis:id/annika"] }]);

    puts.length = 0;
    assert.deepEqual(await link(["so-one", "so-two"]), { needsExperiment: { notInAny: [], experiments: [
      { id: "exp-a", label: "Barley 2025", objects: 2 }, { id: "exp-b", label: "Barley 2026", objects: 1 },
    ], objects: 2 } });
    assert.equal(puts.length, 0, "nothing written while asking");

    const picked = await link(["so-two", "so-b"], ["exp-a"]);
    assert.deepEqual(puts, [{ so: "so-two", exp: "exp-a", values: ["phis:id/annika"] }], "only the picked experiment's copy");
    assert.equal(picked.skipped, 1, "so-b isn't in exp-a");

    puts.length = 0;
    assert.deepEqual(await link(["so-none", "so-one"]), { needsExperiment: { notInAny: [{ id: "so-none", label: "Name of so-none" }] } });
    assert.equal(puts.length, 0);
  });
});

test("/api/parent: written only in an experiment BOTH share (replacing an earlier parent); several shared = needsExperiment; none shared = noShared; nothing written while asking", async () => {
  await withServer(async (base) => {
    const puts: { so: string; exp: string; relations: string[] }[] = [];
    const inExps: Record<string, string[]> = { plot: ["exp-a", "exp-b"], block: ["exp-b"], block2: ["exp-a", "exp-b"], lone: ["exp-c"] };
    const names: Record<string, string> = { "exp-a": "Barley 2025", "exp-b": "Barley 2026", "exp-c": "Barley 2027" };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") {
        const b = JSON.parse(String(init.body));
        puts.push({ so: b.uri, exp: b.experiment, relations: b.relations.map((r: any) => `${r.property.split(":").pop()}=${r.value}`) });
        return jsonResponse(200, { result: b.uri });
      }
      const exps = url.match(/scientific_objects\/(\w+)\/experiments/);
      if (exps) return jsonResponse(200, { result: inExps[exps[1]].map((e) => ({ experiment: e, experiment_name: names[e] })) });
      const copy = url.match(/scientific_objects\/(\w+)\?experiment=/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], name: copy[1], rdf_type: "vocabulary:Plot", relations: [
        { property: "vocabulary:isPartOf", value: "old-block" }, { property: "vocabulary:hasGermplasm", value: "annika" },
      ] } });
      const glob = url.match(/scientific_objects\/(\w+)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: `The ${glob[1]}` } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const parent = async (pairs: { child: string; parent: string }[], experiments?: string[]) => (await realFetch(`${base}/api/parent`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "scientific_object", pairs, ...(experiments ? { experiments } : {}) }),
    }));

    assert.deepEqual(await (await parent([{ child: "plot", parent: "block" }])).json(), {
      ok: true, linkedPairs: 1, touched: ["exp-b"],
      written: [{ child: "plot", parent: "block", experiments: ["Barley 2026"], only: true }],
    });
    assert.deepEqual(puts, [{ so: "plot", exp: "exp-b", relations: ["hasGermplasm=annika", "isPartOf=block"] }], "only the shared exp-b; old parent replaced, germplasm kept");

    puts.length = 0;
    assert.deepEqual(await (await parent([{ child: "plot", parent: "block2" }])).json(), { needsExperiment: { notInAny: [], experiments: [
      { id: "exp-a", label: "Barley 2025", objects: 1 }, { id: "exp-b", label: "Barley 2026", objects: 1 },
    ], objects: 1 } });
    assert.deepEqual(await (await parent([{ child: "lone", parent: "block" }])).json(), { needsExperiment: { noShared: [
      { id: "lone", label: "The lone", parent: "block", parentLabel: "The block", parentExperiments: [{ id: "exp-b", label: "Barley 2026" }] },
    ] } });
    assert.equal(puts.length, 0, "nothing written while asking");

    await parent([{ child: "plot", parent: "block2" }], ["exp-a"]);
    assert.deepEqual(puts.map((p) => p.exp), ["exp-a"]);
    assert.equal((await parent([{ child: "plot", parent: "plot" }])).status, 400, "an object can't be its own parent");
  });
});

test("scientific object with a location history: detail says why Delete won't work, DELETE is refused (409) before any OpenSILEX delete", async () => {
  await withServer(async (base) => {
    const deletes: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (init?.method === "DELETE") { deletes.push(url); return jsonResponse(200, { result: "ok" }); }
      if (url.includes("/so-geo/experiments")) return jsonResponse(200, { result: [] });
      if (url.includes("/core/scientific_objects/so-geo")) {
        return jsonResponse(200, { result: { uri: "so-geo", name: "Geo plot", location: { geojson: { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] } } } } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const detail = await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=so-geo`)).json();
    assert.match(detail.deleteBlocked, /location history/);
    const del = await realFetch(`${base}/api/node?type=scientific_object&id=so-geo`, { method: "DELETE" });
    assert.equal(del.status, 409);
    assert.match((await del.json()).error, /^It has a location history in PHIS/);
    assert.deepEqual(deletes, []);
  });
});

test("setting germplasm on an object in an experiment offers its children there that lack it (childOffer) — writes nothing to them", async () => {
  await withServer(async (base) => {
    const puts: string[] = [];
    const rels: Record<string, { property: string; value: string }[]> = {
      plot: [], "plant-1": [{ property: "vocabulary:isPartOf", value: "plot" }], "plant-2": [{ property: "vocabulary:isPartOf", value: "plot" }, { property: "vocabulary:hasGermplasm", value: "phis:id/annika" }],
    };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { const b = JSON.parse(String(init.body)); puts.push(b.uri); rels[b.uri] = b.relations; return jsonResponse(200, { result: b.uri }); }
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u === "phis:id/annika" ? "Annika" : u })) });
      if (url.includes("scientific_objects?experiment=exp-b&parent=plot")) return jsonResponse(200, { result: [{ uri: "plant-1", name: "Plant 1" }, { uri: "plant-2", name: "Plant 2" }] });
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
      const exps = url.match(/scientific_objects\/([\w-]+)\/experiments/);
      if (exps) return jsonResponse(200, { result: [{ experiment: "exp-b", experiment_name: "Barley 2026" }] });
      const copy = url.match(/scientific_objects\/([\w-]+)\?experiment=/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], name: copy[1], rdf_type: "vocabulary:Plot", relations: rels[copy[1]] } });
      const glob = url.match(/scientific_objects\/([\w-]+)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: glob[1] === "plot" ? "Plot 1" : glob[1] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const res = await (await realFetch(`${base}/api/node`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "scientific_object", id: "plot", experiment: "exp-b", link: { field: "hasGermplasm", uris: ["phis:id/annika"] } }),
    })).json();
    assert.deepEqual(res.childOffer, [{
      type: "scientific_object", id: "plant-1", label: "Plant 1", experiment: "exp-b", experimentLabel: "Barley 2026",
      field: "hasGermplasm", value: "phis:id/annika", valueType: "germplasm", valueLabel: "Annika", from: "Plot 1", parent: "plot",
    }], "plant-2 already has Annika");
    assert.deepEqual(puts, ["plot"], "only the plot was written");
  });
});

test("/api/unlink: lists the links BETWEEN the selected items in words (nothing written), then removes exactly those on confirm", async () => {
  await withServer(async (base) => {
    const puts: { so: string; relations: string[] }[] = [];
    const rels: Record<string, { property: string; value: string }[]> = {
      plot: [{ property: "vocabulary:hasGermplasm", value: "phis:id/annika" }, { property: "vocabulary:isPartOf", value: "block" }, { property: "vocabulary:hasGermplasm", value: "phis:id/other" }],
      block: [],
    };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] }); // no children
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { const b = JSON.parse(String(init.body)); puts.push({ so: b.uri, relations: b.relations.map((r: any) => r.value) }); rels[b.uri] = b.relations; return jsonResponse(200, { result: b.uri }); }
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u })) });
      const exps = url.match(/scientific_objects\/(\w+)\/experiments/);
      if (exps) return jsonResponse(200, { result: [{ experiment: "exp-b", experiment_name: "Wheat 2026" }] });
      const copy = url.match(/scientific_objects\/(\w+)\?experiment=/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], name: copy[1], rdf_type: "vocabulary:Plot", relations: rels[copy[1]] } });
      const glob = url.match(/scientific_objects\/(\w+)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: glob[1] === "plot" ? "Plot 1" : "Block A" } });
      if (url.includes("/core/germplasm/")) return jsonResponse(200, { result: { uri: "phis:id/annika", name: "Annika" } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const items = [{ type: "scientific_object", id: "plot" }, { type: "germplasm", id: "phis:id/annika" }, { type: "scientific_object", id: "block" }];
    const post = async (confirm: boolean) => (await realFetch(`${base}/api/unlink`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, confirm }) })).json();

    assert.deepEqual((await post(false)).links.sort(), ["Annika on Plot 1 in Wheat 2026", "Plot 1 is part of Block A in Wheat 2026"]);
    assert.equal(puts.length, 0, "the dry run writes nothing");

    const done = await post(true);
    assert.equal(done.removed.length, 2);
    assert.deepEqual(puts.at(-1)!.relations, ["phis:id/other"], "only Annika and the parent removed; the other germplasm kept");
  });
});

test("'Contains' on a parent lists its children in that experiment; removing one clears the CHILD's isPartOf (the parent isn't written)", async () => {
  await withServer(async (base) => {
    const puts: { so: string; relations: string[] }[] = [];
    const rels: Record<string, { property: string; value: string }[]> = { row: [], "plant-b": [{ property: "vocabulary:isPartOf", value: "row" }, { property: "vocabulary:hasGermplasm", value: "zebra" }] };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/data/count")) return jsonResponse(200, { result: 0 }); // no measured values
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "PUT") { const b = JSON.parse(String(init.body)); puts.push({ so: b.uri, relations: b.relations.map((r: any) => r.value) }); rels[b.uri] = b.relations; return jsonResponse(200, { result: b.uri }); }
      if (url.includes("/by_uris")) return jsonResponse(200, { result: (JSON.parse(String(init?.body)) as string[]).map((u) => ({ uri: u, name: u === "plant-b" ? "Plant B" : u })) });
      if (url.includes("&parent=row")) return jsonResponse(200, { result: Object.keys(rels).filter((k) => rels[k].some((r) => r.property.endsWith("isPartOf") && r.value === "row")).map((k) => ({ uri: k, name: k })) });
      if (url.includes("&parent=")) return jsonResponse(200, { result: [] });
      const exps = url.match(/scientific_objects\/([\w-]+)\/experiments/);
      if (exps) return jsonResponse(200, { result: [{ experiment: "exp-b", experiment_name: "Wheat 2026" }] });
      const copy = url.match(/scientific_objects\/([\w-]+)\?experiment=/);
      if (copy) return jsonResponse(200, { result: { uri: copy[1], name: copy[1], rdf_type: "vocabulary:Plot", relations: rels[copy[1]] } });
      const glob = url.match(/scientific_objects\/([\w-]+)$/);
      if (glob) return jsonResponse(200, { result: { uri: glob[1], name: glob[1] } });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const contains = async () => (await (await realFetch(`${base}/api/node-detail?type=scientific_object&id=row`)).json()).relations[0].items[0].groups.find((g: any) => g.label === "Contains");
    assert.deepEqual(await contains(), { label: "Contains", field: "contains", type: "scientific_object", items: [{ id: "plant-b", type: "scientific_object", label: "Plant B" }] });

    const res = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "scientific_object", id: "row", experiment: "exp-b", unlink: { field: "contains", uri: "plant-b" } }) });
    assert.equal(res.status, 200);
    assert.deepEqual(puts, [{ so: "plant-b", relations: ["zebra"] }], "only the child written: its parent gone, its germplasm kept");
    assert.deepEqual((await contains()).items, []);
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
      if (url.includes("/core/devices?facility=")) return jsonResponse(200, { result: [] }); // no devices located there
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
      if (url.includes("/core/devices?facility=")) return jsonResponse(200, { result: [] }); // no devices located there
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

test("GET /api/node-detail: a variable shows its four parts and what its values are; a unit lists the variables using it, with its symbol (both read-only)", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/core/variables/var-1")) {
        return jsonResponse(200, { result: {
          uri: "var-1", name: "Plant Height Max", description: "TraitFinder column", datatype: "http://www.w3.org/2001/XMLSchema#decimal",
          entity: { uri: "ent-1", name: "Plant" }, characteristic: { uri: "ch-1", name: "Plant Height Max" },
          method: { uri: "m-1", name: "PlantEye 3D scan" }, unit: { uri: "u-1", name: "Millimeter", symbol: "mm" }, entity_of_interest: null,
        } });
      }
      if (url.includes("/core/units/u-1")) return jsonResponse(200, { result: { uri: "u-1", name: "Millimeter", symbol: "mm", description: null } });
      if (url.includes("/core/variables?unit=u-1")) return jsonResponse(200, { result: [{ uri: "var-1", name: "Plant Height Max" }] });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    assert.deepEqual(await (await realFetch(`${base}/api/node-detail?type=variable&id=var-1`)).json(), {
      uri: "var-1", actions: [],
      facts: [{ label: "Values", value: "decimal numbers" }, { label: "Description", value: "TraitFinder column" }],
      relations: [
        { label: "Entity", items: [{ id: "ent-1", type: "entity", label: "Plant" }] },
        { label: "Characteristic", items: [{ id: "ch-1", type: "characteristic", label: "Plant Height Max" }] },
        { label: "Method", items: [{ id: "m-1", type: "method", label: "PlantEye 3D scan" }] },
        { label: "Unit", items: [{ id: "u-1", type: "unit", label: "Millimeter" }] },
      ],
    });
    assert.deepEqual(await (await realFetch(`${base}/api/node-detail?type=unit&id=u-1`)).json(), {
      uri: "u-1", actions: [],
      facts: [{ label: "Symbol", value: "mm" }],
      relations: [{ label: "Variables", items: [{ id: "var-1", type: "variable", label: "Plant Height Max" }] }],
    });
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
      if (url.includes("/core/facilities/fac-1") && !init?.method) return jsonResponse(200, { result: { uri: "fac-1", name: "F" } });
      if (url.includes("/core/devices?facility=")) return jsonResponse(200, { result: [] }); // no devices located there
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
      if (url.includes("/core/facilities/fac-1") && !init?.method) return jsonResponse(200, { result: { uri: "fac-1", name: "F" } });
      if (url.includes("/core/devices?facility=")) return jsonResponse(200, { result: [] }); // no devices located there
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

test("GET /api/elsewhere: for an experiment's objects, the OTHER experiments each is in — one list per experiment, not one call per object", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(url);
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (url.includes("/core/experiments?page_size=")) return jsonResponse(200, { result: [
        { uri: "https://phis.pheno.no/id/exp-a", name: "Trial A" }, { uri: "https://phis.pheno.no/id/exp-b", name: "Trial B" }, { uri: "https://phis.pheno.no/id/exp-c", name: "Trial C" },
      ] });
      const lists: Record<string, string[]> = { "exp-a": ["so-1", "so-2", "so-3"], "exp-b": ["so-2", "so-9"], "exp-c": ["so-2", "so-3"] };
      const m = url.match(/scientific_objects\?experiment=([^&]+)/);
      if (m) return jsonResponse(200, { result: (lists[decodeURIComponent(m[1]).split("/").pop()!] ?? []).map((uri) => ({ uri })) });
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const res = await realFetch(`${base}/api/elsewhere?experiment=${encodeURIComponent("phis:id/exp-a")}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      "so-2": [{ id: "https://phis.pheno.no/id/exp-b", label: "Trial B" }, { id: "https://phis.pheno.no/id/exp-c", label: "Trial C" }],
      "so-3": [{ id: "https://phis.pheno.no/id/exp-c", label: "Trial C" }],
    }, "so-1 is only here; itself (prefixed vs full uri) is skipped");
    assert.equal(calls.filter((c) => c.includes("scientific_objects?experiment=")).length, 3, "one list per experiment");
  });
});

test("under a BASE_PATH, the bare sub-path redirects to its trailing-slash form before any page script runs", async () => {
  process.env.BASE_PATH = "/portal";
  try {
    await withServer(async (base) => {
      const res = await realFetch(`${base}/portal`, { redirect: "manual" });
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), "/portal/");
      const page = await realFetch(`${base}/portal/`, { redirect: "manual" });
      assert.equal(page.status, 200, "the slash form is served as before");
    });
  } finally {
    delete process.env.BASE_PATH;
  }
});

// ---------- /api/search ----------
const SEARCH_NS = { result: { phis: "https://phis.pheno.no/" } };
function searchStub(calls: string[], overrides: Record<string, () => Response> = {}) {
  return (async (url: string) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, SEARCH_NS);
    for (const [part, make] of Object.entries(overrides)) if (url.includes(part)) return make();
    if (url.includes("/core/germplasm?")) return jsonResponse(200, {
      result: [{ uri: "https://phis.pheno.no/id/germplasm/annika", name: "Annika", species: "phis:id/germplasm/barley" }],
      metadata: { pagination: { totalCount: 182 } },
    });
    if (url.includes("/core/experiments/factors?")) return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 0 } } });
    if (url.includes("/core/experiments?")) return jsonResponse(200, { result: [{ uri: "e1", name: "Annika trial" }], metadata: { pagination: { totalCount: 1 } } });
    if (url.includes("/core/organisations")) return jsonResponse(200, { result: [{ uri: "o1", name: "Annika Institute" }, { uri: "o2", name: "Other" }] });
    if (url.includes("/core/facilities?")) return jsonResponse(200, { result: [{ uri: "f1", name: "Greenhouse" }] });
    if (url.includes("/core/sites?")) return jsonResponse(200, { result: [] });
    return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 0 } } });
  }) as typeof fetch;
}

test("GET /api/search fans out with OpenSILEX's name filter (20 a type), totals from pagination, rows like the list route's; types that ignore name= are filtered here", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    const res = await realFetch(`${base}/api/search?q=ann`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      { type: "experiment", total: 1, items: [{ id: "e1", type: "experiment", label: "Annika trial" }] },
      { type: "germplasm", total: 182, items: [{ id: "phis:id/germplasm/annika", type: "germplasm", label: "Annika", parent: "phis:id/germplasm/barley" }] },
      { type: "organization", total: 1, items: [{ id: "o1", type: "organization", label: "Annika Institute" }] },
    ]);
    assert.ok(calls.some((u) => u.includes("/core/germplasm?name=ann&page_size=20&page=0")));
    assert.ok(!calls.some((u) => u.includes("/core/organisations?name=")), "organisations ignores name= — never sent");
    assert.ok(!calls.some((u) => /\/core\/(facilities|sites)\?name=/.test(u)), "facilities/sites ignore name= — never sent");
  });
});

test("GET /api/search: one failing type is reported, the others still answer", async () => {
  await withServer(async (base) => {
    globalThis.fetch = searchStub([], { "/core/germplasm?": () => jsonResponse(500, { result: { message: "boom" } }) });
    const body = await (await realFetch(`${base}/api/search?q=ann`)).json();
    const g = body.find((x: any) => x.type === "germplasm");
    assert.equal(g.total, 0);
    assert.deepEqual(g.items, []);
    assert.match(g.error, /boom/);
    assert.ok(body.some((x: any) => x.type === "experiment" && x.total === 1));
  });
});

test("GET /api/search?type=&page= asks only that type, at that page (Show more)", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    const body = await (await realFetch(`${base}/api/search?q=ann&type=germplasm&page=2`)).json();
    assert.equal(body.length, 1);
    assert.equal(body[0].type, "germplasm");
    const opensilex = calls.filter((u) => u.includes("/core/") || u.includes("/security/persons"));
    assert.deepEqual(opensilex.map((u) => u.replace(/^.*\/rest/, "")), ["/core/germplasm?name=ann&page_size=20&page=2"]);
  });
});

test("GET /api/search with an empty query answers [] without asking OpenSILEX", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    assert.deepEqual(await (await realFetch(`${base}/api/search?q=%20`)).json(), []);
    assert.equal(calls.length, 0);
  });
});

test("GET /api/search: regex characters are escaped (OpenSILEX's name= is a regex) and local filtering stays literal", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    globalThis.fetch = searchStub(calls);
    await realFetch(`${base}/api/search?q=${encodeURIComponent("Plant 1) a.b")}`);
    const sent = calls.find((u) => u.includes("/core/germplasm?"))!;
    assert.equal(decodeURIComponent(sent.split("name=")[1].split("&")[0]), "Plant 1\\) a\\.b");
  });
});

// ---------- factors ----------
const FAC = "https://phis.pheno.no/id/factor/exp.rep";
const facDto = { uri: FAC, name: "Replicate", experiment: "https://phis.pheno.no/id/experiment/exp", levels: [{ uri: `${FAC}.1`, name: "1", description: null }, { uri: `${FAC}.2`, name: "2", description: null }] };
function factorStub(calls: string[], puts: any[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: FAC }); }
    if (url.includes("/core/scientific_objects?") && url.includes("factor_levels=")) return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 100 } } });
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}/experiments`)) return jsonResponse(200, { result: [{ uri: facDto.experiment, name: "PBar1x4" }] });
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`)) return jsonResponse(200, { result: facDto });
    if (url.includes(`/core/experiments/${encodeURIComponent(facDto.experiment)}`)) return jsonResponse(200, { result: { uri: facDto.experiment, name: "PBar1x4" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("factor detail: rename and delete allowed, levels are selectable 'Replicate: 1' items, delete warns with the counted cascade", async () => {
  await withServer(async (base) => {
    globalThis.fetch = factorStub([]);
    const d = await (await realFetch(`${base}/api/node-detail?type=factor&id=${encodeURIComponent(FAC)}`)).json();
    assert.deepEqual(d.actions, ["rename", "delete"]);
    assert.equal(d.deleteRemovesLinks, true);
    assert.equal(d.deleteWarning, "It also removes its level from 100 scientific objects in PBar1x4.");
    const levels = d.relations.find((r: any) => r.label === "Levels");
    assert.deepEqual(levels.items, [
      { id: `${FAC}.1`, type: "factor_level", label: "Replicate: 1", factor: FAC },
      { id: `${FAC}.2`, type: "factor_level", label: "Replicate: 2", factor: FAC },
    ]);
  });
});

test("factor rename sends the levels back with their uris and keeps category, description and matches (the PUT replaces the whole factor)", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    const extra = { category: "http://aims.fao.org/aos/agrovoc/c_1234", description: "Irrigation regime", exact_match: ["http://x/e"], close_match: [], broad_match: ["http://x/b"], narrow_match: [] };
    const stub = factorStub([], puts);
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (!init?.method && url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`) && !url.includes("/experiments?") && !url.endsWith("/experiments")) {
        return jsonResponse(200, { result: { ...facDto, ...extra, publisher: { uri: "u" }, publication_date: "2026-10-01" } });
      }
      return stub(url, init);
    }) as typeof fetch;
    const res = await realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "factor", id: FAC, name: "Block" }) });
    assert.equal(res.status, 200);
    assert.deepEqual(puts[0], { uri: FAC, name: "Block", experiment: facDto.experiment, ...extra, levels: facDto.levels });
  });
});

test("factor level detail: its factor, its experiment and the scientific objects that have it", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    const stub = factorStub(calls);
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes(`/core/experiments/factors/levels/${encodeURIComponent(`${FAC}.2`)}`)) return jsonResponse(200, { result: { uri: `${FAC}.2`, name: "2" } });
      if (url.includes("/core/scientific_objects?") && url.includes(`factor_levels=${encodeURIComponent(`${FAC}.2`)}`) && url.includes("page_size=500")) {
        return jsonResponse(200, { result: [{ uri: "https://phis.pheno.no/id/scientific-object/so-pb001", name: "PB001" }] });
      }
      return stub(url, init);
    }) as typeof fetch;
    const d = await (await realFetch(`${base}/api/node-detail?type=factor_level&id=${encodeURIComponent(`${FAC}.2`)}`)).json();
    const group = (label: string) => d.relations.find((r: any) => r.label === label)?.items;
    assert.deepEqual(group("Factor"), [{ id: FAC, type: "factor", label: "Replicate" }]);
    assert.deepEqual(group("Experiment"), [{ id: facDto.experiment, type: "experiment", label: "PBar1x4" }]);
    assert.deepEqual(group("Scientific objects"), [{ id: "https://phis.pheno.no/id/scientific-object/so-pb001", type: "scientific_object", label: "PB001" }]);
  });
});

function levelLinkStub(calls: string[], puts: any[], soExps: Record<string, { experiment: string; experiment_name: string }[]>, rels: any[] = []) {
  return (async (url: string, init?: RequestInit) => {
    calls.push(url);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") { puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "ok" }); }
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`)) return jsonResponse(200, { result: facDto });
    if (url.includes(`/core/experiments/${encodeURIComponent(facDto.experiment)}`)) return jsonResponse(200, { result: { uri: facDto.experiment, name: "PBar1x4" } });
    const m = url.match(/scientific_objects\/([^/?]+)\/experiments/);
    if (m) return jsonResponse(200, { result: soExps[decodeURIComponent(m[1])] ?? [] });
    if (url.includes("?experiment=")) return jsonResponse(200, { result: { uri: "so-1", name: "PB001", rdf_type: "vocabulary:Plant", relations: rels } });
    if (url.includes("/core/scientific_objects/")) return jsonResponse(200, { result: { uri: "so-x", name: url.includes("so-2") ? "PB002" : "PB001" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const linkPost = (base: string, items: any[]) => realFetch(`${base}/api/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
const inPbar = [{ experiment: facDto.experiment, experiment_name: "PBar1x4" }, { experiment: "https://phis.pheno.no/id/experiment/other", experiment_name: "Other" }];

test("link object + level: written on the level's own experiment (no question, even when the object is in two), replacing the same factor's old level and keeping the rest", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    const rels = [
      { property: "vocabulary:hasFactorLevel", value: `${FAC}.1`, inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "https://phis.pheno.no/id/factor/exp.group.a", inverse: false },
      { property: "vocabulary:hasGermplasm", value: "https://phis.pheno.no/id/germplasm/annika", inverse: false },
    ];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar }, rels);
    const res = await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FAC}.2` }]);
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.needsExperiment, undefined);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].experiment, facDto.experiment);
    assert.deepEqual(puts[0].relations.map((r: any) => r.value).sort(), [`${FAC}.2`, "https://phis.pheno.no/id/factor/exp.group.a", "https://phis.pheno.no/id/germplasm/annika"].sort());
  });
});

test("link object + level: an object not in the level's experiment is asked to be added there first (nothing written)", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar, "so-2": [{ experiment: "https://phis.pheno.no/id/experiment/other", experiment_name: "Other" }] });
    const body = await (await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "scientific_object", id: "so-2" }, { type: "factor_level", id: `${FAC}.2` }])).json();
    assert.deepEqual(body.needsExperiment, { notInAny: [{ id: "so-2", label: "PB002" }], placeOptions: [{ id: facDto.experiment, type: "experiment", label: "PBar1x4" }] });
    assert.equal(puts.length, 0);
  });
});

test("create factor: name + experiment + levels (one per line -> [{name}]); no levels or two experiments refused", async () => {
  await withServer(async (base) => {
    const posts: any[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
      if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
      if (init?.method === "POST") { posts.push({ url, body: JSON.parse(String(init.body)) }); return jsonResponse(201, { result: [FAC] }); }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;
    const create = (body: unknown) => realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const exp = { type: "experiment", id: facDto.experiment };

    const ok = await create({ type: "factor", name: "Replicate", links: [exp], fields: { levels: "1\n 2 \n\n3" } });
    assert.equal(ok.status, 201);
    assert.deepEqual(posts[0].body, { name: "Replicate", experiment: facDto.experiment, levels: [{ name: "1" }, { name: "2" }, { name: "3" }] });
    assert.match(posts[0].url, /\/core\/experiments\/factors$/);

    const none = await create({ type: "factor", name: "X", links: [exp], fields: { levels: " \n " } });
    assert.equal(none.status, 400);
    assert.match((await none.json()).error, /Levels/);

    const two = await create({ type: "factor", name: "X", links: [exp, { type: "experiment", id: "e2" }], fields: { levels: "1" } });
    assert.equal(two.status, 400);
    assert.match((await two.json()).error, /belongs to one experiment/);
    assert.equal(posts.length, 1);
  });
});

test("link object + level: two levels of one factor are refused", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelLinkStub([], puts, { "so-1": inPbar });
    const res = await linkPost(base, [{ type: "scientific_object", id: "so-1" }, { type: "factor_level", id: `${FAC}.1` }, { type: "factor_level", id: `${FAC}.2` }]);
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /Two levels of Replicate/);
    assert.equal(puts.length, 0);
  });
});

// ---------- a factor's level list (every change is a PUT of the whole factor) ----------
// A stateful factor: the PUT replaces its levels, minting `<factor>.<name>` for a level sent
// without a uri (as OpenSILEX does — probed 2026-10-01).
function levelListStub(puts: any[], calls: string[] = [], levels = facDto.levels) {
  let dto = { ...facDto, levels };
  return (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      puts.push(body);
      dto = { ...dto, levels: body.levels.map((l: any) => ({ uri: l.uri ?? `${FAC}.${l.name}`, name: l.name, description: null })) };
      return jsonResponse(200, { result: FAC });
    }
    const lv = url.match(/\/core\/experiments\/factors\/levels\/([^?]+)/);
    if (lv) {
      const l = dto.levels.find((x) => x.uri === decodeURIComponent(lv[1]));
      return l ? jsonResponse(200, { result: l }) : jsonResponse(404, { result: { message: "not found" } });
    }
    if (url.includes("/core/scientific_objects?") && url.includes("factor_levels=")) return jsonResponse(200, { result: [], metadata: { pagination: { totalCount: 20 } } });
    if (url.includes(`/core/experiments/factors/${encodeURIComponent(FAC)}`)) return jsonResponse(200, { result: dto });
    if (url.includes(`/core/experiments/${encodeURIComponent(facDto.experiment)}`)) return jsonResponse(200, { result: { uri: facDto.experiment, name: "PBar1x4" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const nodePut = (base: string, body: unknown) => realFetch(`${base}/api/node`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("factor level rename: saves its factor with that level renamed (uri kept), the 'Replicate: ' prefix may be typed; a name the factor has is refused", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelListStub(puts);
    const res = await nodePut(base, { type: "factor_level", id: `${FAC}.2`, name: "Replicate: 3" });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.label, "Replicate: 3");
    assert.equal(puts[0].name, "Replicate");
    assert.deepEqual(puts[0].levels, [{ uri: `${FAC}.1`, name: "1", description: null }, { uri: `${FAC}.2`, name: "3", description: null }]);

    const dup = await nodePut(base, { type: "factor_level", id: `${FAC}.2`, name: "1" });
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /Replicate already has a level named "1"/);
    assert.equal(puts.length, 1);
  });
});

test("factor level delete: rename/delete allowed, the confirm counts its objects, delete saves the factor without it; the last level is refused", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    const calls: string[] = [];
    globalThis.fetch = levelListStub(puts, calls);
    const d = await (await realFetch(`${base}/api/node-detail?type=factor_level&id=${encodeURIComponent(`${FAC}.2`)}`)).json();
    assert.deepEqual(d.actions, ["rename", "delete", "link"]);
    assert.equal(d.deleteRemovesLinks, true);
    assert.equal(d.deleteWarning, "It also removes it from 20 scientific objects in PBar1x4.");

    const res = await realFetch(`${base}/api/node?type=factor_level&id=${encodeURIComponent(`${FAC}.2`)}`, { method: "DELETE" });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(puts[0].levels, [{ uri: `${FAC}.1`, name: "1", description: null }]);
    assert.ok(!calls.some((c) => c.startsWith("DELETE")));

    const last = await realFetch(`${base}/api/node?type=factor_level&id=${encodeURIComponent(`${FAC}.1`)}`, { method: "DELETE" });
    assert.equal(last.status, 400);
    assert.match((await last.json()).error, /at least one level — delete the factor instead/);
    assert.equal(puts.length, 1);
  });
});

test("create factor level: one factor selected, saved with the level added, answered as 'Replicate: 3'; a name it has or two factors refused", async () => {
  await withServer(async (base) => {
    const puts: any[] = [];
    globalThis.fetch = levelListStub(puts);
    const create = (body: unknown) => realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const fac = { type: "factor", id: FAC };

    const ok = await create({ type: "factor_level", name: " 3 ", links: [fac] });
    const body = await ok.json();
    assert.equal(ok.status, 201, JSON.stringify(body));
    assert.deepEqual(body, { id: `${FAC}.3`, type: "factor_level", label: "Replicate: 3", factor: FAC });
    assert.deepEqual(puts[0].levels.at(-1), { name: "3", description: null });
    assert.equal(puts[0].levels.length, 3);

    const dup = await create({ type: "factor_level", name: "REPLICATE: 2", links: [fac] });
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /already has a level named "2"/);

    const two = await create({ type: "factor_level", name: "4", links: [fac, { type: "factor", id: "f2" }] });
    assert.equal(two.status, 400);
    assert.equal(puts.length, 1);
  });
});

// ---------- germplasm: create, rename, delete, species/variety (probed on phis-test 2026-10-01) ----------
const GP = "https://phis.pheno.no/id/germplasm/";
const gRecords: Record<string, any> = {
  [`${GP}species.barley`]: { uri: `${GP}species.barley`, name: "Barley", rdf_type: "vocabulary:Species", species: null, variety: null, is_public: true },
  [`${GP}species.oat`]: { uri: `${GP}species.oat`, name: "Oat", rdf_type: "vocabulary:Species", species: null, variety: null, is_public: true },
  [`${GP}variety.annika`]: { uri: `${GP}variety.annika`, name: "Annika", rdf_type: "vocabulary:Variety", species: `${GP}species.barley`, species_name: "Barley", variety: null, is_public: true },
  [`${GP}variety.tiril`]: { uri: `${GP}variety.tiril`, name: "Tiril", rdf_type: "vocabulary:Variety", species: `${GP}species.oat`, species_name: "Oat", variety: null, is_public: true },
  [`${GP}accession.a1`]: { uri: `${GP}accession.a1`, name: "A1", rdf_type: "vocabulary:Accession", species: `${GP}species.barley`, variety: null, is_public: true },
};
// used: germplasm uri -> experiments it is in (through its plants); children found by species.
function germplasmStub(log: { puts: any[]; posts: any[]; deletes: string[] }, used: Record<string, string[]> = {}) {
  return (async (url: string, init?: RequestInit) => {
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    if (init?.method === "PUT") { log.puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "ok" }); }
    if (init?.method === "POST") { log.posts.push(JSON.parse(String(init.body))); return jsonResponse(201, { result: [`${GP}new`] }); }
    if (init?.method === "DELETE") { log.deletes.push(decodeURIComponent(url.split("/core/germplasm/")[1])); return jsonResponse(200, { result: "ok" }); }
    const u = new URL(url);
    if (u.pathname.endsWith("/core/germplasm")) {
      const name = u.searchParams.get("name");
      const type = u.searchParams.get("rdf_type");
      const species = u.searchParams.get("species");
      const rows = Object.values(gRecords).filter((g) =>
        (!name || new RegExp(name, "i").test(g.name)) && (!type || g.rdf_type === type) && (!species || g.species === species));
      return jsonResponse(200, { result: rows });
    }
    const exps = url.match(/\/core\/germplasm\/([^/?]+)\/experiments/);
    if (exps) return jsonResponse(200, { result: (used[decodeURIComponent(exps[1])] ?? []).map((n) => ({ uri: `exp-${n}`, name: n })) });
    const one = url.match(/\/core\/germplasm\/([^/?]+)$/);
    if (one) { const g = gRecords[decodeURIComponent(one[1])]; return g ? jsonResponse(200, { result: g }) : jsonResponse(404, { result: { message: "nope" } }); }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const newLog = () => ({ puts: [] as any[], posts: [] as any[], deletes: [] as string[] });
const gq = (u: string) => encodeURIComponent(u);

test("germplasm: rename/delete/link allowed; delete is blocked (and refused) while it's on plants or has varieties/accessions, allowed when unused", async () => {
  await withServer(async (base) => {
    const log = newLog();
    globalThis.fetch = germplasmStub(log, { [`${GP}variety.annika`]: ["PBar1x4"] });
    const annika = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=${gq(`${GP}variety.annika`)}`)).json();
    assert.deepEqual(annika.actions, ["rename", "delete", "link"]);
    assert.equal(annika.deleteBlocked, "is on scientific objects in PBar1x4. Remove it from them first.");
    const barley = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=${gq(`${GP}species.barley`)}`)).json();
    assert.equal(barley.deleteBlocked, "has varieties or accessions: Annika, A1. Delete them or give them another species first.");
    const res = await realFetch(`${base}/api/node?type=germplasm&id=${gq(`${GP}variety.annika`)}`, { method: "DELETE" });
    assert.equal(res.status, 409);
    const tiril = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=${gq(`${GP}variety.tiril`)}`)).json();
    assert.equal(tiril.deleteBlocked, undefined);
    assert.equal((await realFetch(`${base}/api/node?type=germplasm&id=${gq(`${GP}variety.tiril`)}`, { method: "DELETE" })).status, 200);
    assert.deepEqual(log.deletes, [`${GP}variety.tiril`]);
  });
});

test("create germplasm: public, the picked type; a variety/accession needs a species, a species takes none; the same name for that type is refused", async () => {
  await withServer(async (base) => {
    const log = newLog();
    globalThis.fetch = germplasmStub(log);
    const create = (body: unknown) => realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const v = await create({ type: "germplasm", name: "Fager", links: [], fields: { rdf_type: "vocabulary:Variety", species: `${GP}species.barley` } });
    assert.equal(v.status, 201, await v.clone().text());
    assert.deepEqual(log.posts[0], { name: "Fager", rdf_type: "vocabulary:Variety", species: `${GP}species.barley`, is_public: true });
    const s = await create({ type: "germplasm", name: "Rye", links: [], fields: { rdf_type: "vocabulary:Species", species: `${GP}species.barley` } });
    assert.equal(s.status, 201);
    assert.deepEqual(log.posts[1], { name: "Rye", rdf_type: "vocabulary:Species", is_public: true });

    const noSpecies = await create({ type: "germplasm", name: "X", links: [], fields: { rdf_type: "vocabulary:Accession" } });
    assert.equal(noSpecies.status, 400);
    assert.match((await noSpecies.json()).error, /An accession needs a species/);
    const dup = await create({ type: "germplasm", name: "annika", links: [], fields: { rdf_type: "vocabulary:Variety", species: `${GP}species.barley` } });
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /There is already a variety named "Annika"/);
    const badType = await create({ type: "germplasm", name: "X", links: [], fields: { rdf_type: "vocabulary:SeedLot", species: `${GP}species.barley` } });
    assert.equal(badType.status, 400);
    assert.equal(log.posts.length, 2);
  });
});

test("germplasm rename keeps species and visibility; a name another germplasm of that type has is refused", async () => {
  await withServer(async (base) => {
    const log = newLog();
    globalThis.fetch = germplasmStub(log);
    const ok = await nodePut(base, { type: "germplasm", id: `${GP}variety.annika`, name: "Annika 2" });
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(log.puts[0].name, "Annika 2");
    assert.equal(log.puts[0].species, `${GP}species.barley`);
    assert.equal(log.puts[0].is_public, true);
    const same = await nodePut(base, { type: "germplasm", id: `${GP}variety.annika`, name: "ANNIKA" });
    assert.equal(same.status, 200, "its own name in another case is fine");
    const dup = await nodePut(base, { type: "germplasm", id: `${GP}variety.annika`, name: "Tiril" });
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /There is already a variety named "Tiril"/);
    assert.equal(log.puts.length, 2);
  });
});

test("link germplasm + germplasm: a species is set on varieties/accessions, a variety on accessions (with its species); two species, or two varieties, are refused", async () => {
  await withServer(async (base) => {
    const log = newLog();
    globalThis.fetch = germplasmStub(log);
    const g = (k: string) => ({ type: "germplasm", id: `${GP}${k}` });

    const r1 = await linkPost(base, [g("species.oat"), g("variety.annika"), g("accession.a1")]);
    const b1 = await r1.json();
    assert.equal(r1.status, 200, JSON.stringify(b1));
    assert.equal(b1.linkedPairs, 2);
    assert.deepEqual(log.puts.map((p) => [p.uri, p.species, p.variety]), [[`${GP}variety.annika`, `${GP}species.oat`, null], [`${GP}accession.a1`, `${GP}species.oat`, null]]);

    log.puts.length = 0;
    const r2 = await linkPost(base, [g("accession.a1"), g("variety.tiril")]);
    assert.equal(r2.status, 200);
    assert.deepEqual(log.puts.map((p) => [p.uri, p.species, p.variety]), [[`${GP}accession.a1`, `${GP}species.oat`, `${GP}variety.tiril`]]);

    log.puts.length = 0;
    const r3 = await linkPost(base, [g("species.barley"), g("variety.annika")]);
    assert.deepEqual(await r3.json(), { ok: true, linkedPairs: 0, alreadyLinked: 1 });
    assert.equal(log.puts.length, 0);

    const two = await linkPost(base, [g("species.barley"), g("species.oat"), g("variety.annika")]);
    assert.equal(two.status, 400);
    assert.match((await two.json()).error, /one species or variety/);
    const peers = await linkPost(base, [g("variety.annika"), g("variety.tiril")]);
    assert.equal(peers.status, 400);
    assert.equal(log.puts.length, 0);
  });
});

test("germplasm rows and chips carry their kind (species / variety / accession) so the page can say what a link sets", async () => {
  await withServer(async (base) => {
    globalThis.fetch = germplasmStub(newLog());
    const rows = await (await realFetch(`${base}/api/germplasm`)).json();
    assert.equal(rows.find((r: any) => r.label === "Annika").kind, "variety");
    assert.equal(rows.find((r: any) => r.label === "Barley").kind, "species");
    const d = await (await realFetch(`${base}/api/node-detail?type=germplasm&id=${gq(`${GP}variety.annika`)}`)).json();
    assert.equal(d.relations.find((r: any) => r.label === "Species").items[0].kind, "species");
  });
});

// ---------- people: persons, accounts, groups, profiles (read-only pages, probed on phis-test 2026-10-01) ----------
const SEC = "https://phis.pheno.no/id/";
const P_ANNA = "https://orcid.org/0000-0001";
const A_ANNA = `${SEC}user/account.anna`;
const A_BOB = `${SEC}user/account.bob`;
const G_RES = `${SEC}group/researchers`;
const PR_RES = `${SEC}profile/researcher_profile`;
const people = {
  persons: [{ uri: P_ANNA, first_name: "Anna", last_name: "Berg", email: "anna@uit.no", affiliation: "UiT", orcid: P_ANNA, account: A_ANNA }],
  accounts: [
    { uri: A_ANNA, email: "anna@uit.no", admin: false, enable: true, linked_person: P_ANNA, person_first_name: "Anna", person_last_name: "Berg" },
    { uri: A_BOB, email: "bob@nmbu.no", admin: true, enable: false, linked_person: null, person_first_name: null, person_last_name: null },
  ],
  groups: [{ uri: G_RES, name: "Researchers", description: "Authenticated users", user_profiles: [
    { user_uri: A_ANNA, user_name: "anna@uit.no", profile_uri: PR_RES, profile_name: "Researcher profile" },
    { user_uri: A_BOB, user_name: "bob@nmbu.no", profile_uri: PR_RES, profile_name: "Researcher profile" },
  ] }],
  profiles: [{ uri: PR_RES, name: "Researcher profile", credentials: ["germplasm-access", "data-modification"] }],
  experiments: [
    { uri: "exp-1", name: "PBar1x4", scientific_supervisors: [P_ANNA], technical_supervisors: [], groups: [{ uri: G_RES, name: "Researchers" }] },
    { uri: "exp-2", name: "Other", scientific_supervisors: [], technical_supervisors: [P_ANNA], groups: [] },
  ],
  projects: [{ uri: "proj-1", name: "TraitFinder", coordinators: [{ uri: P_ANNA, name: "Anna Berg" }], scientific_contacts: [], administrative_contacts: [] }],
  germplasm: [{ uri: "g-1", name: "Annika", groups: [{ uri: G_RES, name: "Researchers" }] }],
};
function peopleStub() {
  return (async (url: string) => {
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/^.*\/rest/, ""));
    const list = (rows: unknown[]) => jsonResponse(200, { result: rows, metadata: { pagination: { totalCount: rows.length } } });
    const one = (rows: any[], id: string) => { const r = rows.find((x) => x.uri === id); return r ? jsonResponse(200, { result: r }) : jsonResponse(404, { result: { message: "nope" } }); };
    let m;
    if ((m = path.match(/^\/security\/accounts\/(.+)\/groups$/))) return list(people.groups.filter((g) => g.user_profiles.some((p) => p.user_uri === m[1])).map(({ uri, name }) => ({ uri, name })));
    for (const kind of ["persons", "accounts", "groups", "profiles"] as const) {
      if (path === `/security/${kind}`) return list(people[kind]);
      if ((m = path.match(new RegExp(`^/security/${kind}/(.+)$`)))) return one(people[kind], m[1]);
    }
    if (path === "/core/experiments") return list(people.experiments.map(({ uri, name }) => ({ uri, name })));
    if ((m = path.match(/^\/core\/experiments\/(.+)$/))) return one(people.experiments, m[1]);
    if (path === "/core/projects") return list(people.projects);
    if (path === "/core/germplasm") return list(people.germplasm);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const detailOf = async (base: string, type: string, id: string) => (await realFetch(`${base}/api/node-detail?type=${type}&id=${encodeURIComponent(id)}`)).json();
const groupItems = (d: any, label: string) => d.relations.find((r: any) => r.label === label)?.items.map((i: any) => [i.type, i.label]);

test("person page: read-only; facts (email, affiliation, ORCID); its account, the experiments it supervises (both kinds) and its projects (by role)", async () => {
  await withServer(async (base) => {
    globalThis.fetch = peopleStub();
    const d = await detailOf(base, "person", P_ANNA);
    assert.deepEqual(d.actions, []);
    assert.deepEqual(d.facts, [{ label: "Email", value: "anna@uit.no" }, { label: "Affiliation", value: "UiT" }, { label: "ORCID", value: P_ANNA }]);
    assert.deepEqual(groupItems(d, "Account"), [["account", "Anna Berg"]]);
    assert.deepEqual(groupItems(d, "Scientific supervisor of"), [["experiment", "PBar1x4"]]);
    assert.deepEqual(groupItems(d, "Technical supervisor of"), [["experiment", "Other"]]);
    assert.deepEqual(groupItems(d, "Coordinator of"), [["project", "TraitFinder"]]);
    assert.equal(groupItems(d, "Scientific contact of"), undefined, "empty roles are left out");
  });
});

test("account page: facts (email, admin, enabled); its person and its groups with the role in each; the label falls back to the email", async () => {
  await withServer(async (base) => {
    globalThis.fetch = peopleStub();
    const d = await detailOf(base, "account", A_ANNA);
    assert.deepEqual(d.actions, []);
    assert.deepEqual(d.facts, [{ label: "Email", value: "anna@uit.no" }, { label: "Admin", value: "no" }, { label: "Enabled", value: "yes" }]);
    assert.deepEqual(groupItems(d, "Person"), [["person", "Anna Berg"]]);
    assert.deepEqual(groupItems(d, "Groups"), [["group", "Researchers · Researcher profile"]]);
    const rows = await (await realFetch(`${base}/api/accounts`)).json();
    assert.deepEqual(rows.map((r: any) => [r.type, r.label]), [["account", "Anna Berg"], ["account", "bob@nmbu.no"]]);
  });
});

test("group page: members with their profile; the experiments and germplasm shared with it", async () => {
  await withServer(async (base) => {
    globalThis.fetch = peopleStub();
    const d = await detailOf(base, "group", G_RES);
    assert.deepEqual(d.actions, []);
    assert.deepEqual(d.facts, [{ label: "Description", value: "Authenticated users" }]);
    assert.deepEqual(groupItems(d, "Members"), [["account", "Anna Berg · Researcher profile"], ["account", "bob@nmbu.no · Researcher profile"]]);
    assert.deepEqual(groupItems(d, "Shared experiments"), [["experiment", "PBar1x4"]]);
    assert.deepEqual(groupItems(d, "Shared germplasm"), [["germplasm", "Annika"]]);
  });
});

test("profile page: its rights as a fact; the groups that use it", async () => {
  await withServer(async (base) => {
    globalThis.fetch = peopleStub();
    const d = await detailOf(base, "profile", PR_RES);
    assert.deepEqual(d.actions, []);
    assert.deepEqual(d.facts, [{ label: "Rights", value: "germplasm-access, data-modification" }]);
    assert.deepEqual(groupItems(d, "Used in groups"), [["group", "Researchers"]]);
    assert.deepEqual((await (await realFetch(`${base}/api/groups`)).json()).map((r: any) => r.label), ["Researchers"]);
    assert.deepEqual((await (await realFetch(`${base}/api/profiles`)).json()).map((r: any) => r.label), ["Researcher profile"]);
  });
});

// ---------- devices and moves (probed on phis-test 2026-10-01) ----------
const DEV = "https://phis.pheno.no/id/device/specim_fx10e";
const DEV2 = "https://phis.pheno.no/id/device/nikon_z6iii";
const FAC1 = "https://phis.pheno.no/id/organization/facility.holt_br_1";
const FAC2 = "https://phis.pheno.no/id/organization/facility.holt_pt";
const MV_OLD = "https://phis.pheno.no/set/event/m-old";
const MV_NEW = "https://phis.pheno.no/set/event/m-new";
function deviceStub(log: { puts: any[]; posts: { url: string; body: any }[]; deletes: string[] }) {
  const devices: Record<string, any> = {
    [DEV]: { uri: DEV, name: "Specim FX10e", rdf_type: "vocabulary:HyperspectralCamera", rdf_type_name: "hyperspectral camera", brand: "Specim", constructor_model: "FX10e", serial_number: "S-1", person_in_charge: "https://orcid.org/1", start_up: "2022-09-01", removal: null, relations: [] },
    [DEV2]: { uri: DEV2, name: "Nikon Z6III", rdf_type: "vocabulary:RGBCamera", rdf_type_name: "RGB camera", brand: "Nikon", relations: [] },
  };
  const moves: Record<string, any> = {
    [MV_OLD]: { uri: MV_OLD, rdf_type_name: "Move", end: "2022-09-12T22:00Z", description: "Installed", targets: [DEV], location: { from: null, to: FAC2 } },
    [MV_NEW]: { uri: MV_NEW, rdf_type_name: "Move", end: "2023-05-01T10:00Z", description: "Moved to the lab", targets: [DEV], location: { from: FAC2, to: FAC1 } },
  };
  const facilities: Record<string, any> = { [FAC1]: { uri: FAC1, name: "HOLT_BR_1", organizations: [], sites: [], devices: [] }, [FAC2]: { uri: FAC2, name: "HOLT_PT", organizations: [], sites: [], devices: [] } };
  return (async (url: string, init?: RequestInit) => {
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "t" } });
    if (url.includes("/ontology/name_space")) return jsonResponse(200, { result: { phis: "https://phis.pheno.no/" } });
    const u = new URL(url);
    const path = decodeURIComponent(u.pathname.replace(/^.*\/rest/, ""));
    if (init?.method === "PUT") { log.puts.push(JSON.parse(String(init.body))); return jsonResponse(200, { result: "ok" }); }
    if (init?.method === "POST") { const body = JSON.parse(String(init.body)); log.posts.push({ url: path, body }); return jsonResponse(201, { result: path.includes("moves") ? ["https://phis.pheno.no/set/event/m-made"] : "https://phis.pheno.no/id/device/zz_made" }); }
    if (init?.method === "DELETE") { log.deletes.push(path); return jsonResponse(200, { result: "ok" }); }
    const list = (rows: unknown[]) => jsonResponse(200, { result: rows, metadata: { pagination: { totalCount: rows.length } } });
    let m;
    if (path === "/core/events") { const t = u.searchParams.get("target"); return list(Object.values(moves).filter((mv) => !t || mv.targets.includes(t)).map(({ location, ...rest }) => rest)); }
    if ((m = path.match(/^\/core\/events\/moves\/(.+)$/))) return moves[m[1]] ? jsonResponse(200, { result: moves[m[1]] }) : jsonResponse(404, { result: { message: "nope" } });
    if (path === "/core/devices") {
      const f = u.searchParams.get("facility"), name = u.searchParams.get("name");
      return list(Object.values(devices).filter((d) => (!f || (f === FAC1 && d.uri === DEV)) && (!name || new RegExp(name, "i").test(d.name))));
    }
    if ((m = path.match(/^\/core\/devices\/(.+)$/))) return jsonResponse(200, { result: devices[m[1]] });
    if ((m = path.match(/^\/core\/facilities\/(.+)$/))) return jsonResponse(200, { result: facilities[m[1]] });
    if ((m = path.match(/^\/security\/persons\/(.+)$/))) return jsonResponse(200, { result: { uri: m[1], first_name: "Marius", last_name: "Klemetsen" } });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}
const devLog = () => ({ puts: [] as any[], posts: [] as { url: string; body: any }[], deletes: [] as string[] });

test("device page: facts; location from its latest move; person in charge; history newest first; deleting it takes its moves (said in the confirm)", async () => {
  await withServer(async (base) => {
    const log = devLog();
    globalThis.fetch = deviceStub(log);
    const d = await detailOf(base, "device", DEV);
    assert.deepEqual(d.actions, ["rename", "delete", "link"]);
    assert.deepEqual(d.facts, [{ label: "Type", value: "hyperspectral camera" }, { label: "Brand", value: "Specim" }, { label: "Model", value: "FX10e" }, { label: "Serial number", value: "S-1" }, { label: "In use since", value: "2022-09-01" }]);
    assert.deepEqual(groupItems(d, "Location"), [["facility", "HOLT_BR_1"]]);
    assert.deepEqual(groupItems(d, "Person in charge"), [["person", "Marius Klemetsen"]]);
    assert.deepEqual(groupItems(d, "History"), [["event", "2023-05-01 · moved to HOLT_BR_1"], ["event", "2022-09-12 · moved to HOLT_PT"]]);
    assert.equal(d.deleteWarning, "Its 2 moves are deleted with it.");
    assert.equal((await realFetch(`${base}/api/node?type=device&id=${encodeURIComponent(DEV)}`, { method: "DELETE" })).status, 200);
    assert.deepEqual(log.deletes, [`/core/events/moves/${MV_OLD}`, `/core/events/moves/${MV_NEW}`, `/core/devices/${DEV}`].sort().filter((x) => x.includes("moves")).concat([`/core/devices/${DEV}`]));
  });
});

test("move page: date and description; its device, from and to; delete only", async () => {
  await withServer(async (base) => {
    const log = devLog();
    globalThis.fetch = deviceStub(log);
    const d = await detailOf(base, "event", MV_NEW);
    assert.deepEqual(d.actions, ["delete"]);
    assert.deepEqual(d.facts, [{ label: "Date", value: "2023-05-01" }, { label: "Description", value: "Moved to the lab" }]);
    assert.deepEqual(groupItems(d, "Device"), [["device", "Specim FX10e"]]);
    assert.deepEqual(groupItems(d, "To"), [["facility", "HOLT_BR_1"]]);
    assert.deepEqual(groupItems(d, "From"), [["facility", "HOLT_PT"]]);
    assert.equal((await realFetch(`${base}/api/node?type=event&id=${encodeURIComponent(MV_NEW)}`, { method: "DELETE" })).status, 200);
    assert.deepEqual(log.deletes, [`/core/events/moves/${MV_NEW}`]);
  });
});

test("facility page lists the devices located there, and its delete is blocked while any are", async () => {
  await withServer(async (base) => {
    const log = devLog();
    globalThis.fetch = deviceStub(log);
    const d = await detailOf(base, "facility", FAC1);
    assert.deepEqual(groupItems(d, "Devices located here"), [["device", "Specim FX10e"]]);
    assert.equal(d.deleteBlocked, "has devices located here: Specim FX10e. Move them to another facility first.");
    assert.equal((await realFetch(`${base}/api/node?type=facility&id=${encodeURIComponent(FAC1)}`, { method: "DELETE" })).status, 409);
    assert.equal((await detailOf(base, "facility", FAC2)).deleteBlocked, undefined);
  });
});

test("create device: type + optional brand/model/serial; a taken name is refused; from a selected facility it is moved there today", async () => {
  await withServer(async (base) => {
    const log = devLog();
    globalThis.fetch = deviceStub(log);
    const create = (body: unknown) => realFetch(`${base}/api/create`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const ok = await create({ type: "device", name: "ZZ cam", links: [], fields: { rdf_type: "vocabulary:RGBCamera", brand: "Nikon" } });
    assert.equal(ok.status, 201, await ok.clone().text());
    assert.deepEqual(log.posts[0], { url: "/core/devices", body: { name: "ZZ cam", rdf_type: "vocabulary:RGBCamera", brand: "Nikon" } });
    const dup = await create({ type: "device", name: "specim fx10E", links: [], fields: { rdf_type: "vocabulary:RGBCamera" } });
    assert.equal(dup.status, 400);
    assert.match((await dup.json()).error, /There is already a device named "Specim FX10e"/);
    const inFac = await create({ type: "device", name: "ZZ cam 2", links: [{ type: "facility", id: FAC2 }], fields: { rdf_type: "vocabulary:RGBCamera" } });
    assert.equal(inFac.status, 201, await inFac.clone().text());
    const mv = log.posts.find((p) => p.url === "/core/events/moves")!;
    assert.deepEqual({ ...mv.body[0], end: mv.body[0].end.slice(0, 10) }, { rdf_type: "oeev:Move", is_instant: true, end: new Date().toISOString().slice(0, 10), targets: ["https://phis.pheno.no/id/device/zz_made"], to: FAC2, targets_positions: [] });
  });
});

test("link device + facility = a move on the given date; a device already there is counted, not moved; two facilities refused", async () => {
  await withServer(async (base) => {
    const log = devLog();
    globalThis.fetch = deviceStub(log);
    const post = (items: any[], date?: string) => realFetch(`${base}/api/link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, ...(date ? { date } : {}) }) });
    const r = await post([{ type: "device", id: DEV2 }, { type: "device", id: DEV }, { type: "facility", id: FAC2 }], "2026-09-01");
    assert.deepEqual(await r.json(), { ok: true, linkedPairs: 2, alreadyLinked: 0 });
    assert.deepEqual(log.posts.map((p) => [p.url, p.body[0].targets, p.body[0].to, p.body[0].end]), [["/core/events/moves", [DEV2], FAC2, "2026-09-01T12:00:00Z"], ["/core/events/moves", [DEV], FAC2, "2026-09-01T12:00:00Z"]]);
    log.posts.length = 0;
    const same = await post([{ type: "device", id: DEV }, { type: "facility", id: FAC1 }], "2026-10-01");
    assert.deepEqual(await same.json(), { ok: true, linkedPairs: 0, alreadyLinked: 1 });
    assert.equal(log.posts.length, 0);
    const two = await post([{ type: "device", id: DEV }, { type: "facility", id: FAC1 }, { type: "facility", id: FAC2 }], "2026-09-01");
    assert.equal(two.status, 400);
    assert.match((await two.json()).error, /one facility/);
  });
});
