// Maths and layout for the experiment chart grid. Pure (no DOM, no imports): Node tests import it as an ES
// module, and the server inlines it into the page after stripping `export ` (see static.ts).

export function meanSd(values) {
  const xs = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) : null;
  return { mean, sd, n: xs.length };
}

// Per scan column: the mean and SD over the plants that have a value in that column.
export function groupColumns(plants, nCols) {
  return Array.from({ length: nCols }, (_, i) => meanSd(plants.map((p) => p.values[i]?.v ?? null)));
}

// The y span of every number in the lists; a flat line (or nothing) still gets some height.
export function yRange(seriesLists) {
  const xs = seriesLists.flat().filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!xs.length) return { lo: 0, hi: 1 };
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return lo === hi ? { lo: lo - 0.5, hi: hi + 0.5 } : { lo, hi };
}

const STANDALONE_VIAS = new Set(["", "#all", "#other"]); // not a factor box: a plant picked here is charted on its own

// What to chart for a selection in one experiment. `picks` = the selection's items, `st` = the experiment's structure.
export function arrangeCharts(picks, st) {
  const variables = picks.filter((p) => p.type === "variable").map((p) => ({ id: p.id, label: p.label }));
  const levelOf = new Map(), factorOfLevel = new Map();
  st.factors.forEach((f) => f.levels.forEach((l) => { levelOf.set(l.id, l); factorOfLevel.set(l.id, f); }));
  const known = new Set([...st.factors.flatMap((f) => f.levels.flatMap((l) => l.plants.map((p) => p.id))), ...st.factors.flatMap((f) => f.unset.map((p) => p.id)), ...st.other.map((p) => p.id)]);

  const pickedFactors = new Set(picks.filter((p) => p.type === "factor").map((p) => p.id));
  const pickedLevels = new Set(picks.filter((p) => p.type === "factor_level" && levelOf.has(p.id)).map((p) => p.id));
  const covered = (levelId) => pickedLevels.has(levelId) || pickedFactors.has(factorOfLevel.get(levelId)?.id);
  const plants = picks.filter((p) => p.type === "scientific_object");
  const outside = [];
  const instances = []; // {id, label, via} — one per pick instance
  plants.forEach((p) => {
    if (!known.has(p.id)) { outside.push(p.label); return; }
    (p.vias ?? [""]).forEach((via) => instances.push({ id: p.id, label: p.label, via }));
  });

  const rows = [];
  st.factors.forEach((f) => {
    const charts = [];
    f.levels.forEach((l, i) => {
      const alsoPicked = instances.filter((x) => x.via === l.id).map((x) => x.id);
      const standaloneInside = instances.filter((x) => (STANDALONE_VIAS.has(x.via) || x.via.endsWith("#unset")) && l.plants.some((q) => q.id === x.id)).map((x) => x.id);
      if (covered(l.id)) {
        charts.push({ key: l.id, title: l.label, sub: `${l.plants.length} plants`, kind: "level", plantIds: l.plants.map((q) => q.id), emphasis: [...new Set([...alsoPicked, ...standaloneInside])], colorIndex: i });
      } else if (alsoPicked.length) {
        charts.push({ key: `${l.id}:picked`, title: l.label, sub: `${alsoPicked.length} picked`, kind: "picked", plantIds: alsoPicked, emphasis: [], colorIndex: i });
      }
    });
    if (charts.length) rows.push({ label: f.label, kind: "factor", charts });
  });

  const alone = [];
  // A pick is standalone when it was made outside a factor box: from a list ("") or the A-Z view or trays, or in an "(unset)" box.
  instances.filter((x) => STANDALONE_VIAS.has(x.via) || x.via.endsWith("#unset")).forEach((x) => {
    if (!alone.some((a) => a.id === x.id)) alone.push(x);
  });
  if (alone.length) rows.push({ label: "Plants", kind: "plants", charts: alone.map((x) => ({ key: `plant:${x.id}`, title: x.label, sub: "single plant", kind: "plant", plantIds: [x.id], emphasis: [], colorIndex: 0 })) });
  return { variables, rows, outside };
}
