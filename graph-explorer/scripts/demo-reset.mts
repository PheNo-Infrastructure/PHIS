// Puts phis-test back to the demo's starting state: deletes ONLY the TraitFinder demo experiment
// (through the running local portal, same call as its "Delete it and everything in it" button).
// Run with the portal up (npm run dev). Nothing else is touched; it refuses any other name.
const BASE = process.env.DEMO_BASE ?? "http://localhost:4000";
const NAME = "UiT_MDK_ArcticFrontiers_01 – TraitFinder – 2025-11-25";

const res = await fetch(`${BASE}/api/experiments`);
if (!res.ok) throw new Error(`Portal not answering at ${BASE} (${res.status}) — is npm run dev running?`);
const matches = ((await res.json()) as { id: string; label: string }[]).filter((e) => e.label === NAME);
if (!matches.length) { console.log("Already clean: the demo experiment does not exist."); process.exit(0); }
if (matches.length > 1) throw new Error(`${matches.length} experiments are named "${NAME}" — resolve by hand.`);

const id = encodeURIComponent(matches[0].id);
const preview = await (await fetch(`${BASE}/api/experiment-delete/preview?id=${id}`)).json();
if (preview.name !== NAME) throw new Error(`Preview names "${preview.name}", not the demo experiment — stopping.`);
console.log(`Deleting "${NAME}": ${preview.objects} objects, ${preview.values} values, ${preview.shared} shared.`);
if (preview.shared) throw new Error("Some objects are shared with other experiments — stopping, not a clean demo experiment.");

const del = await fetch(`${BASE}/api/experiment-delete?id=${id}&name=${encodeURIComponent(NAME)}`, { method: "DELETE", headers: { "x-graph-explorer": "1" } });
const lines = (await del.text()).trim().split("\n").map((l) => JSON.parse(l));
const last = lines.at(-1);
if (!del.ok || last.error || !last.result) throw new Error(`Delete failed: ${last?.error ?? del.status}`);
console.log("Done:", JSON.stringify(last.result));
