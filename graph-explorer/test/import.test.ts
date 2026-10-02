import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deflateRawSync } from "node:zlib";
import { handleRequest, _resetAuthCacheForTests } from "../src/index.ts";
import { parseCsv, readZip } from "../src/import/files.ts";

const realFetch = globalThis.fetch;
const jsonResponse = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

// A minimal ZIP writer (CRC left 0 — the reader doesn't check it). `stored` = no compression.
function makeZip(files: Record<string, string>, stored: string[] = []): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const method = stored.includes(name) ? 0 : 8;
    const data = method === 0 ? raw : deflateRawSync(raw);
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

test("readZip reads stored and deflated entries; parseCsv handles quotes, BOM, CRLF and blank lines", () => {
  const zip = readZip(makeZip({ "a.csv": "x", "Sheets/b.csv": "y".repeat(500) }, ["a.csv"]));
  assert.equal(zip.get("a.csv")!.toString(), "x");
  assert.equal(zip.get("Sheets/b.csv")!.toString(), "y".repeat(500));
  assert.throws(() => readZip(Buffer.from("not a zip")), /isn't a ZIP/);

  const rows = parseCsv('﻿"Name","Note"\r\n"PB001","say ""hi"", ok"\r\n\r\nPB002,plain\r\n');
  assert.deepEqual(rows, [{ Name: "PB001", Note: 'say "hi", ok' }, { Name: "PB002", Note: "plain" }]);
});

// Three plants: Olve twice (exists in PHIS), Tiril once (missing); the sheet disagrees on one plant.
const MANIFEST = [
  "Unit,Block,Column,Row,PlantID,Genotype,G_alias,Replicate,GroupID",
  "31:01:01,31,1,1,PB001,Olve,G5,1,9",
  "31:02:01,31,2,1,PB002,Tiril,G16,1,10",
  "32:01:01,32,1,1,PB003,Olve,G5,2,9",
].join("\n");
const SHEET = [
  '"Block","Column","Row","Timestamp","Plant_ID","Germplasm","Sensor","Height mm"',
  '"31",1,1,"2025-10-29 13:19:34","PB_1","Olve","TraitFinder",10',
  '"31",2,1,"2025-10-22 13:19:34","PB_2","Tiril","TraitFinder",11',
  '"32",1,1,"2025-10-29 13:19:34","PB_3","Annika","TraitFinder",12',
].join("\n");

// The vocabulary checks (Tray type, a plant's position): `present` = this PHIS already has them.
function ontologyAnswer(url: string, present: boolean) {
  if (url.includes("/ontology/rdf_type?") || url.includes("/ontology/property?")) {
    return present ? jsonResponse(200, { result: { uri: "x" } }) : jsonResponse(500, { result: { message: "owl:Class URI not found : x" } });
  }
  if (url.includes("/vuejs/owl_extension/rdf_type_properties")) {
    return jsonResponse(200, { result: { data_properties: present ? [{ uri: "https://phis.pheno.no/vocabulary#positionInTray" }] : [] } });
  }
  return null;
}

function mockPhis(calls: string[], olveCode: string | null = null) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const onto = ontologyAnswer(url, false);
    if (onto) return onto;
    if (url.includes("/core/germplasm/g%3Aolve")) return jsonResponse(200, { result: { uri: "g:olve", name: "Olve", code: olveCode } });
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [{ uri: "e1", name: "PBar1x4 – TraitFinder – 2025-10-22 (old)" }] });
    if (url.includes("rdf_type=")) return jsonResponse(200, { result: [{ uri: "agrovoc:barley", name: "barley" }] });
    if (url.includes("/core/germplasm?name=Olve")) return jsonResponse(200, { result: [{ uri: "g:olve", name: "olve" }, { uri: "g:olve2", name: "Olve 2" }] });
    if (url.includes("/core/germplasm?name=Tiril")) return jsonResponse(200, { result: [] });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("POST /api/import/plan: TraitFinder ZIP -> the plan (exact-name germplasm matching, factors, warnings); only GETs reach PHIS", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    mockPhis(calls);
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ "PBar1x4_Metadata.csv": MANIFEST, "Sheets/PBar1x4_TraitFinder_20260107_PHIS.csv": SHEET }) });
    assert.equal(res.status, 200);
    const plan = await res.json();
    assert.equal(plan.instrument, "TraitFinder (PlantEye)");
    assert.deepEqual(plan.experiment, { name: "PBar1x4 – TraitFinder – 2025-10-22", startDate: "2025-10-22", exists: false }, "a name that only contains it isn't a match; earliest date starts it");
    assert.deepEqual(plan.germplasm, { existing: [{ name: "Olve", id: "g:olve" }], missing: ["Tiril"], ambiguous: [], codes: [{ name: "Olve", code: "G5" }, { name: "Tiril", code: "G16" }] }, "case-insensitive exact match; 'Olve 2' ignored; codes from G_alias");
    assert.deepEqual(plan.vocabulary.map((v: any) => v.label), ["the object type Tray", "the plant property Position in tray"], "what this PHIS lacks, added first");
    assert.deepEqual(plan.speciesOptions, [{ id: "agrovoc:barley", label: "barley" }]);
    assert.deepEqual(plan.factors, [{ name: "Replicate", levels: ["1", "2"] }, { name: "GroupID", levels: ["9", "10"] }], "levels sorted as numbers");
    assert.equal(plan.objects.count, 5, "3 plants + their 2 trays");
    assert.deepEqual(plan.objects.kinds, [{ type: "tray", count: 2 }, { type: "plant", count: 3 }]);
    assert.deepEqual(plan.objects.sample[0], { name: "PB001", rdfType: "vocabulary:Plant", germplasm: "Olve", factors: { Replicate: "1", GroupID: "9" }, parent: "Tray 31", position: 1 }, "the sample shows plants, not trays");
    assert.deepEqual(plan.warnings, ["On 2025-10-29 the observation sheet names different germplasm than the design manifest (PB003: sheet says Annika, manifest says Olve). The manifest is used."]);
    assert.ok(calls.every((c) => c.startsWith("GET ") || c.includes("/security/authenticate")), "the plan writes nothing");
  });
});

test("POST /api/import/plan: codes come from the manifest — an existing different code is kept, a variety it gives two codes gets none (both warned), the sheet's codes are ignored; vocabulary already there isn't listed", async () => {
  await withServer(async (base) => {
    mockPhis([], "G99");
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => ontologyAnswer(url, true) ?? inner(url, init)) as typeof fetch;
    // The sheet's codes differ (as in PBar1x4, where its variety names were wrong): ignored.
    const sheet = SHEET.replace('"Sensor"', '"G_alias","Sensor"')
      .replace('"PB_1","Olve","TraitFinder"', '"PB_1","Olve","G77","TraitFinder"')
      .replace('"PB_2","Tiril","TraitFinder"', '"PB_2","Tiril","G1","TraitFinder"')
      .replace('"PB_3","Annika","TraitFinder"', '"PB_3","Annika","G5","TraitFinder"');
    const manifest = MANIFEST + "\n33:01:01,33,1,1,PB004,Tiril,G7,1,9";
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ "PBar1x4_Metadata.csv": manifest, "Sheets/PBar1x4_TraitFinder_20260107_PHIS.csv": sheet }) });
    const plan = await res.json();
    assert.deepEqual(plan.vocabulary, []);
    assert.deepEqual(plan.germplasm.codes, [], "Olve keeps G99, Tiril is G16 and G7 in the manifest, Annika is only in the sheet");
    assert.ok(plan.warnings.includes("The design manifest gives Tiril 2 codes (G16, G7), so no code is set for it."), plan.warnings.join(" | "));
    assert.ok(plan.warnings.includes("Olve already has the code G99 in PHIS; the file's G5 isn't used."), plan.warnings.join(" | "));
  });
});

test("POST /api/import/plan refuses what it can't import, saying why", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const post = async (body: Buffer) => { const r = await realFetch(`${base}/api/import/plan`, { method: "POST", body }); return { status: r.status, error: (await r.json()).error as string }; };
    assert.deepEqual(await post(Buffer.from("hello")), { status: 400, error: "This isn't a ZIP file." });
    const noManifest = await post(makeZip({ "x_PHIS.csv": SHEET }));
    assert.equal(noManifest.status, 400);
    assert.match(noManifest.error, /no design manifest/);
    const unknown = await post(makeZip({ "notes.txt": "hi" }));
    assert.equal(unknown.status, 400);
    assert.match(unknown.error, /None of the known instruments recognises these files \(TraitFinder \(PlantEye\)\)/);
  });
});

// PHIS for the run: records every write; `failOnObject` makes that object's POST fail.
function mockPhisForRun(writes: { method: string; path: string; body: any }[], failOnObject?: string) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/rest/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const onto = method === "GET" && ontologyAnswer(url, false);
    if (onto) return onto;
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (path.startsWith("/vuejs/") || path.startsWith("/ontology/")) return jsonResponse(201, { result: body.uri ?? "ok" });
      if (path === "/core/germplasm" && method === "PUT") return jsonResponse(200, { result: body.uri });
      if (path === "/core/experiments") return jsonResponse(201, { result: "exp:new" });
      if (path === "/core/germplasm") return jsonResponse(201, { result: [`g:${body.name}`] });
      if (path === "/core/experiments/factors") return jsonResponse(201, { result: `f:${body.name}` });
      if (path === "/core/scientific_objects") {
        if (body.name === failOnObject) return jsonResponse(400, { result: { title: "Bad request", message: "name clash" } });
        return jsonResponse(201, { result: `so:${body.name}` });
      }
    }
    const levels = path.match(/^\/core\/experiments\/factors\/f%3A(\w+)\/levels$/);
    if (levels) {
      const names = levels[1] === "Replicate" ? ["1", "2"] : ["9", "10"];
      return jsonResponse(200, { result: names.map((n) => ({ uri: `lvl:${levels[1]}.${n}`, name: n })) });
    }
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [] });
    if (url.includes("rdf_type=")) return jsonResponse(200, { result: [{ uri: "agrovoc:barley", name: "barley" }] });
    if (url.includes("/core/germplasm?name=Olve")) return jsonResponse(200, { result: [{ uri: "g:olve", name: "Olve" }] });
    if (url.includes("/core/germplasm?name=Tiril")) return jsonResponse(200, { result: [] });
    if (url.includes("/core/germplasm/g%3Aolve")) return jsonResponse(200, { result: { uri: "g:olve", name: "Olve", rdf_type: "vocabulary:Variety", species: "agrovoc:barley", is_public: true, code: null } });
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}
const EXPORT = () => makeZip({ "PBar1x4_Metadata.csv": MANIFEST, "Sheets/PBar1x4_TraitFinder_20260107_PHIS.csv": SHEET });

test("POST /api/import/run refuses before writing anything when a choice is missing", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockPhisForRun(writes);
    const res = await realFetch(`${base}/api/import/run`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).error, "Choose the species for the new germplasm.");
    const bad = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("not:a-species")}`, { method: "POST", body: EXPORT() });
    assert.equal(bad.status, 409, "only one of PHIS's species");
    assert.deepEqual(writes, []);
  });
});

test("POST /api/import/run writes in order: vocabulary, experiment, new germplasm (with its code), an existing germplasm's code, factors with levels, trays, then each plant with its germplasm, factor levels, tray and position", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const steps = lines.slice(0, -1).map((l) => `${l.progress.done}/${l.progress.total} ${l.progress.step}`);
    assert.deepEqual(steps.slice(0, 7), [
      "1/12 Added the object type Tray to PHIS", "2/12 Added the plant property Position in tray to PHIS", "3/12 Created the experiment",
      "4/12 Creating germplasm: 1 of 1", "5/12 Setting variety codes: 1 of 1", "6/12 Creating factors: 1 of 2", "7/12 Creating factors: 2 of 2",
    ], "one progress line per write");
    assert.equal(steps.at(-1), "12/12 Creating scientific objects: 5 of 5");
    assert.deepEqual(lines.at(-1), { result: { experiment: { id: "exp:new", type: "experiment", label: "PBar1x4 – TraitFinder – 2025-10-22" }, created: { germplasm: 1, codes: 1, factors: 2, objects: 5, vocabulary: 2 } } });
    assert.deepEqual(writes.map((w) => `${w.method} ${w.path} ${w.body.name ?? w.body.uri ?? w.body.property}`), [
      "POST /vuejs/owl_extension/rdf_type Tray",
      "POST /ontology/property https://phis.pheno.no/vocabulary#positionInTray",
      "POST /ontology/rdf_type_property_restriction https://phis.pheno.no/vocabulary#positionInTray",
      "POST /core/experiments PBar1x4 – TraitFinder – 2025-10-22",
      "POST /core/germplasm Tiril",
      "PUT /core/germplasm Olve",
      "POST /core/experiments/factors Replicate",
      "POST /core/experiments/factors GroupID",
      "POST /core/scientific_objects Tray 31", "POST /core/scientific_objects Tray 32",
      "POST /core/scientific_objects PB001", "POST /core/scientific_objects PB002", "POST /core/scientific_objects PB003",
    ], "trays before the plants in them");
    const w = (name: string) => writes.find((x) => x.body.name === name)!.body;
    assert.deepEqual(writes[3].body, { name: "PBar1x4 – TraitFinder – 2025-10-22", start_date: "2025-10-22", objective: "Imported from a TraitFinder (PlantEye) export.", is_public: true });
    assert.deepEqual(w("Tiril"), { name: "Tiril", rdf_type: "vocabulary:Variety", species: "agrovoc:barley", is_public: true, code: "G16" });
    assert.equal(writes[5].body.code, "G5");
    assert.equal(writes[5].body.species, "agrovoc:barley", "the rest of Olve's record goes back too");
    assert.deepEqual(w("Replicate"), { name: "Replicate", experiment: "exp:new", levels: [{ name: "1" }, { name: "2" }] });
    assert.deepEqual(w("Tray 31"), { name: "Tray 31", rdf_type: "https://phis.pheno.no/vocabulary#Tray", experiment: "exp:new", relations: [] });
    assert.deepEqual(w("PB002"), {
      name: "PB002", rdf_type: "vocabulary:Plant", experiment: "exp:new",
      relations: [
        { property: "vocabulary:hasGermplasm", value: "g:Tiril", inverse: false },
        { property: "vocabulary:hasFactorLevel", value: "lvl:Replicate.1", inverse: false },
        { property: "vocabulary:hasFactorLevel", value: "lvl:GroupID.10", inverse: false },
        { property: "vocabulary:isPartOf", value: "so:Tray 31", inverse: false },
        { property: "https://phis.pheno.no/vocabulary#positionInTray", value: "2", inverse: false },
      ],
    }, "new germplasm by its new uri, existing by PHIS's, levels by name, tray by its new uri");
    assert.equal(w("PB001").relations[0].value, "g:olve");
    assert.equal(w("PB003").relations.find((r: any) => r.property === "vocabulary:isPartOf").value, "so:Tray 32");
  });
});

test("POST /api/import/run that fails part-way says what it created and how to start over", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockPhisForRun(writes, "PB002");
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200, "already streaming when it failed");
    const { error } = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.match(error, /^The import stopped part-way: .*It had created the experiment, 1 new germplasm, 2 of 2 factors and 4 of 5 scientific objects\. To start over, delete the experiment "PBar1x4 – TraitFinder – 2025-10-22"/);
    assert.equal(writes.filter((w: any) => w.path === "/core/scientific_objects").length, 5, "the batch in flight finishes; the report counts what exists");
  });
});
