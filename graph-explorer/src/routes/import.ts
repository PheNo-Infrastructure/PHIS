import { respondOpenSilexErrors } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { readZip } from "../import/files.ts";
import { buildPlan } from "../import/plan.ts";
import { runImport } from "../import/run.ts";

// ponytail: the whole upload is held in memory; fine for sheet exports, capped so a stray
// multi-GB scan archive is refused instead of exhausting the server.
const MAX_UPLOAD = 50 * 1024 * 1024;

// Both take the instrument's ZIP as-is as the body.
//   POST /api/import/plan               -> what would be created or reused; writes nothing
//   POST /api/import/run?species=<uri>  -> writes it (species: for new germplasm)
export const handleImport: RouteHandler = async (req, res, { pathname, searchParams }) => {
  const route = { "/api/import/plan": "plan", "/api/import/run": "run" }[pathname];
  if (!route || req.method !== "POST") return false;
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_UPLOAD) {
      reply(413, { error: `That file is over ${MAX_UPLOAD / 1024 / 1024} MB. Upload the export with the sheets (CSV), not the raw scans.` });
      return true;
    }
    chunks.push(chunk as Buffer);
  }
  let files;
  try {
    files = readZip(Buffer.concat(chunks));
  } catch (err) {
    reply(400, { error: err instanceof Error ? err.message : String(err) });
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    reply(200, route === "plan" ? await buildPlan(files) : await runImport(files, { species: searchParams.get("species") ?? undefined }));
  });
  return true;
};
