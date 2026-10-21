// A group of histogram-bin variables ("NDVI [0.15:0.3]") for every plant of an experiment: per plant and scan, the share in
// each bin, in the bins' order — what the distribution charts draw. A scan that lacks one of the bins is left out (null),
// not completed with a guess. Read-only.
import { authedGetOne, authedPost, respondOpenSilexErrors } from "../opensilex.ts";
import { binOf, type Bin } from "../experiment-structure.ts";
import { buildColumns } from "./measurements.ts";
import type { RouteHandler } from "../http.ts";

const enc = encodeURIComponent;
type Row = { variable: string; date: string; value: unknown; target?: string };

export async function experimentDistribution(experiment: string, group: string) {
  const g = (await authedGetOne(`/core/variables_group/${enc(group)}`)).result as { uri?: string; name?: string; variables?: { uri: string; name?: string }[] };
  const bins: Bin[] = (g.variables ?? []).flatMap((m) => { const b = binOf(String(m.uri), String(m.name ?? "")); return b ? [b] : []; })
    .sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  const head = { id: group, name: String(g.name ?? group) };
  if (!bins.length) return { group: head, bins: [], columns: [], plants: [] };
  const vars = bins.map((b) => `variables=${enc(b.id)}`).join("&");
  const rows = (await authedPost(`/core/data/search?experiments=${enc(experiment)}&${vars}&page_size=100000&order_by=${enc("date=asc")}`, [])).result as unknown as Row[];
  const { columns, key, keys } = buildColumns(rows, 0.1);
  const byPlant = new Map<string, Row[]>();
  for (const r of rows) byPlant.set(String(r.target), [...(byPlant.get(String(r.target)) ?? []), r]);
  const plants = [...byPlant].map(([id, mine]) => ({
    id,
    values: keys.map((k) => {
      const shares = bins.map((b) => { const r = mine.filter((x) => key(x) === k && x.variable === b.id).at(-1); return r ? Number(r.value) : NaN; });
      return shares.every(Number.isFinite) ? shares : null;
    }),
  }));
  return { group: head, bins, columns, plants };
}

export const handleExperimentDistribution: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/experiment-distribution" || req.method !== "GET") return false;
  const experiment = searchParams.get("experiment"), group = searchParams.get("group");
  if (!experiment || !group) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "experiment and group are required" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const body = JSON.stringify(await experimentDistribution(experiment, group));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(body);
  });
  return true;
};
