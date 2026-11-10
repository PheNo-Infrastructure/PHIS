// Where things stand, the way PHIS keeps it: a Move event of the object to a facility, with the position as text (x/y/z exist
// too, but a file's "block 1, column 3" is words, not coordinates). The facility is the one the instrument itself stands in —
// the `to` of its latest move in PHIS — so the import never guesses a place. Probed on phis-test 2026-11-10: a Move accepts a
// scientific object as its target, and UiT-TraitFinder stands in HOLT_PT_G.
import { authedGet, authedGetOne, authedPost, compactUri, escapeRegex } from "../opensilex.ts";
import { movesOf } from "../node-types.ts";

export type Facility = { id: string; name: string };
const enc = encodeURIComponent;
const MOVES_AT_ONCE = 100;

// The facility a device stands in now (the `to` of its newest move), or null if it was never moved.
export async function deviceFacility(deviceId: string): Promise<Facility | null> {
  const to = (await movesOf(deviceId))[0]?.location?.to;
  if (!to) return null;
  const id = String(to);
  const name = String((await authedGetOne(`/core/facilities/${enc(id)}`).catch(() => null))?.result.name ?? id);
  return { id, name };
}

export async function deviceFacilities(devices: { id: string }[]) {
  const out = new Map<string, Facility>();
  for (const d of devices) { // in turn: each is a couple of small reads, and most devices have no move at all
    const f = await deviceFacility(d.id).catch(() => null);
    if (f) out.set(d.id, f);
  }
  return out;
}

// Objects already in PHIS that stand where the file's objects stand: same type, same name, and the newest move of the object is
// to this facility with the same position text. That is what makes a place ONE object across experiments (it joins each experiment
// with its own copy) instead of a duplicate per import. Exactly one match is reused; several are left alone (`ambiguous`) and the
// import makes a new object, so nothing is ever merged by guessing.
export async function findStanding(objects: { name: string; rdfType: string; place?: string }[], facility: string) {
  const found = new Map<string, string>();
  const ambiguous = new Set<string>();
  const wanted = objects.filter((o) => o.place);
  const names = [...new Set(wanted.map((o) => o.name))];
  const hits: { uri: string; name: string; type: string }[] = [];
  for (let i = 0; i < names.length; i += 60) {
    const rows = (await authedGet(`/core/scientific_objects?name=${enc(`^(${names.slice(i, i + 60).map(escapeRegex).join("|")})$`)}&page_size=500`)).result;
    for (const r of rows) hits.push({ uri: String(r.uri), name: String(r.name ?? ""), type: await compactUri(String(r.rdf_type ?? "")) });
  }
  const at = await compactUri(facility);
  const key = (s: string) => s.trim().toLowerCase();
  const standsAt = new Map<string, boolean>(); // by `uri|place`: read each object's moves once
  for (const o of wanted) {
    const type = await compactUri(o.rdfType);
    const matches: string[] = [];
    for (const h of hits.filter((x) => key(x.name) === key(o.name) && x.type === type)) {
      const id = `${h.uri}|${o.place}`;
      if (!standsAt.has(id)) {
        const move = (await movesOf(h.uri).catch(() => []))[0]?.location;
        standsAt.set(id, !!move?.to && (await compactUri(String(move.to))) === at && String(move.text ?? "").trim() === o.place);
      }
      if (standsAt.get(id)) matches.push(h.uri);
    }
    if (matches.length === 1) found.set(o.name, matches[0]);
    else if (matches.length > 1) ambiguous.add(o.name);
  }
  return { found, ambiguous };
}

// Of objects an experiment already holds, those that have never been moved: the fill gives them the place the file says. An object
// that was moved somewhere (even elsewhere) is left alone — PHIS keeps its history.
export async function withoutPlace<T extends { uri: string }>(items: T[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < items.length; i += 4) {
    const batch = items.slice(i, i + 4);
    const moved = await Promise.all(batch.map((o) => movesOf(o.uri).then((m) => m.length > 0).catch(() => true))); // unreadable = not touched
    batch.forEach((o, j) => { if (!moved[j]) out.push(o); });
  }
  return out;
}

// One Move per object, all to `facility` on `day`. A move needs targets_positions (probed), here the text.
export async function recordPlaces(items: { uri: string; text: string }[], facility: string, day: string, tick: () => void) {
  const end = `${day}T12:00:00Z`;
  for (let i = 0; i < items.length; i += MOVES_AT_ONCE) {
    await authedPost("/core/events/moves", items.slice(i, i + MOVES_AT_ONCE).map((o) => ({
      rdf_type: "oeev:Move", is_instant: true, end, targets: [o.uri], to: facility,
      targets_positions: [{ target: o.uri, position: { text: o.text } }],
    })));
    tick();
  }
}
export const placeBatches = (n: number) => Math.ceil(n / MOVES_AT_ONCE);
