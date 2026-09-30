// Instrument plugins: one file per instrument in ./instruments/, found automatically — adding an
// instrument means adding one file. A plugin only translates its files into PHIS concepts
// (TrialData); matching against PHIS, the reviewable plan and the writes are shared (plan.ts), so
// every instrument imports the same way.
import { readdirSync } from "node:fs";

export type Files = Map<string, Buffer>; // path inside the upload -> bytes

// What an instrument's files say about a trial, in PHIS's terms. Names only — never PHIS uris:
// resolving names against PHIS is the shared engine's job.
export type TrialData = {
  experiment: { name: string; startDate: string }; // startDate: YYYY-MM-DD
  // One per scientific object. `factors`: factor name -> level name.
  objects: { name: string; rdfType: string; germplasm?: string; factors: Record<string, string> }[];
  // Things the user must see before anything is written (e.g. the files disagree).
  warnings: string[];
};

export type InstrumentPlugin = {
  key: string;
  label: string;
  detect(files: Files): boolean;
  parse(files: Files): TrialData;
};

let plugins: InstrumentPlugin[] | null = null;
export async function instrumentPlugins(): Promise<InstrumentPlugin[]> {
  if (!plugins) {
    const dir = new URL("./instruments/", import.meta.url);
    const names = readdirSync(dir).filter((f) => f.endsWith(".ts")).sort();
    plugins = await Promise.all(names.map(async (f) => (await import(new URL(f, dir).href)).default as InstrumentPlugin));
  }
  return plugins;
}
