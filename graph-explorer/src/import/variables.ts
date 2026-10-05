// Variables (what is measured): entity + characteristic + method + unit, each its own PHIS resource.
// The import reuses what the instance has by name and creates only what is missing — parts first,
// then the variables. Probed on phis-test 2026-10-05: OpenSILEX makes each uri from the name, so a
// name is only ever created once.
import { authedGet, authedPost, escapeRegex } from "../opensilex.ts";
import type { TrialData } from "./plugins.ts";

const enc = encodeURIComponent;
type Variable = NonNullable<TrialData["variables"]>[number];
export type PartKind = "entities" | "characteristics" | "methods" | "units";
const PART_OF: Record<PartKind, "entity" | "characteristic" | "method" | "unit"> = { entities: "entity", characteristics: "characteristic", methods: "method", units: "unit" };
const DECIMAL = "http://www.w3.org/2001/XMLSchema#decimal";

// A file gives a unit by its symbol; PHIS names units (Millimeter), often without a symbol.
const UNIT_NAMES: Record<string, string> = {
  mm: "Millimeter", "mm²": "SquareMillimeter", "mm³": "CubicMillimeter", "%": "Percent", "°": "Degree",
  "mm²/mm²": "SquareMillimeterPerSquareMillimeter", "": "Unitless",
};
const unitName = (symbol: string) => UNIT_NAMES[symbol] ?? symbol;
const same = (a: unknown, b: string) => String(a ?? "").toLowerCase() === b.toLowerCase();
const byName = async (kind: string, name: string) =>
  (await authedGet(`/core/${kind}?name=${enc(escapeRegex(name))}&page_size=50`)).result.find((x) => same(x.name, name))?.uri;

// What exists and what must be created. `ids` maps "kind|name" (units: "units|symbol") to a uri.
export async function resolveVariables(variables: Variable[]) {
  const ids = new Map<string, string>();
  const found = await Promise.all(variables.map((v) => byName("variables", v.name)));
  const existing = variables.flatMap((v, i) => (found[i] ? [{ name: v.name, id: found[i]! }] : []));
  const missing = variables.filter((_, i) => !found[i]); // in the file's order

  const create: { kind: PartKind; name: string; key: string; symbol?: string }[] = [];
  for (const kind of ["entities", "characteristics", "methods"] as const) {
    for (const name of new Set(missing.map((v) => v[PART_OF[kind]]))) {
      const id = await byName(kind, name);
      if (id) ids.set(`${kind}|${name}`, id); else create.push({ kind, name, key: `${kind}|${name}` });
    }
  }
  // Units: few, so all at once; a symbol only matches a unit that has one (PHIS's often don't).
  const units = new Set(missing.map((v) => v.unit));
  if (units.size) {
    const all = (await authedGet("/core/units?page_size=1000")).result;
    for (const symbol of units) {
      const hit = all.find((u) => same(u.name, unitName(symbol)) || (symbol && same(u.symbol, symbol)));
      if (hit) ids.set(`units|${symbol}`, hit.uri);
      else create.push({ kind: "units", name: unitName(symbol), key: `units|${symbol}`, ...(symbol ? { symbol } : {}) });
    }
  }
  existing.sort((a, b) => a.name.localeCompare(b.name));
  return { existing, missing, create, ids };
}
export type VariableResolution = Awaited<ReturnType<typeof resolveVariables>>;

const firstUri = (r: { result: unknown }) => String([r.result].flat()[0]);
export async function createPart(r: VariableResolution, part: VariableResolution["create"][number]) {
  r.ids.set(part.key, firstUri(await authedPost(`/core/${part.kind}`, { name: part.name, ...(part.symbol ? { symbol: part.symbol } : {}) })));
}
export async function createVariable(r: VariableResolution, v: Variable) {
  return firstUri(await authedPost("/core/variables", {
    name: v.name,
    entity: r.ids.get(`entities|${v.entity}`),
    characteristic: r.ids.get(`characteristics|${v.characteristic}`),
    method: r.ids.get(`methods|${v.method}`),
    unit: r.ids.get(`units|${v.unit}`),
    datatype: DECIMAL,
    ...(v.description ? { description: v.description } : {}),
  }));
}
