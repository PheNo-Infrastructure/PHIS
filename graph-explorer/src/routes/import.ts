import { respondOpenSilexErrors } from "../opensilex.ts";
import type { RouteHandler } from "../http.ts";
import { readZip } from "../import/files.ts";
import { buildPlan } from "../import/plan.ts";

// ponytail: the whole upload is held in memory; fine for sheet exports, capped so a stray
// multi-GB scan archive is refused instead of exhausting the server.
const MAX_UPLOAD = 50 * 1024 * 1024;

// POST /api/import/plan — body: the instrument's ZIP as-is. Answers with the plan; writes nothing.
export const handleImport: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/import/plan" || req.method !== "POST") return false;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_UPLOAD) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `That file is over ${MAX_UPLOAD / 1024 / 1024} MB. Upload the export with the sheets (CSV), not the raw scans.` }));
      return true;
    }
    chunks.push(chunk as Buffer);
  }
  await respondOpenSilexErrors(res, async () => {
    let files;
    try {
      files = readZip(Buffer.concat(chunks));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
      return;
    }
    const plan = await buildPlan(files);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(plan));
  });
  return true;
};
