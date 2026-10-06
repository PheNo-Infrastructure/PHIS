// A scientific object's measured values in one experiment, shaped for its page: one column per scan
// (a day, or a day and time when one day has several), one row per variable with its unit. Read-only.
import { authedGetOne, authedPost, compactUri, respondOpenSilexErrors } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";

const enc = encodeURIComponent;
type Row = { variable: string; date: string; value: unknown; target?: string };
const unitSymbols = new Map<string, Promise<string>>();

// Scans as columns: one per day, or per day and minute when a day holds several values of one variable
// (for one object, or for the same plant: two plants measured the same day still share a column).
export function buildColumns(rows: Row[]) {
  const day = (r: Row) => r.date.slice(0, 10);
  const minute = (r: Row) => r.date.slice(0, 16);
  const perDay = new Set(rows.map((r) => `${r.variable}|${r.target ?? ""}|${day(r)}`)).size === rows.length;
  const key = perDay ? day : minute;
  const keys = [...new Set(rows.map(key))].sort();
  const columns = keys.map((k) => ({ key: k, times: [...new Set(rows.filter((r) => key(r) === k).map((r) => r.date.slice(11, 16)))] }));
  return { columns, key, keys };
}

export async function measurementsOf(object: string, experiment: string) {
  // The object goes in the body: as a query parameter `targets` is ignored (probed 2026-10-05).
  const rows = (await authedPost(`/core/data/search?experiments=${enc(experiment)}&page_size=100000&order_by=${enc("date=asc")}`, [object])).result as unknown as Row[];
  if (!rows.length) return { columns: [], variables: [] };

  // PHIS answers each time in the zone it was stored with ("2025-10-22T13:19:34.000+0200"): its date
  // and clock time are the scan's local ones. A day is one column unless a variable has two values that day.
  const { columns, key, keys } = buildColumns(rows);

  const uris = [...new Set(rows.map((r) => r.variable))];
  const variables = (await authedPost("/core/variables/by_uris", uris)).result as unknown as { uri: string; name: string; unit?: { uri: string; name?: string } }[];
  // A variable's unit comes without its symbol, and so does the unit list — only a unit's own record
  // has it (probed 2026-10-05). Units are few and rarely change: each is read once per server run.
  const unitText = async (u?: { uri: string; name?: string }) => {
    if (!u) return "";
    const key = await compactUri(u.uri);
    if (!unitSymbols.has(key)) unitSymbols.set(key, authedGetOne(`/core/units/${enc(u.uri)}`).then((r) => String(r.result.symbol ?? "")).catch(() => ""));
    return (await unitSymbols.get(key)!) || (u.name === "Unitless" ? "" : u.name ?? "");
  };
  const byUri = new Map(await Promise.all(variables.map(async (v) => [await compactUri(v.uri), v] as const)));
  const out = await Promise.all(uris.map(async (uri) => {
    const v = byUri.get(await compactUri(uri));
    const mine = rows.filter((r) => r.variable === uri);
    return {
      id: String(v?.uri ?? uri), name: String(v?.name ?? uri), unit: await unitText(v?.unit),
      values: keys.map((k) => { const r = mine.find((x) => key(x) === k); return r ? { v: Number(r.value), at: r.date.slice(11, 16) } : null; }),
    };
  }));
  out.sort((a, b) => a.name.localeCompare(b.name));
  return { columns, variables: out };
}

export const handleMeasurements: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/measurements" || req.method !== "GET") return false;
  const object = searchParams.get("object");
  const experiment = searchParams.get("experiment");
  if (!object || !experiment) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "object and experiment are required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const body = JSON.stringify(await measurementsOf(object, experiment));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  return true;
};
