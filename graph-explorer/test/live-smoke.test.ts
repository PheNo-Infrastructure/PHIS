import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { handleRequest } from "../src/index.ts";

// Hits the real OpenSILEX instance configured in .env. Deliberately does not
// assert specific counts or names — only that each wired route returns a
// well-shaped list of {id, type, label}. Catches real breakage (auth
// config drift, an endpoint moving) without breaking every time PHIS data changes.

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createServer(handleRequest);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function assertWellShapedList(body: unknown, expectedType: string) {
  assert.ok(Array.isArray(body), "response should be an array");
  for (const item of body as Array<Record<string, unknown>>) {
    assert.equal(typeof item.id, "string");
    assert.ok((item.id as string).length > 0);
    assert.equal(item.type, expectedType);
    assert.equal(typeof item.label, "string");
    assert.ok((item.label as string).length > 0);
  }
}

const WIRED_ROUTES: Array<{ path: string; type: string }> = [
  { path: "/api/organizations", type: "organization" },
  { path: "/api/experiments", type: "experiment" },
  { path: "/api/projects", type: "project" },
  { path: "/api/facilities", type: "facility" },
  { path: "/api/devices", type: "device" },
  { path: "/api/sites", type: "site" },
  { path: "/api/persons", type: "person" },
  { path: "/api/scientific-objects", type: "scientific_object" },
  { path: "/api/variables", type: "variable" },
  { path: "/api/germplasm", type: "germplasm" },
  { path: "/api/datafiles", type: "data_file" },
  { path: "/api/provenances", type: "provenance" },
  { path: "/api/events", type: "event" },
  { path: "/api/documents", type: "document" },
  { path: "/api/factors", type: "factor" },
];

for (const { path, type } of WIRED_ROUTES) {
  test(`live: GET ${path} reaches the real PHIS instance`, async () => {
    await withServer(async (base) => {
      const res = await fetch(`${base}${path}`);
      const body = await res.json();
      assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`);
      assertWellShapedList(body, type);
    });
  });
}
