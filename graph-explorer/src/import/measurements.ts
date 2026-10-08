// Measured values: checked here (skip and report — nothing is guessed), then written under one
// provenance per import, in batches. Probed on phis-test 2026-10-05: a POST to /core/data is
// all-or-nothing (one duplicate refuses the whole batch), the same plant + variable + time +
// provenance can't be stored twice, a local time with a `timezone` is stored with its offset,
// 1000 values take ~0.5 s, and DELETE /core/data?experiment=&provenance= removes one import's values.
import { authedPost } from "../opensilex.ts";
import type { TrialData } from "./plugins.ts";

type Raw = NonNullable<TrialData["measurements"]>[number];
export type Value = { object: string; variable: string; date: string; value: number };
const EXAMPLES = 3;
export const VALUES_AT_ONCE = 1000;

export function checkMeasurements(raw: Raw[]) {
  let empty = 0;
  const notNumbers: string[] = [];
  const byKey = new Map<string, Value[]>();
  for (const m of raw) {
    const text = m.value.trim();
    if (!text) { empty++; continue; }
    const value = Number(text);
    if (!Number.isFinite(value)) { notNumbers.push(`${m.object}, ${m.variable}, ${m.date.replace("T", " ")}: "${text}"`); continue; }
    const key = `${m.object}|${m.variable}|${m.date}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({ ...m, value });
  }
  // The same value twice is one value; two different ones for the same plant, trait and time are a
  // contradiction — neither is written.
  const values: Value[] = [];
  const contradictions: string[] = [];
  for (const list of byKey.values()) {
    const distinct = [...new Set(list.map((v) => v.value))];
    if (distinct.length === 1) values.push(list[0]);
    else contradictions.push(`${list[0].object}, ${list[0].variable}, ${list[0].date.replace("T", " ")}: ${distinct.join(" or ")}`);
  }
  const dates = values.map((v) => v.date).sort();
  return {
    values,
    summary: {
      count: values.length,
      objects: new Set(values.map((v) => v.object)).size,
      variables: new Set(values.map((v) => v.variable)).size,
      days: new Set(dates.map((d) => d.slice(0, 10))).size,
      first: dates[0] ?? null,
      last: dates.at(-1) ?? null,
      skipped: {
        empty,
        notNumbers: { count: notNumbers.length, examples: notNumbers.slice(0, EXAMPLES) },
        contradictions: { count: contradictions.length, examples: contradictions.slice(0, EXAMPLES) },
      },
    },
  };
}

const firstUri = (r: { result: unknown }) => String([r.result].flat()[0]);
// One provenance per import: where the values came from and the period they cover.
// agents: the device that measured and the person who ran it (their rdf_types as PHIS keeps them).
export async function createProvenance(name: string, description: string, first: string, last: string, timezone: string, agents: { uri: string; rdf_type: string }[] = []) {
  return firstUri(await authedPost("/core/provenances", {
    name, description,
    prov_activity: [{ rdf_type: "http://www.w3.org/ns/prov#Activity", start_date: first, end_date: last, timezone }],
    ...(agents.length ? { prov_agent: agents } : {}),
  }));
}

export async function writeValues(batch: Value[], ids: { objects: Map<string, string>; variables: Map<string, string> }, provenance: string, experiment: string, timezone: string) {
  await authedPost("/core/data", batch.map((v) => ({
    target: ids.objects.get(v.object), variable: ids.variables.get(v.variable), date: v.date, timezone, value: v.value,
    provenance: { uri: provenance, experiments: [experiment] },
  })));
}
