import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { RouteHandler } from "../http.ts";

const MOCKUP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../public/index.html"
);
const ADJACENCY_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../adjacency.js");
const CREATION_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../creation.js");

// Serves the mockup page (with adjacency.js/creation.js inlined into it) plus those two files
// standalone, for direct Node/test import. See adjacency.js's own header comment for why they
// exist as plain JS shared verbatim between the browser and the backend.
export const handleStatic: RouteHandler = async (req, res) => {
  if (req.url === "/" && req.method === "GET") {
    const [html, adjacencyJs, creationJs] = await Promise.all([
      readFile(MOCKUP_PATH, "utf8"),
      readFile(ADJACENCY_PATH, "utf8"),
      readFile(CREATION_PATH, "utf8"),
    ]);
    // Both files are real ES modules (for Node/test imports) but this page's script is a
    // plain classic script — stripping the leading `export ` on each declaration line makes
    // the exact same source valid there too, with zero duplication of the actual rule.
    const inlineJs = adjacencyJs.replace(/^export /gm, "") + "\n" + creationJs.replace(/^export /gm, "");
    if (!html.includes("/* ADJACENCY_JS_INJECTED_HERE */")) {
      throw new Error("mockup.html is missing the ADJACENCY_JS_INJECTED_HERE marker");
    }
    const merged = html.replace("/* ADJACENCY_JS_INJECTED_HERE */", inlineJs);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(merged);
    return true;
  }

  if (req.url === "/adjacency.js" && req.method === "GET") {
    const js = await readFile(ADJACENCY_PATH, "utf8");
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(js);
    return true;
  }

  if (req.url === "/creation.js" && req.method === "GET") {
    const js = await readFile(CREATION_PATH, "utf8");
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(js);
    return true;
  }

  return false;
};
