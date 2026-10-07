// Regenerates docs/superpowers/phis-api-inventory.md from the live OpenSILEX API definition (swagger.json):
// every endpoint by area, and the fields of every Creation/Update DTO that point at something else (the things
// that can be LINKED). Facts only — what the app does about each is in docs/superpowers/graph-explorer-a-z.md.
//   cd graph-explorer && node --experimental-strip-types --env-file=.env scripts/phis-inventory.ts
import { writeFileSync } from "node:fs";

const host = process.env.PHIS_HOST;
if (!host) throw new Error("PHIS_HOST is not set (see .env)");
const sw = await (await fetch(`${host}/rest/swagger.json`)).json() as {
  info?: { version?: string };
  paths: Record<string, Record<string, { summary?: string; tags?: string[] }>>;
  definitions: Record<string, { properties?: Record<string, { type?: string; $ref?: string; items?: { type?: string; $ref?: string } }>; required?: string[] }>;
};

const byTag = new Map<string, { method: string; path: string; summary: string }[]>();
for (const [path, methods] of Object.entries(sw.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    for (const tag of op.tags ?? ["(untagged)"]) {
      (byTag.get(tag) ?? byTag.set(tag, []).get(tag)!).push({ method: method.toUpperCase(), path, summary: op.summary ?? "" });
    }
  }
}

// Fields that are plain facts about the thing itself, not links to another resource.
const PLAIN = new Set(["uri", "name", "description", "rdf_type", "rdf_type_name", "publisher", "publication_date", "last_updated_date", "publicationDate", "lastUpdateDate", "start_date", "end_date", "date", "timezone", "email", "password", "language", "admin", "enable", "first_name", "last_name", "affiliation", "phone_number", "orcid", "objective", "shortname", "website", "financial_funding", "brand", "constructor_model", "serial_number", "start_up", "removal", "is_public", "datatype", "alternative_name", "symbol", "alternative_symbol", "value", "unit_name", "metadata", "geometry", "address", "is_instant", "start", "end", "title", "format", "type", "typeLabel", "relations"]);
const refName = (r?: string) => (r ?? "").replace("#/definitions/", "");
const describe = (p: { type?: string; $ref?: string; items?: { type?: string; $ref?: string } }) =>
  p.type === "array" ? `list of ${p.items?.$ref ? refName(p.items.$ref) : p.items?.type ?? "?"}` : p.$ref ? `→ ${refName(p.$ref)}` : (p.type ?? "?");

const out: string[] = [];
out.push(`# PHIS API inventory`, ``,
  `Generated ${new Date().toISOString().slice(0, 10)} from ${host}/rest/swagger.json (OpenSILEX ${sw.info?.version ?? "?"}) by \`graph-explorer/scripts/phis-inventory.ts\`.`,
  `Do not edit by hand — rerun the script. What the app does about each area, and why, is in \`graph-explorer-a-z.md\`.`, ``,
  `## Areas and endpoints`, ``);
for (const [tag, ops] of [...byTag].sort((a, b) => a[0].localeCompare(b[0]))) {
  out.push(`### ${tag} (${ops.length})`, ``);
  for (const o of ops.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))) out.push(`- \`${o.method} ${o.path}\` — ${o.summary}`);
  out.push(``);
}

out.push(`## What can be linked: fields of every Creation/Update DTO that are not plain facts`, ``,
  `A field here is a candidate link (to another resource, a list of them, or a nested record). "required" = PHIS refuses without it.`, ``);
for (const name of Object.keys(sw.definitions).filter((n) => /(Creation|Update)DTO$/.test(n)).sort()) {
  const def = sw.definitions[name];
  const rows = Object.entries(def.properties ?? {}).filter(([k]) => !PLAIN.has(k));
  if (!rows.length) continue;
  out.push(`- **${name}**: ${rows.map(([k, p]) => `\`${k}\` (${describe(p)}${def.required?.includes(k) ? ", required" : ""})`).join(", ")}`);
}
out.push(``);

writeFileSync(new URL("../../docs/superpowers/phis-api-inventory.md", import.meta.url), out.join("\n"));
console.log(`${[...byTag.values()].reduce((n, o) => n + o.length, 0)} operations in ${byTag.size} areas written`);
