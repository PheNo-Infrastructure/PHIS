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

test("readZip refuses a ZIP that would unpack into something huge (the app is open to anyone with the link)", () => {
  const bomb = makeZip({ "big.csv": "0".repeat(101 * 1024 * 1024) });
  assert.ok(bomb.length < 1024 * 1024, "a ZIP of a few hundred KB");
  assert.throws(() => readZip(bomb), /larger than 100 MB once unpacked/);
  assert.equal(readZip(makeZip({ "ok.csv": "a,b\n1,2\n" })).size, 1, "a normal file is fine");
});

test("readZip reads stored and deflated entries; parseCsv handles quotes, BOM, CRLF and blank lines", () => {
  const zip = readZip(makeZip({ "a.csv": "x", "Sheets/b.csv": "y".repeat(500) }, ["a.csv"]));
  assert.equal(zip.get("a.csv")!.toString(), "x");
  assert.equal(zip.get("Sheets/b.csv")!.toString(), "y".repeat(500));
  assert.throws(() => readZip(Buffer.from("not a zip")), /isn't a ZIP/);
  assert.deepEqual([...readZip(makeZip({ "Sheets\\c.csv": "z" })).keys()], ["Sheets/c.csv"], "Compress-Archive's backslashes become /");

  const rows = parseCsv('﻿"Name","Note"\r\n"PB001","say ""hi"", ok"\r\n\r\nPB002,plain\r\n');
  assert.deepEqual(rows, [{ Name: "PB001", Note: 'say "hi", ok' }, { Name: "PB002", Note: "plain" }]);
});

// Three plants in two blocks: Olve twice (exists in PHIS), Tiril once (missing). A raw HortControl export, as it comes.
const RAW = [
  "unit,timestamp,sensor,genotype,g_alias,treatment,Height mm,NDVI Average ,Leaf inclination mm²/mm²,Hue [0:25] %,Hue [25:50] %",
  "1:1:1,2025-10-29 13:19:34,A,Olve,G5,15C,10,0.5,1.2,3,97",
  "1:2:1,2025-10-22 13:19:34,A,Tiril,G16,15C,11,0.6,1.1,4,96",
  "2:1:1,2025-10-29 13:19:34,A,Olve,G5,18C,12,0.4,1.3,5,95",
].join("\n");
const FILE = "Sheets/Trial01_TraitFinder_20260107_PlantEye.csv";
const NAME = "Trial01 – TraitFinder – 2025-10-22";

// The lists the review offers besides the data (who made it, who can see it).
function choiceLists(url: string) {
  if (/\/core\/devices\?/.test(url)) return jsonResponse(200, { result: [{ uri: "dev-tf", name: "UiT-TraitFinder" }, { uri: "dev-other", name: "Nikon Z6III" }] });
  if (/\/security\/persons\?/.test(url)) return jsonResponse(200, { result: [{ uri: "per-1", first_name: "Anna", last_name: "Berg" }] });
  if (/\/security\/groups\?/.test(url)) return jsonResponse(200, { result: [{ uri: "grp-1", name: "Researchers" }] });
  return null;
}

// The vocabulary checks (Block type, a plant's column in it): `present` = this PHIS already has them.
function ontologyAnswer(url: string, present: boolean) {
  if (url.includes("/ontology/rdf_type?") || url.includes("/ontology/property?")) {
    return present ? jsonResponse(200, { result: { uri: "x" } }) : jsonResponse(500, { result: { message: "owl:Class URI not found : x" } });
  }
  if (url.includes("/vuejs/owl_extension/rdf_type_properties")) {
    return jsonResponse(200, { result: { data_properties: present ? [{ uri: "https://phis.pheno.no/vocabulary#positionInBlock" }] : [] } });
  }
  return null;
}

// Variables and their parts: this PHIS has the units Millimeter (no symbol) and Percent and the method, nothing else.
function variablesAnswer(url: string) {
  if (url.includes("/core/units?")) return jsonResponse(200, { result: [{ uri: "u:mm", name: "Millimeter", symbol: null }, { uri: "u:pct", name: "Percent" }] });
  if (url.includes("/core/methods?name=PlantEye")) return jsonResponse(200, { result: [{ uri: "m:pe", name: "PlantEye 3D scan" }] });
  if (/\/core\/(variables|variables_group|entities|characteristics|methods)\?name=/.test(url)) return jsonResponse(200, { result: [] });
  return null;
}

function mockPhis(calls: string[], olveCode: string | null = null) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const known = ontologyAnswer(url, false) ?? variablesAnswer(url) ?? choiceLists(url);
    if (known) return known;
    if (url.includes("/core/germplasm/g%3Aolve")) return jsonResponse(200, { result: { uri: "g:olve", name: "Olve", code: olveCode } });
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [{ uri: "e1", name: `${NAME} (old)` }] });
    if (url.includes("rdf_type=")) return jsonResponse(200, { result: [{ uri: "agrovoc:barley", name: "barley" }] });
    if (url.includes("/core/germplasm?name=Olve")) return jsonResponse(200, { result: [{ uri: "g:olve", name: "olve" }, { uri: "g:olve2", name: "Olve 2" }] });
    if (url.includes("/core/germplasm?name=Tiril")) return jsonResponse(200, { result: [] });
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

test("POST /api/import/plan: HortControl export -> the plan (exact-name germplasm matching, the treatment factor, bins as variables); only GETs reach PHIS", async () => {
  await withServer(async (base) => {
    const calls: string[] = [];
    mockPhis(calls);
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ [FILE]: RAW }) });
    assert.equal(res.status, 200);
    const plan = await res.json();
    assert.equal(plan.instrument, "TraitFinder (HortControl export)");
    assert.deepEqual(plan.experiment, { name: NAME, startDate: "2025-10-22", exists: false }, "a name that only contains it isn't a match; earliest date starts it");
    assert.deepEqual(plan.germplasm, { existing: [{ name: "Olve", id: "g:olve" }], missing: ["Tiril"], ambiguous: [], codes: [{ name: "Olve", code: "G5" }, { name: "Tiril", code: "G16" }] }, "case-insensitive exact match; 'Olve 2' ignored; codes from g_alias");
    assert.deepEqual(plan.vocabulary.map((v: any) => v.label), ["the object type Block", "the plant property Column in block"], "what this PHIS lacks, added first");
    assert.deepEqual(plan.variables.missing, ["Height", "NDVI Average", "Leaf inclination", "Hue [0:25]", "Hue [25:50]"], "traits and bins, in the file's order; the header's trailing space is gone");
    assert.deepEqual(plan.variables.parts, [
      { kind: "entities", name: "Plant" }, { kind: "entities", name: "Canopy" }, { kind: "entities", name: "Leaf" },
      { kind: "characteristics", name: "Height" }, { kind: "characteristics", name: "NDVI Average" }, { kind: "characteristics", name: "Leaf inclination" },
      { kind: "characteristics", name: "Hue [0:25]" }, { kind: "characteristics", name: "Hue [25:50]" },
      { kind: "units", name: "Unitless" }, { kind: "units", name: "SquareMillimeterPerSquareMillimeter", symbol: "mm²/mm²" },
    ], "the method, Millimeter and Percent are reused");
    assert.deepEqual(plan.variableGroups, [{ name: "Hue distribution", variables: 2, exists: false }], "the bins of one histogram are one group");
    assert.deepEqual(plan.measurements, {
      count: 15, objects: 3, variables: 5, days: 2, first: "2025-10-22T13:19:34", last: "2025-10-29T13:19:34", timezone: "Europe/Oslo",
      skipped: { empty: 0, notNumbers: { count: 0, examples: [] }, contradictions: { count: 0, examples: [] } },
    }, "3 plants x 5 traits");
    assert.deepEqual(plan.speciesOptions, [{ id: "agrovoc:barley", label: "barley" }]);
    assert.deepEqual(plan.factors, [{ name: "Treatment", levels: ["15C", "18C"] }]);
    assert.equal(plan.objects.count, 5, "3 plants + their 2 blocks");
    assert.deepEqual(plan.objects.kinds, [{ type: "block", count: 2 }, { type: "plant", count: 3 }]);
    assert.deepEqual(plan.objects.sample[0], { name: "B1-C1", rdfType: "vocabulary:Plant", germplasm: "Olve", factors: { Treatment: "15C" }, parent: "Block 1", position: 1 }, "the sample shows plants, not blocks");
    assert.deepEqual(plan.warnings, []);
    assert.ok(calls.every((c) => c.startsWith("GET ") || c.includes("/security/authenticate")), "the plan writes nothing");
  });
});

test("POST /api/import/plan: codes come from g_alias — an existing different code is kept, a variety given two codes gets none (warned); vocabulary already there isn't listed", async () => {
  await withServer(async (base) => {
    mockPhis([], "G99");
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => ontologyAnswer(url, true) ?? inner(url, init)) as typeof fetch;
    const raw = RAW + "\n2:2:1,2025-10-22 13:19:34,A,Tiril,G7,18C,11,0.6,1.1,4,96";
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ [FILE]: raw }) });
    const plan = await res.json();
    assert.deepEqual(plan.vocabulary, []);
    assert.deepEqual(plan.germplasm.codes, [], "Olve keeps G99, Tiril is G16 and G7");
    assert.ok(plan.warnings.includes("The file gives Tiril 2 codes (G16, G7), so no code is set for it."), plan.warnings.join(" | "));
    assert.ok(plan.warnings.includes("Olve already has the code G99 in PHIS; the file's G5 isn't used."), plan.warnings.join(" | "));
  });
});

test("POST /api/import/plan refuses what it can't import, saying why", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const post = async (body: Buffer) => { const r = await realFetch(`${base}/api/import/plan`, { method: "POST", body }); return { status: r.status, error: (await r.json()).error as string }; };
    assert.deepEqual(await post(Buffer.from("hello")), { status: 400, error: "This isn't a ZIP file." });
    const edited = await post(makeZip({ [FILE]: RAW.replace("2025-10-29 13:19:34", "10/29/2025 01:19:34 PM") }));
    assert.equal(edited.status, 400);
    assert.match(edited.error, /10\/29\/2025 01:19:34 PM.*straight from HortControl/);
    const unknown = await post(makeZip({ "notes.txt": "hi" }));
    assert.equal(unknown.status, 400);
    assert.match(unknown.error, /None of the known instruments recognises these files \(Boxeed 2\.0 \(Labdeers seed sort\), TraitFinder \(HortControl export\)\)/);
  });
});

// PHIS for the run: records every write; `failOn` makes the POST of what has that name fail.
function mockPhisForRun(writes: { method: string; path: string; body: any }[], failOn?: string) {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/rest/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    const known = method === "GET" && (ontologyAnswer(url, false) ?? variablesAnswer(url) ?? choiceLists(url));
    if (known) return known;
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (path === "/core/annotations") return jsonResponse(201, { result: "note:new" });
      if (failOn && body.name === failOn) return jsonResponse(400, { result: { title: "Bad request", message: "name clash" } });
      if (path.startsWith("/vuejs/") || path.startsWith("/ontology/")) return jsonResponse(201, { result: body.uri ?? "ok" });
      if (path === "/core/germplasm" && method === "PUT") return jsonResponse(200, { result: body.uri });
      if (path === "/core/variables_group") return jsonResponse(201, { result: `vg:${body.name}` });
      if (path === "/core/experiments") return jsonResponse(201, { result: "exp:new" });
      if (path === "/core/provenances") return jsonResponse(201, { result: "prov:new" });
      if (path === "/core/data") return jsonResponse(201, { result: body.map((_: unknown, i: number) => `data:${i}`) });
      const part = path.match(/^\/core\/(entities|characteristics|units|variables)$/);
      if (part) return jsonResponse(201, { result: [`${part[1]}:${body.name}`] });
      if (path === "/core/germplasm") return jsonResponse(201, { result: [`g:${body.name}`] });
      if (path === "/core/experiments/factors") return jsonResponse(201, { result: `f:${body.name}` });
      if (path === "/core/scientific_objects") return jsonResponse(201, { result: `so:${body.name}` });
    }
    const levels = path.match(/^\/core\/experiments\/factors\/f%3ATreatment\/levels$/);
    if (levels) return jsonResponse(200, { result: ["15C", "18C"].map((n) => ({ uri: `lvl:Treatment.${n}`, name: n })) });
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [] });
    if (url.includes("rdf_type=")) return jsonResponse(200, { result: [{ uri: "agrovoc:barley", name: "barley" }] });
    if (url.includes("/core/germplasm?name=Olve")) return jsonResponse(200, { result: [{ uri: "g:olve", name: "Olve" }] });
    if (url.includes("/core/germplasm?name=Tiril")) return jsonResponse(200, { result: [] });
    if (url.includes("/core/germplasm/g%3Aolve")) return jsonResponse(200, { result: { uri: "g:olve", name: "Olve", rdf_type: "vocabulary:Variety", species: "agrovoc:barley", is_public: true, code: null } });
    throw new Error(`unexpected fetch: ${method} ${url}`);
  }) as typeof fetch;
}
const EXPORT = () => makeZip({ [FILE]: RAW });

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

test("POST /api/import/run writes in order: vocabulary, variables (parts first), experiment, new germplasm (with its code), an existing germplasm's code, the factor with its levels, blocks, then each plant with its germplasm, treatment, block and column", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    const steps = lines.slice(0, -1).map((l) => `${l.progress.done}/${l.progress.total} ${l.progress.step}`);
    assert.deepEqual(steps.slice(0, 4), ["1/29 Added the object type Block to PHIS", "2/29 Added the plant property Column in block to PHIS", "3/29 Added the entity Plant", "4/29 Added the entity Canopy"], "one progress line per write");
    assert.deepEqual(steps.slice(-3), ["27/29 Creating scientific objects: 5 of 5", "28/29 Created the provenance of the measurements", "29/29 Writing measurements: 15 of 15"]);
    assert.deepEqual(lines.at(-1), { result: { experiment: { id: "exp:new", type: "experiment", label: NAME }, created: { species: 0, germplasm: 1, codes: 1, factors: 1, objects: 5, filled: 0, levels: 0, vocabulary: 2, variables: 5, variableGroups: 1, values: 15 } } });
    assert.deepEqual(writes.map((w) => `${w.method} ${w.path} ${String(w.body.name ?? w.body.uri ?? w.body.property).replace(/ \d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/, "")}`), [
      "POST /vuejs/owl_extension/rdf_type Block",
      "POST /ontology/property https://phis.pheno.no/vocabulary#positionInBlock",
      "POST /ontology/rdf_type_property_restriction https://phis.pheno.no/vocabulary#positionInBlock",
      "POST /core/entities Plant", "POST /core/entities Canopy", "POST /core/entities Leaf",
      "POST /core/characteristics Height", "POST /core/characteristics NDVI Average", "POST /core/characteristics Leaf inclination",
      "POST /core/characteristics Hue [0:25]", "POST /core/characteristics Hue [25:50]",
      "POST /core/units Unitless", "POST /core/units SquareMillimeterPerSquareMillimeter",
      "POST /core/variables Height", "POST /core/variables NDVI Average", "POST /core/variables Leaf inclination",
      "POST /core/variables Hue [0:25]", "POST /core/variables Hue [25:50]",
      "POST /core/variables_group Hue distribution",
      `POST /core/experiments ${NAME}`,
      "POST /core/germplasm Tiril",
      "PUT /core/germplasm Olve",
      "POST /core/experiments/factors Treatment",
      "POST /core/scientific_objects Block 1", "POST /core/scientific_objects Block 2",
      "POST /core/scientific_objects B1-C1", "POST /core/scientific_objects B1-C2", "POST /core/scientific_objects B2-C1",
      `POST /core/provenances ${NAME} – TraitFinder import`, "POST /core/data undefined",
    ], "blocks before the plants in them; the values last");
    const w = (name: string) => writes.find((x) => x.body.name === name)!.body;
    const prov = writes.find((x) => x.path === "/core/provenances")!.body;
    assert.match(prov.description, /^Imported from a TraitFinder \(HortControl export\) export by the Graph Explorer: 15 values, scans from 2025-10-22 13:19:34 to 2025-10-29 13:19:34 \(Europe\/Oslo\)\.$/);
    assert.deepEqual(prov.prov_activity, [{ rdf_type: "http://www.w3.org/ns/prov#Activity", start_date: "2025-10-22T13:19:34", end_date: "2025-10-29T13:19:34", timezone: "Europe/Oslo" }]);
    const data = writes.find((x) => x.path === "/core/data")!.body;
    assert.equal(data.length, 15);
    assert.deepEqual(data.find((d: any) => d.target === "so:B1-C2" && d.variable === "variables:NDVI Average"), {
      target: "so:B1-C2", variable: "variables:NDVI Average", date: "2025-10-22T13:19:34", timezone: "Europe/Oslo", value: 0.6, metadata: { sensor: "A" },
      provenance: { uri: "prov:new", experiments: ["exp:new"] },
    }, "the plant by its new uri, the variable by its new uri, a number, local time with its zone");
    assert.deepEqual(writes.find((x) => x.path === "/core/experiments")!.body, { name: NAME, start_date: "2025-10-22", objective: "Imported from a TraitFinder (HortControl export) export.", is_public: true });
    const variable = (name: string) => writes.find((x) => x.path === "/core/variables" && x.body.name === name)!.body;
    assert.deepEqual(variable("Height"), {
      name: "Height", entity: "entities:Plant", characteristic: "characteristics:Height", method: "m:pe", unit: "u:mm",
      datatype: "http://www.w3.org/2001/XMLSchema#decimal", description: 'TraitFinder column "Height mm".',
    }, "reused parts by PHIS's uri, new ones by theirs");
    assert.equal(variable("Leaf inclination").unit, "units:SquareMillimeterPerSquareMillimeter");
    assert.equal(variable("Leaf inclination").entity, "entities:Leaf");
    assert.equal(variable("NDVI Average").unit, "units:Unitless");
    assert.equal(variable("Hue [0:25]").unit, "u:pct", "a bin is a percentage");
    assert.deepEqual(w("Hue distribution"), { name: "Hue distribution", description: "The share of the pixels in each Hue range, one variable per range (they add up to 100 %).", variables: ["variables:Hue [0:25]", "variables:Hue [25:50]"] });
    assert.deepEqual(w("Tiril"), { name: "Tiril", rdf_type: "vocabulary:Variety", species: "agrovoc:barley", is_public: true, code: "G16" });
    assert.equal(writes.find((x) => x.method === "PUT")!.body.code, "G5");
    assert.equal(writes.find((x) => x.method === "PUT")!.body.species, "agrovoc:barley", "the rest of Olve's record goes back too");
    assert.deepEqual(w("Treatment"), { name: "Treatment", experiment: "exp:new", levels: [{ name: "15C" }, { name: "18C" }] });
    assert.deepEqual(w("Block 1"), {
      name: "Block 1", rdf_type: "https://phis.pheno.no/vocabulary#Block", experiment: "exp:new",
      relations: [],
    }, "a block carries no treatment; its plants do");
    assert.deepEqual(w("B1-C2"), {
      name: "B1-C2", rdf_type: "vocabulary:Plant", experiment: "exp:new",
      relations: [
        { property: "vocabulary:hasGermplasm", value: "g:Tiril", inverse: false },
        { property: "vocabulary:hasFactorLevel", value: "lvl:Treatment.15C", inverse: false },
        { property: "vocabulary:isPartOf", value: "so:Block 1", inverse: false },
        { property: "https://phis.pheno.no/vocabulary#positionInBlock", value: "2", inverse: false },
      ],
    }, "new germplasm by its new uri, existing by PHIS's, level by name, block by its new uri");
    assert.equal(w("B1-C1").relations[0].value, "g:olve");
    assert.equal(w("B2-C1").relations.find((r: any) => r.property === "vocabulary:isPartOf").value, "so:Block 2");
  });
});

test("POST /api/import/run that fails part-way says what it did and that importing again finishes it", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockPhisForRun(writes, "B1-C2");
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200, "already streaming when it failed");
    const { error } = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.match(error, new RegExp(`^The import stopped part-way: .*It had created the experiment, created 1 new germplasm, created 1 factor and created 4 of 5 scientific objects in "${NAME}"\\. Import the same files again to finish: what is already in PHIS is skipped, nothing is written twice\\.$`));
    assert.equal(writes.filter((w: any) => w.path === "/core/scientific_objects").length, 5, "the batch in flight finishes; the report counts what exists");
  });
});

test("POST /api/import/run that fails before the experiment says the vocabulary and variables it added are kept", async () => {
  await withServer(async (base) => {
    mockPhisForRun([], NAME);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    const { error } = JSON.parse((await res.text()).trim().split("\n").at(-1));
    assert.match(error, /Only 2 vocabulary terms, 10 variable parts, 5 variables and 1 variable group were added to PHIS \(kept, and reused next time\)\.$/);
  });
});

test("POST /api/import/plan: messy values are left out and reported — empty cells counted, non-numbers and contradictions (same plant, trait and time, two values) with examples; a repeated identical row is one value", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const raw = RAW
      .replace("A,Olve,G5,15C,10,0.5,1.2", "A,Olve,G5,15C,,n/a,1.2")
      + "\n1:2:1,2025-10-22 13:19:34,A,Tiril,G16,15C,11,0.7,1.1,4,96";
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ [FILE]: raw }) });
    const m = (await res.json()).measurements;
    assert.equal(m.count, 12, "15 - 1 empty - 1 not a number - 1 contradiction; B1-C2's other four traits repeat identically");
    assert.deepEqual(m.skipped, {
      empty: 1,
      notNumbers: { count: 1, examples: ['B1-C1, NDVI Average, 2025-10-29 13:19:34: "n/a"'] },
      contradictions: { count: 1, examples: ["B1-C2, NDVI Average, 2025-10-22 13:19:34: 0.6 or 0.7"] },
    });
  });
});

// An experiment of the same name already in PHIS: Block 1, B1-C1 (nothing set) and B1-C2 (another
// variety, column 3) are there; factor Treatment has only level 15C; the variables exist, and B1-C1
// already has two values on 2025-10-29 (one equal to the file, one not).
function mockExistingExperiment(writes: { method: string; path: string; body: any }[], existingName: string = NAME) {
  const exp = "exp:old";
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const path = url.replace(/^.*\/rest/, "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (url.includes("/security/authenticate")) return jsonResponse(200, { result: { token: "tok" } });
    if (method === "GET") { const known = ontologyAnswer(url, true) ?? choiceLists(url); if (known) return known; }
    if (path.startsWith("/core/data/search")) return jsonResponse(200, { result: [
      { target: "so:old1", variable: "var:Height", date: "2025-10-29T13:19:34.000+0100", value: 10 },
      { target: "so:old1", variable: "var:NDVI Average", date: "2025-10-29T13:19:34.000+0100", value: 0.9 },
    ] });
    if (method !== "GET") {
      writes.push({ method, path, body });
      if (path === "/core/germplasm") return jsonResponse(201, { result: [`g:${body.name}`] });
      if (path === "/core/variables_group") return jsonResponse(200, { result: body.uri });
      if (path === "/core/experiments/factors") return jsonResponse(method === "PUT" ? 200 : 201, { result: `f:${body.name}` });
      if (path === "/core/scientific_objects") return jsonResponse(method === "PUT" ? 200 : 201, { result: method === "PUT" ? body.uri : `so:${body.name}` });
      if (path === "/core/provenances") return jsonResponse(201, { result: "prov:new" });
      if (path === "/core/data") return jsonResponse(201, { result: body.map((_: unknown, i: number) => `data:${i}`) });
    }
    if (url.includes("/core/experiments?name=")) return jsonResponse(200, { result: [{ uri: exp, name: existingName }] });
    if (path.startsWith(`/core/scientific_objects?experiment=${encodeURIComponent(exp)}`)) return jsonResponse(200, { result: [{ uri: "so:block1", name: "Block 1" }, { uri: "so:old1", name: "B1-C1" }, { uri: "so:old2", name: "B1-C2" }] });
    if (path === `/core/experiments/${encodeURIComponent(exp)}/factors`) return jsonResponse(200, { result: [{ uri: "f:Treatment", name: "Treatment", experiment: exp, levels: [{ uri: "lvl:Treatment.15C", name: "15C" }] }] });
    const copy = path.match(/^\/core\/scientific_objects\/so%3A(old1|old2|block1)\?experiment=/);
    if (copy) return jsonResponse(200, { result: copy[1] === "block1" ? { uri: "so:block1", name: "Block 1", rdf_type: "https://phis.pheno.no/vocabulary#Block", relations: [] }
      : copy[1] === "old1"
      ? { uri: "so:old1", name: "B1-C1", rdf_type: "vocabulary:Plant", relations: [] }
      : { uri: "so:old2", name: "B1-C2", rdf_type: "vocabulary:Plant", relations: [
        { property: "vocabulary:hasGermplasm", value: "g:annika", inverse: false },
        { property: "https://phis.pheno.no/vocabulary#positionInBlock", value: "3", inverse: false }] } });
    if (path === "/core/germplasm/g%3Aannika") return jsonResponse(200, { result: { uri: "g:annika", name: "Annika" } });
    const levels = path.match(/^\/core\/experiments\/factors\/f%3ATreatment\/levels$/);
    if (levels) return jsonResponse(200, { result: ["15C", "18C"].map((n) => ({ uri: `lvl:Treatment.${n}`, name: n })) });
    if (url.includes("/core/variables_group?name=")) return jsonResponse(200, { result: [{ uri: "vg:hue", name: "Hue distribution" }] });
    if (path === "/core/variables_group/vg%3Ahue") return jsonResponse(200, { result: { uri: "vg:hue", name: "Hue distribution", description: "mine", variables: [{ uri: "var:Hue [0:25]", name: "Hue [0:25]" }] } });
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

test("POST /api/import/plan: an experiment whose PHIS name has a stray space at the end is still the same experiment (no duplicate is created)", async () => {
  await withServer(async (base) => {
    mockExistingExperiment([], `${NAME} `);
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.equal(plan.experiment.exists, true);
    assert.equal(plan.experiment.sameName, undefined);
  });
});

test("POST /api/import/plan into an existing experiment is a fill: what PHIS lacks is listed to add, what PHIS has differently is listed and kept, values already there are skipped", async () => {
  await withServer(async (base) => {
    const writes: any[] = [];
    mockExistingExperiment(writes);
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.equal(plan.experiment.exists, true);
    assert.deepEqual(plan.factors, [{ name: "Treatment", levels: ["15C", "18C"], exists: true, newLevels: ["18C"] }]);
    assert.deepEqual(plan.variableGroups, [{ name: "Hue distribution", variables: 2, exists: true, newMembers: 1 }]);
    assert.equal(plan.objects.count, 2, "Block 2 and B2-C1 are new");
    assert.equal(plan.objects.existing, 3);
    assert.deepEqual(plan.objects.fills, { count: 2, what: { block: 2, position: 1, germplasm: 1, levels: 2 } }, "B1-C2 keeps its variety and column; Block 1 has nothing to add");
    assert.deepEqual(plan.objects.conflicts, { count: 2, examples: ["B1-C2: PHIS has Annika, the file Tiril", "B1-C2: PHIS has position 3, the file position 2"] });
    assert.equal(plan.measurements.count, 13, "15 in the file, 1 already in PHIS, 1 different in PHIS");
    assert.equal(plan.measurements.alreadyInPhis, 1, "PHIS's +0100 on 2025-10-29 is 13:19:34 Oslo time, as in the file");
    assert.deepEqual(plan.measurements.differ, { count: 1, examples: ["B1-C1, NDVI Average, 2025-10-29 13:19:34: PHIS has 0.9, the file 0.5"] });
    assert.deepEqual(writes, [], "the plan writes nothing");
  });
});

test("POST /api/import/run into an existing experiment creates only what's new, adds a missing level, fills existing objects without changing what they have, and writes only new values", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockExistingExperiment(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT() });
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.at(-1).result.created, { species: 0, germplasm: 1, codes: 0, factors: 0, objects: 2, filled: 2, levels: 1, vocabulary: 0, variables: 0, variableGroups: 1, values: 13 });
    assert.deepEqual(writes.filter((w) => w.path !== "/core/data").map((w) => `${w.method} ${w.path} ${w.body.name ?? w.body.uri}`.replace(/ import \d{4}.*$/, " import")), [
      "PUT /core/variables_group Hue distribution",
      "POST /core/germplasm Tiril",
      "PUT /core/experiments/factors Treatment",
      "POST /core/scientific_objects Block 2",
      "POST /core/scientific_objects B2-C1",
      "PUT /core/scientific_objects B1-C1", "PUT /core/scientific_objects B1-C2",
      `POST /core/provenances ${NAME} – TraitFinder import`,
    ], "no experiment created; existing ones filled after the new block exists");
    assert.deepEqual(writes[0].body, { uri: "vg:hue", name: "Hue distribution", description: "mine", variables: ["var:Hue [0:25]", "var:Hue [25:50]"] }, "the group keeps its record and its member, and gains the missing bin");
    assert.deepEqual(writes[2].body.levels.map((l: any) => l.name), ["15C", "18C"], "level 15C kept, 18C added");
    const put = (uri: string) => writes.find((w) => w.method === "PUT" && w.body.uri === uri)!.body;
    assert.deepEqual(put("so:old1").relations, [
      { property: "vocabulary:hasGermplasm", value: "g:olve", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:Treatment.15C", inverse: false },
      { property: "vocabulary:isPartOf", value: "so:block1", inverse: false },
      { property: "https://phis.pheno.no/vocabulary#positionInBlock", value: "1", inverse: false },
    ]);
    assert.deepEqual(put("so:old2").relations, [
      { property: "vocabulary:hasGermplasm", value: "g:annika", inverse: false },
      { property: "https://phis.pheno.no/vocabulary#positionInBlock", value: "3", inverse: false },
      { property: "vocabulary:hasFactorLevel", value: "lvl:Treatment.15C", inverse: false },
      { property: "vocabulary:isPartOf", value: "so:block1", inverse: false },
    ], "Annika and column 3 stay; only what was missing is added");
    const data = writes.find((w) => w.path === "/core/data")!.body;
    assert.equal(data.length, 13);
    assert.ok(!data.some((d: any) => d.target === "so:old1" && d.date === "2025-10-29T13:19:34" && ["var:Height", "var:NDVI Average"].includes(d.variable)), "neither the equal nor the differing value is written");
    assert.ok(data.some((d: any) => d.target === "so:B2-C1"), "a new plant's values go to its new uri");
  });
});

test("POST /api/import/plan offers who made it and who can see it: the device is matched from the instrument's own name, no person is guessed", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.deepEqual(plan.options, {
      devices: [{ id: "dev-other", label: "Nikon Z6III" }, { id: "dev-tf", label: "UiT-TraitFinder" }],
      persons: [{ id: "per-1", label: "Anna Berg" }],
      groups: [{ id: "grp-1", label: "Researchers" }],
      matchedDevice: "dev-tf", matchedBecause: "TraitFinder",
    });
  });
});

test("POST /api/import/run with choices: the provenance names its device and person, a new experiment is shared as chosen, a note of the import goes on the experiment and the provenance", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const q = new URLSearchParams({ species: "agrovoc:barley", person: "per-1", share: "grp-1", note: "1" });
    q.append("device", "dev-tf"); q.append("device", "dev-other");
    const res = await realFetch(`${base}/api/import/run?${q}`, { method: "POST", body: EXPORT() });
    assert.equal(res.status, 200, await res.clone().text());
    const result = (await res.text()).trim().split("\n").map((l) => JSON.parse(l)).at(-1).result;
    assert.equal(result.created.note, true);
    const exp = writes.find((w) => w.path === "/core/experiments")!.body;
    assert.deepEqual([exp.is_public, exp.groups], [false, ["grp-1"]], "shared with the group only, not public");
    assert.deepEqual(writes.find((w) => w.path === "/core/provenances")!.body.prov_agent, [{ uri: "dev-tf", rdf_type: "vocabulary:Device" }, { uri: "dev-other", rdf_type: "vocabulary:Device" }, { uri: "per-1", rdf_type: "vocabulary:Operator" }]);
    const note = writes.find((w) => w.path === "/core/annotations")!.body;
    assert.deepEqual(note.targets, ["exp:new", "prov:new"]);
    assert.equal(note.motivation, "http://www.w3.org/ns/oa#describing");
    assert.match(note.description, /^Imported from a TraitFinder \(HortControl export\) export by the Graph Explorer on \d{4}-\d\d-\d\d\. Files: Sheets\/Trial01_TraitFinder_20260107_PlantEye\.csv\. Written: 5 scientific objects, 1 new germplasm, 1 factor, 5 variables, 15 measured values\./);
  });
});

test("POST /api/import/run without choices behaves as before (public, no agents, no note); private is allowed; an unknown device or group is refused before anything is written", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const run = (extra: Record<string, string>) => realFetch(`${base}/api/import/run?${new URLSearchParams({ species: "agrovoc:barley", ...extra })}`, { method: "POST", body: EXPORT() });
    assert.equal((await run({})).status, 200);
    assert.equal(writes.find((w) => w.path === "/core/experiments")!.body.is_public, true);
    assert.equal(writes.find((w) => w.path === "/core/provenances")!.body.prov_agent, undefined);
    assert.equal(writes.some((w) => w.path === "/core/annotations"), false);
    writes.length = 0;
    assert.equal((await run({ share: "private" })).status, 200);
    const exp = writes.find((w) => w.path === "/core/experiments")!.body;
    assert.deepEqual([exp.is_public, exp.groups], [false, undefined]);
    writes.length = 0;
    for (const bad of [{ device: "nope" }, { person: "nope" }, { share: "nope" }]) assert.equal((await run(bad)).status, 409);
    assert.deepEqual(writes, []);
  });
});

test("POST /api/import/run can add the species first when PHIS lacks it: created before the germplasm, which then points at it; a name PHIS already has, or a blank one, is refused before anything is written", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const run = (q: Record<string, string>) => realFetch(`${base}/api/import/run?${new URLSearchParams(q)}`, { method: "POST", body: EXPORT() });
    for (const [q, error] of [
      [{ newSpecies: "Barley" }, /already a species named "barley".*choose it from the list/i],
      [{ newSpecies: "   " }, /Choose the species/],
    ] as const) {
      const res = await run(q);
      assert.equal(res.status, 409);
      assert.match((await res.json()).error, error);
    }
    assert.deepEqual(writes, []);
    const res = await run({ newSpecies: " Bean " });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).result.created.species, 1);
    assert.equal(lines.at(-1).progress, undefined);
    const posts = writes.filter((w) => w.path === "/core/germplasm").map((w) => w.body);
    assert.deepEqual(posts[0], { name: "Bean", rdf_type: "vocabulary:Species", is_public: true }, "trimmed; a species has no species of its own");
    assert.equal(posts[1].name, "Tiril");
    assert.equal(posts[1].species, "g:Bean", "the germplasm points at the species just made");
  });
});

test("POST /api/import/plan: when OpenSILEX's class-properties read is broken (500 'Multiple objects…'), the column property counts as present if the property itself exists — the plan still works", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (url.includes("/vuejs/owl_extension/rdf_type_properties")) return jsonResponse(500, { result: { message: "Multiple objects for some unique property" } });
      return ontologyAnswer(url, true) ?? inner(url, init);
    }) as typeof fetch;
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.deepEqual(plan.vocabulary, []);
  });
});

test("POST /api/import/plan: a species with the same name as the file's germplasm is not a match — only varieties and accessions are", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const inner = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => url.includes("/core/germplasm?name=Olve")
      ? jsonResponse(200, { result: [{ uri: "g:olve", name: "Olve", rdf_type: "vocabulary:Variety" }, { uri: "g:olve-species", name: "Olve", rdf_type: "vocabulary:Species" }] })
      : inner(url, init)) as typeof fetch;
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT() })).json();
    assert.deepEqual(plan.germplasm.existing, [{ name: "Olve", id: "g:olve" }]);
    assert.deepEqual(plan.germplasm.ambiguous, []);
  });
});

test("POST /api/import/plan takes the export's CSV as it is too (its name in X-File-Name); anything else that isn't a ZIP is refused, saying what to upload", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const post = (body: string, name?: string) => realFetch(`${base}/api/import/plan`, { method: "POST", body, headers: name ? { "X-File-Name": encodeURIComponent(name) } : {} });
    const ok = await post(RAW, "Trial01_TraitFinder_20260107_PlantEye.csv");
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).experiment.name, NAME, "named from the file, as when it comes in a ZIP");
    const notCsv = await post("hello", "notes.txt");
    assert.equal(notCsv.status, 400);
    assert.match((await notCsv.json()).error, /ZIP or its CSV/);
    const noName = await post("hello");
    assert.equal((await noName.json()).error, "This isn't a ZIP file.", "unchanged when nothing says it is a CSV");
  });
});

// ---- edits made in the review (X-Import-Edits) ----
const EDITS = { experiment: { name: "My trial", startDate: "2025-11-01" }, germplasm: { Tiril: "Tiril B" }, factors: { Treatment: { levels: { "15C": "15 °C" } } }, variables: { "NDVI Average": "NDVI" } };
const editsHeader = (e: unknown) => ({ "X-Import-Edits": encodeURIComponent(JSON.stringify(e)) });

test("POST /api/import/plan with edits: the plan describes the edited data and says what the file called things, so the page can show both", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const res = await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ [FILE]: RAW }), headers: editsHeader(EDITS) });
    assert.equal(res.status, 200);
    const plan = await res.json();
    assert.deepEqual(plan.experiment, { name: "My trial", startDate: "2025-11-01", exists: false });
    assert.deepEqual(plan.germplasm.missing, ["Tiril B"]);
    assert.deepEqual(plan.factors, [{ name: "Treatment", levels: ["15 °C", "18C"] }]);
    assert.ok(plan.variables.missing.includes("NDVI") && !plan.variables.missing.includes("NDVI Average"));
    assert.deepEqual(plan.original.experiment, { name: NAME, startDate: "2025-10-22" }, "the file's own name and date");
    assert.deepEqual(plan.original.germplasm, ["Olve", "Tiril"]);
    assert.deepEqual(plan.original.factors, [{ name: "Treatment", levels: ["15C", "18C"] }]);
    assert.ok(plan.original.variables.includes("NDVI Average"));
    assert.deepEqual(plan.edits, EDITS, "what was applied is echoed back");
  });
});

test("POST /api/import/plan without edits has the file's names as original and no edits", async () => {
  await withServer(async (base) => {
    mockPhis([]);
    const plan = await (await realFetch(`${base}/api/import/plan`, { method: "POST", body: makeZip({ [FILE]: RAW }) })).json();
    assert.deepEqual(plan.edits, {});
    assert.deepEqual(plan.original.experiment, plan.experiment.exists === false ? { name: NAME, startDate: "2025-10-22" } : plan.original.experiment);
  });
});

test("POST /api/import/plan and /run refuse edits that don't make sense, in plain words, before anything is written", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    for (const [edits, message] of [
      [{ experiment: { name: " " } }, /name can't be empty/],
      [{ experiment: { startDate: "1 Nov" } }, /YYYY-MM-DD/],
      [{ germplasm: { Wheat: "x" } }, /no germplasm "Wheat"/],
      [{ germplasm: { Tiril: "Olve" } }, /Two germplasm would both be called "Olve"/],
    ] as [unknown, RegExp][]) {
      for (const route of ["plan", "run?species=agrovoc%3Abarley"]) {
        const res = await realFetch(`${base}/api/import/${route}`, { method: "POST", body: EXPORT(), headers: editsHeader(edits) });
        assert.equal(res.status, 400, route);
        assert.match((await res.json()).error, message);
      }
    }
    const garbled = await realFetch(`${base}/api/import/plan`, { method: "POST", body: EXPORT(), headers: { "X-Import-Edits": "%7Bnope" } });
    assert.equal(garbled.status, 400);
    assert.match((await garbled.json()).error, /edits could not be read/);
    assert.deepEqual(writes, [], "nothing was written");
  });
});

test("POST /api/import/run with edits writes the edited names: the experiment, the germplasm, the factor level and the variable", async () => {
  await withServer(async (base) => {
    const writes: { method: string; path: string; body: any }[] = [];
    mockPhisForRun(writes);
    const res = await realFetch(`${base}/api/import/run?species=${encodeURIComponent("agrovoc:barley")}`, { method: "POST", body: EXPORT(), headers: editsHeader(EDITS) });
    assert.equal(res.status, 200);
    const lines = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(lines.at(-1).result.experiment.label, "My trial");
    const wrote = writes.map((w) => `${w.method} ${w.path} ${String(w.body.name ?? w.body.uri ?? w.body.property)}`);
    assert.ok(wrote.includes("POST /core/experiments My trial"), wrote.join("\n"));
    assert.ok(wrote.includes("POST /core/germplasm Tiril B"));
    assert.ok(wrote.includes("POST /core/variables NDVI"));
    assert.ok(!wrote.some((w) => w.includes(NAME) && w.startsWith("POST /core/experiments ")), "the file's own name isn't used");
    const exp = writes.find((w) => w.path === "/core/experiments" && w.method === "POST")!;
    assert.equal(exp.body.start_date, "2025-11-01");
  });
});
