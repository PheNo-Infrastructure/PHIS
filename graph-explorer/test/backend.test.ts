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

    const viaProject = await create({ type: "experiment", name: "E", links: [{ type: "project", id: "p1" }], fields: { objective: "o", start_date: "2026-10-01" } });
    assert.equal(viaProject.status, 400);
    assert.match((await viaProject.json()).error, /project isn't supported yet/);
    assert.equal(posted, null, "neither refusal may reach OpenSILEX");

    const ok = await create({
      type: "experiment", name: "E", links: [{ type: "organization", id: "org-1" }, { type: "facility", id: "fac-1" }],
      fields: { objective: "o", start_date: "2026-10-01", end_date: "", is_public: true },
    });
    assert.equal(ok.status, 201);
    assert.deepEqual(posted, { name: "E", objective: "o", start_date: "2026-10-01", organisations: ["org-1"], facilities: ["fac-1"] });
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
    assert.match((await clash.json()).warning, /not added to 1 of 2 — exp-clash: .*unique/);
  });
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
      relations: [{ label: "Experiments", field: "experiment", items: [{ id: "exp-1", label: "Trial A", type: "experiment" }] }],
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
