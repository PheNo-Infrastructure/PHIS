// A profile's rights ("credentials"), shaped for a tick-box editor: PHIS has a catalogue of 24 areas (accounts, data, devices…),
// each with up to three rights (see / change / delete), and a profile is just the list of right ids it holds. Probed 2026-10-07:
// an update REPLACES the whole list (an empty list is accepted), and PHIS accepts unknown ids silently — so this route only lets
// through ids from the catalogue (or ones the profile already has, e.g. "dataverse-modification", which the catalogue lacks).
import { authedGet, authedGetOne, authedPut, compactUri, respondOpenSilexErrors, OpenSilexError } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";

type Right = { id: string; kind: "access" | "modification" | "delete" | "other"; label: string };
type Area = { key: string; label: string; rights: Right[]; controlsAccess?: true };

// Areas whose "change/delete" lets someone change who may do what — shown with a caution, never hidden.
const CONTROLS_ACCESS = new Set(["accounts", "users", "groups", "profiles"]);
const kindOf = (id: string): Right["kind"] => (id.endsWith("-access") ? "access" : id.endsWith("-modification") ? "modification" : id.endsWith("-delete") ? "delete" : "other");
const LABEL: Record<Right["kind"], string> = { access: "See", modification: "Change", delete: "Delete", other: "" };

export function shapeCatalogue(raw: unknown): Area[] {
  const groups = Object.values((raw ?? {}) as Record<string, { group_id?: string; group_key_name?: string; credentials?: { id: string; name?: string }[] }>);
  return groups.map((g) => {
    const key = String(g.group_key_name ?? g.group_id ?? "").replace(/^credential-groups\./, "");
    return {
      key,
      label: String(g.group_id ?? key).replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()),
      rights: (g.credentials ?? []).map((c) => ({ id: c.id, kind: kindOf(c.id), label: LABEL[kindOf(c.id)] || String(c.name ?? c.id) })),
      ...(CONTROLS_ACCESS.has(key) ? { controlsAccess: true as const } : {}),
    };
  });
}

async function rightsOf(profileId: string) {
  const profile = (await authedGetOne(`/security/profiles/${encodeURIComponent(profileId)}`)).result;
  const areas = shapeCatalogue((await authedGetOne("/security/credentials")).result);
  const credentials = ((profile.credentials ?? []) as string[]).slice().sort();
  const known = new Set(areas.flatMap((a) => a.rights.map((r) => r.id)));
  // Who holds this profile: the groups whose members have it, and how many accounts that is.
  const key = await compactUri(profileId);
  const usedBy: { id: string; label: string; members: number }[] = [];
  for (const g of (await authedGet("/security/groups?page_size=500")).result) {
    const ups = (g.user_profiles ?? []) as { user_uri: string; profile_uri: string }[];
    const mine = [];
    for (const u of ups) if ((await compactUri(u.profile_uri)) === key) mine.push(u.user_uri);
    if (mine.length) usedBy.push({ id: String(g.uri), label: String(g.name ?? g.uri), members: new Set(mine).size });
  }
  return { id: String(profile.uri), name: String(profile.name ?? ""), areas, credentials, extra: credentials.filter((c) => !known.has(c)), usedBy };
}

export const handleProfileRights: RouteHandler = async (req, res, { pathname, searchParams }) => {
  if (pathname !== "/api/profile-rights") return false;
  const send = (status: number, body: unknown) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
  if (req.method === "GET") {
    const id = searchParams.get("profile");
    if (!id) { send(400, { error: "profile is required" }); return true; }
    await respondOpenSilexErrors(res, async () => send(200, await rightsOf(id)));
    return true;
  }
  if (req.method === "PUT") {
    const body = (await readJsonBody(req)) as { profile?: string; credentials?: unknown };
    if (!body.profile || !Array.isArray(body.credentials) || body.credentials.some((c) => typeof c !== "string")) { send(400, { error: "profile and credentials (a list of ids) are required" }); return true; }
    await respondOpenSilexErrors(res, async () => {
      const current = await rightsOf(body.profile!);
      const allowed = new Set([...current.areas.flatMap((a) => a.rights.map((r) => r.id)), ...current.credentials]);
      const unknown = (body.credentials as string[]).filter((c) => !allowed.has(c));
      if (unknown.length) throw new OpenSilexError(400, `Not a right PHIS knows: ${unknown.join(", ")}.`);
      const dto = (await authedGetOne(`/security/profiles/${encodeURIComponent(body.profile!)}`)).result;
      await authedPut("/security/profiles", { uri: dto.uri, name: dto.name, credentials: [...new Set(body.credentials as string[])] });
      send(200, await rightsOf(body.profile!));
    });
    return true;
  }
  return false;
};
