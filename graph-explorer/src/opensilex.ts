// The OpenSILEX HTTP client: auth/token caching and the four authed verbs every route uses.
// Nothing here knows about node:http request/response — it only talks to OpenSILEX and either
// returns parsed JSON or throws.

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const PHIS_HOST = requireEnv("PHIS_HOST");
const PHIS_USER = requireEnv("PHIS_USER");
const PHIS_PASS = requireEnv("PHIS_PASS");

const API_HOST = PHIS_HOST.replace(/\/$/, "").endsWith("/rest")
  ? PHIS_HOST.replace(/\/$/, "")
  : `${PHIS_HOST.replace(/\/$/, "")}/rest`;

let token: string | null = null;

async function authenticate(): Promise<string> {
  const res = await fetch(`${API_HOST}/security/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: PHIS_USER, password: PHIS_PASS }),
  });
  if (!res.ok) throw new Error(`OpenSILEX auth failed: ${res.status}`);
  const data = (await res.json()) as { result: { token: string } };
  return data.result.token;
}

export type RawItem = Record<string, unknown> & { uri: string };

// Carries the real OpenSILEX status/message through (e.g. 409 "facility still has
// relations") instead of flattening every failure to a generic 502. GET routes don't catch
// this specially — they still fall through to the outer handler's 502, unchanged — but the
// mutating routes (create/edit/delete) do, since those failures are real, expected outcomes
// a user needs to actually read (an OpenSILEX referential-integrity conflict is not a bug).
export class OpenSilexError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Shared by every verb below: token cache + retry-once-on-401 is identical regardless of
// method, so GET/POST/PUT/DELETE all funnel through this instead of each reimplementing it.
async function authedFetch(urlPath: string, init?: RequestInit): Promise<unknown> {
  if (!token) token = await authenticate();

  const fetchOnce = () =>
    fetch(`${API_HOST}${urlPath}`, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
    });

  let res = await fetchOnce();
  if (res.status === 401 || res.status === 403) {
    token = await authenticate();
    res = await fetchOnce();
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    let message = raw || `${init?.method ?? "GET"} ${urlPath} failed: ${res.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.result?.message ?? parsed?.error ?? message;
    } catch {
      // raw wasn't JSON — keep it as-is
    }
    throw new OpenSilexError(res.status, message);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function authedGet(urlPath: string): Promise<{ result: RawItem[] }> {
  return authedFetch(urlPath) as Promise<{ result: RawItem[] }>;
}

export async function authedGetOne(urlPath: string): Promise<{ result: Record<string, unknown> }> {
  return authedFetch(urlPath) as Promise<{ result: Record<string, unknown> }>;
}

export async function authedPost(urlPath: string, body: unknown): Promise<{ result: string }> {
  return authedFetch(urlPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Promise<{ result: string }>;
}

export async function authedPut(urlPath: string, body: unknown): Promise<{ result: string }> {
  return authedFetch(urlPath, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Promise<{ result: string }>;
}

export async function authedDelete(urlPath: string): Promise<void> {
  await authedFetch(urlPath, { method: "DELETE" });
}

// OpenSILEX's POST returns the created node's FULL uri (https://phis.pheno.no/id/...), while
// every list/relation GET returns it prefixed (phis:id/...). The frontend matches nodes by id,
// so a node created this session and later reached via a relation chip was two different ids —
// deleting one left the other in CATEGORY_ITEMS/selection until a reload. Compact with
// OpenSILEX's own prefix table (longest namespace wins), fetched once. Never throws: it runs
// AFTER a successful POST, and reporting failure for a node that exists invites a duplicate
// on retry — worst case the id stays uncompacted (the old behaviour) and the next try refetches.
let nameSpaces: Promise<[string, string][]> | null = null;
export async function compactUri(uri: string): Promise<string> {
  try {
    nameSpaces ??= authedGetOne("/ontology/name_space").then((r) =>
      Object.entries(r.result as Record<string, string>).sort((a, b) => b[1].length - a[1].length)
    );
    const hit = (await nameSpaces).find(([, ns]) => uri.startsWith(ns));
    return hit ? `${hit[0]}:${uri.slice(hit[1].length)}` : uri;
  } catch {
    nameSpaces = null;
    return uri;
  }
}

// Wraps a mutating route's OpenSILEX call: an OpenSilexError becomes a clean response
// carrying the real status/message; anything else re-throws for the outer 502 catch-all.
export async function respondOpenSilexErrors(
  res: import("node:http").ServerResponse,
  fn: () => Promise<void>
): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof OpenSilexError) {
      res.writeHead(err.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
      return;
    }
    throw err;
  }
}

// Test-only: the auth token is cached at module scope so tests can force re-authentication.
export function _resetAuthCacheForTests() {
  token = null;
  nameSpaces = null;
}
