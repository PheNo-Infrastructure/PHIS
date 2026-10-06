import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import type { RouteHandler } from "./http.ts";
import { handleStatic } from "./routes/static.ts";
import { handleList } from "./routes/list.ts";
import { handleCreate } from "./routes/create.ts";
import { handleNodeDetail, handleNodeMutation } from "./routes/node.ts";
import { handleLink } from "./routes/link.ts";
import { handleParent } from "./routes/parent.ts";
import { handleUnlink } from "./routes/unlink.ts";
import { handleImport } from "./routes/import.ts";
import { handleElsewhere } from "./routes/elsewhere.ts";
import { handleSearch } from "./routes/search.ts";
import { handleMeasurements } from "./routes/measurements.ts";
import { handleExperimentOverview } from "./routes/experiment-overview.ts";

export { _resetAuthCacheForTests } from "./opensilex.ts";
export const WRITE_HEADER = "x-graph-explorer"; // node lowercases header names

// One handler per route group, tried in order — each returns true once it has written a
// response. Adding a new route group (e.g. a future import endpoint) means adding one entry
// here and one new file under routes/, not growing this list into an if/else chain.
const routeHandlers: RouteHandler[] = [
  handleStatic,
  handleList,
  handleSearch,
  handleMeasurements,
  handleExperimentOverview,
  handleCreate,
  handleNodeDetail,
  handleNodeMutation,
  handleLink,
  handleParent,
  handleUnlink,
  handleImport,
  handleElsewhere,
];

// Exported for tests. Every branch is wrapped so a failure anywhere (a bad
// OpenSILEX response, a missing file, a network error) always produces a
// clean HTTP response instead of an unhandled rejection that kills the process.
export async function handleRequest(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) {
  // No CORS headers: the page comes from this same server, and "Access-Control-Allow-Origin: *" let
  // any website read the API's answers (locally there's no login in front of it).
  // The sub-path the shared ingress serves the app under (e.g. "/portal" on phis.pheno.no). It is
  // stripped before routing, so every route below stays written as if served at "/". Unset locally.
  // The bare sub-path redirects to its slash form first: the page's relative "api/..." calls only
  // resolve under "/portal/", and its script would otherwise fire them before any client redirect.
  const basePath = process.env.BASE_PATH ?? "";
  if (basePath && req.url === basePath) {
    res.writeHead(301, { Location: `${basePath}/` });
    res.end();
    return;
  }
  if (basePath && req.url?.startsWith(basePath)) req.url = req.url.slice(basePath.length) || "/";
  const { pathname, searchParams } = new URL(req.url ?? "/", "http://internal");

  // Every change must carry WRITE_HEADER, which the page adds. A browser only sends a custom header
  // to another site's server after a preflight this server never answers, so another site can't
  // make a logged-in browser change PHIS (CSRF) — whatever the method or body type.
  if (pathname.startsWith("/api/") && req.method !== "GET" && req.method !== "HEAD" && req.headers[WRITE_HEADER] !== "1") {
    res.writeHead(403, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Changes are only accepted from the Graph Explorer page itself." }));
    return;
  }

  try {
    for (const handler of routeHandlers) {
      if (await handler(req, res, { pathname, searchParams })) return;
    }
    res.writeHead(404);
    res.end();
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(err) }));
  }
}

const PORT = 4000;
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createServer(handleRequest);
  server.listen(PORT, () => console.log(`Graph Explorer backend listening on :${PORT}`));
}
