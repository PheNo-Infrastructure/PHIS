// A stand-in for OpenSILEX for CI, where there is no PHIS: logs in, and answers every other call with an empty list.
// Tests that stub their own routes then run as usual; the ones that need real PHIS data skip themselves (NO_LIVE_PHIS=1).
// Usage: node --experimental-strip-types test/fake-phis.mts [port]   (default 4999)
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4999);
const meta = { pagination: { pageSize: 0, currentPage: 0, totalCount: 0, totalPages: 0, limitCount: 0, hasNextPage: false }, status: [], datafiles: [] };
createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  req.resume();
  req.on("end", () => {
    const path = (req.url ?? "").split("?")[0];
    if (path.endsWith("/security/authenticate")) return res.end(JSON.stringify({ metadata: meta, result: { token: "fake" } }));
    res.end(JSON.stringify({ metadata: meta, result: [] }));
  });
}).listen(port, () => console.log(`fake PHIS on :${port}`));
