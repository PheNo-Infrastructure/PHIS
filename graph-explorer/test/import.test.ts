import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { deflateRawSync } from "node:zlib";
import { handleRequest, _resetAuthCacheForTests } from "../src/index.ts";
import { parseCsv, readZip } from "../src/import/files.ts";

const nativeFetch = globalThis.fetch;
// Calls to the server carry the page's write header on changes, as the page's own fetch does.
const realFetch = ((url: string, init: RequestInit = {}) => (init.method ?? "GET") === "GET" ? nativeFetch(url, init)
  : nativeFetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), "X-Graph-Explorer": "1" } })) as typeof fetch;
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
    globalThis.fetch = nativeFetch;
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
  assert.deepEqual([...readZip(makeZip({ "Sheets\\c.csv": "z" })).keys()], ["Sheets/c.csv"], "Compress-Archive's backslashes become /");

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
  '"Block","Column","Row","Timestamp","Plant_ID","Germplasm","Sensor","Height mm","NDVI Average","Leaf inclination mm²/mm²","Hue [0:25] %","Block.1"',
  '"31",1,1,"2025-10-29 13:19:34","PB_1","Olve","TraitFinder",10,0.5,1.2,3,"31"',
  '"31",2,1,"2025-10-22 13:19:34","PB_2","Tiril","TraitFinder",11,0.6,1.1,4,"31"',
  '"32",1,1,"2025-10-29 13:19:34","PB_3","Annika","TraitFinder",12,0.4,1.3,5,"32"',
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

// Variables and their parts: this PHIS has the unit Millimeter (no symbol) and the method, nothing else.
function variablesAnswer(url: string) {
  if (url.includes("/core/units?")) return jsonResponse(200, { result: [{ uri: "u:mm", name: "Millimeter", symbol: null }, { uri: "u:pct", name: "Percent" }] });
  if (url.includes("/core/methods?name=PlantEye")) return jsonResponse(200, { result: [{ uri: "m:pe", name: "PlantEye 3D scan" }] });
  if (/\/core\/(variables|entities|characteristics|methods)\?name=/.test(url)) return jsonResponse(200, { result: [] });
  return null;
}

function mockPhis(calls: string[], olveCode: string | null = null) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const known = ontologyAnswer(url, false) ?? variablesAnswer(url);
    if (known) return known;
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
    assert.deepEqual(plan.variables, {
      existing: [],
      missing: ["Height", "NDVI Average", "Leaf inclination"],
      parts: [
        { kind: "entities", name: "Plant" },
        { kind: "characteristics", name: "Height" }, { kind: "characteristics", name: "NDVI Average" }, { kind: "characteristics", name: "Leaf inclination" },
        { kind: "units", name: "Unitless" }, { kind: "units", name: "SquareMillimeterPerSquareMillimeter", symbol: "mm²/mm²" },
      ],
    }, "traits from the sheet's columns (no bins, no repeated position columns); the method and Millimeter are reused");
    assert.deepEqual(plan.measurements, {
      count: 9, objects: 3, variables: 3, days: 2, first: "2025-10-22T13:19:34", last: "2025-10-29T13:19:34", timezone: "Europe/Oslo",
      skipped: { empty: 0, notNumbers: { count: 0, examples: [] }, contradictions: { count: 0, examples: [] } },
    }, "3 plants x 3 traits; the bin and the repeated Block column aren't values");
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

// PHIS for the run: records every write; `failOn` makes the POST of what has that name fail.
function mockPhisForRun(writes: { method: string; path: string; body: any }[], failOn?: string) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/rest/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const known = method === "GET" && (ontologyAnswer(url, false) ?? variablesAnswer(url));
    if (known) return known;
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (failOn && body.name === failOn) return jsonResponse(400, { result: { title: "Bad request", message: "name clash" } });
      if (path.startsWith("/vuejs/") || path.startsWith("/ontology/")) return jsonResponse(201, { result: body.uri ?? "ok" });
      if (path === "/core/germplasm" && method === "PUT") return jsonResponse(200, { result: body.uri });
      if (path === "/core/experiments") return jsonResponse(201, { result: "exp:new" });
      if (path === "/core/provenances") return jsonResponse(201, { result: "prov:new" });
      if (path === "/core/data") return jsonResponse(201, { result: body.map((_: unknown, i: number) => `data:${i}`) });
      const part = path.match(/^\/core\/(entities|characteristics|units|variables)$/);
      if (part) return jsonResponse(201, { result: [`${part[1]}:${body.name}`] });
      if (path === "/core/germplasm") return jsonResponse(201, { result: [`g:${body.name}`] });
      if (path === "/core/experiments/factors") return jsonResponse(201, { result: `f:${body.name}` });
      if (path === "/core/scientific_objects") return jsonResponse(201, { result: `so:${body.name}` });
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

test("POST /api/import/run writes in order: vocabulary, variables (parts first), experiment, new germplasm (with its code), an existing germplasm's code, factors with levels, trays, then each plant with its germplasm, factor levels, tray and position", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const steps = lines.slice(0, -1).map((l) => `${l.progress.done}/${l.progress.total} ${l.progress.step}`);
    assert.deepEqual(steps.slice(0, 16), [
      "1/23 Added the object type Tray to PHIS", "2/23 Added the plant property Position in tray to PHIS",
      "3/23 Added the entity Plant", "4/23 Added the characteristic Height", "5/23 Added the characteristic NDVI Average", "6/23 Added the characteristic Leaf inclination",
      "7/23 Added the unit Unitless", "8/23 Added the unit SquareMillimeterPerSquareMillimeter",
      "9/23 Creating variables: 1 of 3", "10/23 Creating variables: 2 of 3", "11/23 Creating variables: 3 of 3",
      "12/23 Created the experiment",
      "13/23 Creating germplasm: 1 of 1", "14/23 Setting variety codes: 1 of 1", "15/23 Creating factors: 1 of 2", "16/23 Creating factors: 2 of 2",
    ], "one progress line per write");
    assert.deepEqual(steps.slice(-3), ["21/23 Creating scientific objects: 5 of 5", "22/23 Created the provenance of the measurements", "23/23 Writing measurements: 9 of 9"]);
    assert.deepEqual(lines.at(-1), { result: { experiment: { id: "exp:new", type: "experiment", label: "PBar1x4 – TraitFinder – 2025-10-22" }, created: { germplasm: 1, codes: 1, factors: 2, objects: 5, filled: 0, levels: 0, vocabulary: 2, variables: 3, values: 9 } } });
    assert.deepEqual(writes.map((w) => `${w.method} ${w.path} ${String(w.body.name ?? w.body.uri ?? w.body.property).replace(/ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/, "")}`), [
      "POST /vuejs/owl_extension/rdf_type Tray",
      "POST /ontology/property https://phis.pheno.no/vocabulary#positionInTray",
      "POST /ontology/rdf_type_property_restriction https://phis.pheno.no/vocabulary#positionInTray",
      "POST /core/entities Plant",
      "POST /core/characteristics Height", "POST /core/characteristics NDVI Average", "POST /core/characteristics Leaf inclination",
      "POST /core/units Unitless", "POST /core/units SquareMillimeterPerSquareMillimeter",
      "POST /core/variables Height", "POST /core/variables NDVI Average", "POST /core/variables Leaf inclination",
      "POST /core/experiments PBar1x4 – TraitFinder – 2025-10-22",
      "POST /core/germplasm Tiril",
      "PUT /core/germplasm Olve",
      "POST /core/experiments/factors Replicate",
      "POST /core/experiments/factors GroupID",
      "POST /core/scientific_objects Tray 31", "POST /core/scientific_objects Tray 32",
      "POST /core/scientific_objects PB001", "POST /core/scientific_objects PB002", "POST /core/scientific_objects PB003",
      "POST /core/provenances PBar1x4 – TraitFinder – 2025-10-22 – TraitFinder import", "POST /core/data undefined",
    ], "trays before the plants in them; the values last");
    const w = (name: string) => writes.find((x) => x.body.name === name)!.body;
    const prov = writes.find((x) => x.path === "/core/provenances")!.body;
    assert.match(prov.description, /^Imported from a TraitFinder \(PlantEye\) export by the Graph Explorer: 9 values, scans from 2025-10-22 13:19:34 to 2025-10-29 13:19:34 \(Europe\/Oslo\)\.$/);
    assert.deepEqual(prov.prov_activity, [{ rdf_type: "http://www.w3.org/ns/prov#Activity", start_date: "2025-10-22T13:19:34", end_date: "2025-10-29T13:19:34", timezone: "Europe/Oslo" }]);
    const data = writes.find((x) => x.path === "/core/data")!.body;
    assert.equal(data.length, 9);
    assert.deepEqual(data.find((d: any) => d.target === "so:PB002" && d.variable === "variables:NDVI Average"), {
      target: "so:PB002", variable: "variables:NDVI Average", date: "2025-10-22T13:19:34", timezone: "Europe/Oslo", value: 0.6,
      provenance: { uri: "prov:new", experiments: ["exp:new"] },
    }, "the plant by its new uri, the variable by its new uri, a number, local time with its zone");
    assert.deepEqual(writes.find((x) => x.path === "/core/experiments")!.body, { name: "PBar1x4 – TraitFinder – 2025-10-22", start_date: "2025-10-22", objective: "Imported from a TraitFinder (PlantEye) export.", is_public: true });
    const variable = (name: string) => writes.find((x) => x.path === "/core/variables" && x.body.name === name)!.body;
    assert.deepEqual(variable("Height"), {
      name: "Height", entity: "entities:Plant", characteristic: "characteristics:Height", method: "m:pe", unit: "u:mm",
      datatype: "http://www.w3.org/2001/XMLSchema#decimal", description: 'TraitFinder column "Height mm".',
    }, "reused parts by PHIS's uri, new ones by theirs");
    assert.equal(variable("Leaf inclination").unit, "units:SquareMillimeterPerSquareMillimeter");
    assert.equal(variable("NDVI Average").unit, "units:Unitless");
    assert.deepEqual(w("Tiril"), { name: "Tiril", rdf_type: "vocabulary:Variety", species: "agrovoc:barley", is_public: true, code: "G16" });
    assert.equal(writes.find((x) => x.method === "PUT")!.body.code, "G5");
    assert.equal(writes.find((x) => x.method === "PUT")!.body.species, "agrovoc:barley", "the rest of Olve's record goes back too");
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

test("POST /api/import/run that fails part-way says what it did and that importing again finishes it", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockPhisForRun(writes, "PB002");
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200, "already streaming when it failed");
    const { error } = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.match(error, /^The import stopped part-way: .*It had created the experiment, created 1 new germplasm, created 2 factors and created 4 of 5 scientific objects in "PBar1x4 – TraitFinder – 2025-10-22"\. Import the same files again to finish: what is already in PHIS is skipped, nothing is written twice\.$/);
    assert.equal(writes.filter((w: any) => w.path === "/core/scientific_objects").length, 5, "the batch in flight finishes; the report counts what exists");
  });
});

test("POST /api/import/run that fails before the experiment says the vocabulary and variables it added are kept", async () => {
  await withServer(async (base) => {
    mockPhisForRun([], "PBar1x4 – TraitFinder – 2025-10-22");
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    const { error } = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.match(error, /Only 2 vocabulary terms, 6 variable parts and 3 variables were added to PHIS \(kept, and reused next time\)\.$/);
  });
});

test("POST /api/import/plan: messy values are left out and reported — empty cells counted, non-numbers and contradictions (same plant, trait and time, two values) with examples; a repeated identical row is one value", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const sheet = SHEET
      .replace('"TraitFinder",10,0.5,1.2', '"TraitFinder",,n/a,1.2')
      + '\n"31",2,1,"2025-10-22 13:19:34","PB_2","Tiril","TraitFinder",11,0.7,1.1,4,"31"';
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ "PBar1x4_Metadata.csv": MANIFEST, "Sheets/PBar1x4_TraitFinder_20260107_PHIS.csv": sheet }) });
    const m = (await res.json()).measurements;
    assert.equal(m.count, 6, "9 - 1 empty - 1 not a number - 1 contradiction; PB002's Height and Leaf inclination repeat identically");
    assert.deepEqual(m.skipped, {
      empty: 1,
      notNumbers: { count: 1, examples: ['PB001, NDVI Average, 2025-10-29 13:19:34: "n/a"'] },
      contradictions: { count: 1, examples: ["PB002, NDVI Average, 2025-10-22 13:19:34: 0.6 or 0.7"] },
    });
  });
});

// An experiment of the same name already in PHIS: Tray 31, PB001 (nothing set) and PB002 (another
// variety, position 3) are there; factor Replicate has only level 1, GroupID is missing; the variables
// exist, and PB001 already has two values on 2025-10-29 (one equal to the file, one not).
function mockExistingExperiment(writes: { method: string; path: string; body: any }[]) {
  const exp = "exp:old";
  const name = "PBar1x4 – TraitFinder – 2025-10-22";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/rest/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    if (method === "GET") { const known = ontologyAnswer(url, true); if (known) return known; }
    if (path.startsWith("/core/data/search")) return jsonResponse(200, { result: [
      { target: "so:old1", variable: "var:Height", date: "2025-10-29T13:19:34.000+0100", value: 10 },
      { target: "so:old1", variable: "var:NDVI Average", date: "2025-10-29T13:19:34.000+0100", value: 0.9 },
    ] });
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (path === "/core/germplasm") return jsonResponse(201, { result: [`g:${body.name}`] });
      if (path === "/core/experiments/factors") return jsonResponse(method === "PUT" ? 200 : 201, { result: `f:${body.name}` });
      if (path === "/core/scientific_objects") return jsonResponse(method === "PUT" ? 200 : 201, { result: method === "PUT" ? body.uri : `so:${body.name}` });
      if (path === "/core/provenances") return jsonResponse(201, { result: "prov:new" });
      if (path === "/core/data") return jsonResponse(201, { result: body.map((_: unknown, i: number) => `data:${i}`) });
    }
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [{ uri: exp, name }] });
    if (path.startsWith(`/core/scientific_objects?experiment=${encodeURIComponent(exp)}`)) return jsonResponse(200, { result: [{ uri: "so:tray31", name: "Tray 31" }, { uri: "so:old1", name: "PB001" }, { uri: "so:old2", name: "PB002" }] });
    if (path === `/core/experiments/${encodeURIComponent(exp)}/factors`) return jsonResponse(200, { result: [{ uri: "f:rep", name: "Replicate", experiment: exp, levels: [{ uri: "lvl:Replicate.1", name: "1" }] }] });
    const copy = path.match(/^\/core\/scientific_objects\/so%3A(old1|old2|tray31)\?experiment=/);
    if (copy) return jsonResponse(200, { result: copy[1] === "tray31" ? { uri: "so:tray31", name: "Tray 31", rdf_type: "https://phis.pheno.no/vocabulary#Tray", relations: [] }
      : copy[1] === "old1"
      ? { uri: "so:old1", name: "PB001", rdf_type: "vocabulary:Plant", relations: [] }
      : { uri: "so:old2", name: "PB002", rdf_type: "vocabulary:Plant", relations: [
        { property: "vocabulary:hasGermplasm", value: "g:annika", inverse: false },
        { property: "https://phis.pheno.no/vocabulary#positionInTray", value: "3", inverse: false }] } });
    if (path === "/core/germplasm/g%3Aannika") return jsonResponse(200, { result: { uri: "g:annika", name: "Annika" } });
    const levels = path.match(/^\/core\/experiments\/factors\/f%3A(\w+)\/levels$/);
    if (levels) {
      const names = levels[1] === "rep" ? ["1", "2"] : ["9", "10"];
      const fac = levels[1] === "rep" ? "Replicate" : "GroupID";
      return jsonResponse(200, { result: names.map((n) => ({ uri: `lvl:${fac}.${n}`, name: n })) });
    }
    const variable = url.match(/\/core\/variables\?name=([^&]+)/);
    if (variable) { const n = decodeURIComponent(variable[1]).replace(/\\/g, ""); return jsonResponse(200, { result: [{ uri: `var:${n}`, name: n }] }); }
    const known = variablesAnswer(url);
    if (known) return known;
    if (url.includes("rdf_type=")) return jsonResponse(200, { result: [{ uri: "agrovoc:barley", name: "barley" }] });
    if (url.includes("/core/germplasm?name=Olve")) return jsonResponse(200, { result: [{ uri: "g:olve", name: "Olve" }] });
    if (url.includes("/core/germplasm?name=Tiril")) return jsonResponse(200, { result: [] });
    if (url.includes("/core/germplasm/g%3Aolve")) return jsonResponse(200, { result: { uri: "g:olve", name: "Olve", code: "G5" } });
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}

test("POST /api/import/plan into an existing experiment is a fill: what PHIS lacks is listed to add, what PHIS has differently is listed and kept, values already there are skipped", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockExistingExperiment(writes);
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.equal(plan.experiment.exists, true);
    assert.deepEqual(plan.factors, [
      { name: "Replicate", levels: ["1", "2"], exists: true, newLevels: ["2"] },
      { name: "GroupID", levels: ["9", "10"] },
    ]);
    assert.equal(plan.objects.count, 2, "Tray 32 and PB003 are new");
    assert.equal(plan.objects.existing, 3);
    assert.deepEqual(plan.objects.fills, { count: 2, what: { tray: 2, position: 1, germplasm: 1, levels: 2 } }, "PB002 keeps its variety and position");
    assert.deepEqual(plan.objects.conflicts, { count: 2, examples: ["PB002: PHIS has Annika, the file Tiril", "PB002: PHIS has position 3, the file position 2"] });
    assert.equal(plan.measurements.count, 7, "9 in the file, 1 already in PHIS, 1 different in PHIS");
    assert.equal(plan.measurements.alreadyInPhis, 1, "PHIS's +0100 on 2025-10-29 is 13:19:34 Oslo time, as in the file");
    assert.deepEqual(plan.measurements.differ, { count: 1, examples: ["PB001, NDVI Average, 2025-10-29 13:19:34: PHIS has 0.9, the file 0.5"] });
    assert.deepEqual(writes, [], "the plan writes nothing");
  });
});

test("POST /api/import/run into an existing experiment creates only what's new, adds a missing level, fills existing objects without changing what they have, and writes only new values", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockExistingExperiment(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.at(-1).result.created, { germplasm: 1, codes: 0, factors: 1, objects: 2, filled: 2, levels: 1, vocabulary: 0, variables: 0, values: 7 });
    assert.deepEqual(writes.filter((w) => w.path !== "/core/data").map((w) => `${w.method} ${w.path} ${w.body.name ?? w.body.uri}`.replace(/ import \d{4}.*$/, " import")), [
      "POST /core/germplasm Tiril",
      "PUT /core/experiments/factors Replicate",
      "POST /core/experiments/factors GroupID",
      "POST /core/scientific_objects Tray 32",
      "POST /core/scientific_objects PB003",
      "PUT /core/scientific_objects PB001", "PUT /core/scientific_objects PB002",
      "POST /core/provenances PBar1x4 – TraitFinder – 2025-10-22 – TraitFinder import",
    ], "no experiment created; existing ones filled after the new tray exists");
    assert.deepEqual(writes[1].body.levels.map((l: any) => l.name), ["1", "2"], "level 1 kept, level 2 added");
    const put = (uri: string) => writes.find((w) => w.method === "PUT" && w.body.uri === uri)!.body;
    assert.deepEqual(put("so:old1").relations, [
      { property: "vocabulary:hasGermplasm", value: "g:olve", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:Replicate.1", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:GroupID.9", inverse: false },
      { property: "vocabulary:isPartOf", value: "so:tray31", inverse: false },
      { property: "https://phis.pheno.no/vocabulary#positionInTray", value: "1", inverse: false },
    ]);
    assert.deepEqual(put("so:old2").relations, [
      { property: "vocabulary:hasGermplasm", value: "g:annika", inverse: false },
      { property: "https://phis.pheno.no/vocabulary#positionInTray", value: "3", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:Replicate.1", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:GroupID.10", inverse: false },
      { property: "vocabulary:isPartOf", value: "so:tray31", inverse: false },
    ], "Annika and position 3 stay; only what was missing is added");
    const data = writes.find((w) => w.path === "/core/data")!.body;
    assert.equal(data.length, 7);
    assert.ok(!data.some((d: any) => d.target === "so:old1" && d.date === "2025-10-29T13:19:34" && ["var:Height", "var:NDVI Average"].includes(d.variable)), "neither the equal nor the differing value is written");
    assert.ok(data.some((d: any) => d.target === "so:PB003"), "a new plant's values go to its new uri");
  });
});
