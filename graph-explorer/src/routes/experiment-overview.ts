// One variable's values for every plant of an experiment, shaped like the plant page's measurements
// (scan columns + per-plant values), for the chart grid. Read-only.
import { authedGetOne, authedPost, respondOpenSilexErrors } from "../opensilex.ts";
import { buildColumns } from "./measurements.ts";
import type { RouteHandler } from "../http.ts";

const enc = encodeURIComponent;
type Row = { variable: string; date: string; value: unknown; target?: string };
const unitSymbols = new Map<string, Promise<string>>();

export async function experimentOverview(experiment: string, variable: string) {
  // No target in the body = every object of the experiment (probed 2026-10-06: 884 rows for 100 plants in ~0.5 s).
  const rows = (await authedPost(`/core/data/search?experiments=${enc(experiment)}&variables=${enc(variable)}&page_size=100000&order_by=${enc("date=asc")}`, [])).result as unknown as Row[];
  const info = ((await authedPost("/core/variables/by_uris", [variable])).result as unknown as { uri: string; name: string; unit?: { uri: string; name?: string } }[])[0];
  const unit = await (async () => {
    const u = info?.unit;
    if (!u) return "";
    if (!unitSymbols.has(u.uri)) unitSymbols.set(u.uri, authedGetOne(`/core/units/${enc(u.uri)}`).then((r) => String(r.result.symbol ?? "")).catch(() => ""));
    return (await unitSymbols.get(u.uri)!) || (u.name === "Unitless" ? "" : u.name ?? "");
  })();
  const head = { id: variable, name: String(info?.name ?? variable), unit };
  if (!rows.length) return { variable: head, columns: [], plants: [] };

  const { columns, key, keys } = buildColumns(rows, 0.1); // a few re-scans keep day columns; the latest value of a day counts
  const byPlant = new Map<string, Row[]>();
  for (const r of rows) byPlant.set(String(r.target), [...(byPlant.get(String(r.target)) ?? []), r]);
  const plants = [...byPlant].map(([id, mine]) => ({
    id,
    values: keys.map((k) => { const r = mine.filter((x) => key(x) === k).at(-1); return r ? { v: Number(r.value), at: r.date.slice(11, 16) } : null; }),
  }));
  return { variable: head, columns, plants };
}

export const handleExperimentOverview: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/experiment-overview" || req.method !== "GET") return false;
  const experiment = searchParams.get("experiment"), variable = searchParams.get("variable");
  if (!experiment || !variable) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "experiment and variable are required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const body = JSON.stringify(await experimentOverview(experiment, variable));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  return true;
};
