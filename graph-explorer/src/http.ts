// Small generic node:http helpers shared across route modules — not OpenSILEX-specific.

export async function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// One route module = one handler with this shape: return true once it has written a
// response (whether success or an error status), false to let the dispatcher try the next
// handler. Keeps index.ts a plain list instead of a growing if/else chain.
export type RouteHandler = (
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  ctx: { pathname: string; searchParams: URLSearchParams }
) => Promise<boolean>;
