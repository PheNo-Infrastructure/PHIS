// Variable groups an import asks for (a histogram's bins): matched by exact name like everything else —
// a group that exists gets the members it lacks (its record and members are kept), a missing one is created.
// Probed 2026-10-08: POST/PUT take the members as uris in `variables`; an update REPLACES the member list.
import { authedGet, authedGetOne, authedPost, authedPut, escapeRegex } from "../opensilex.ts";
import type { TrialData } from "./plugins.ts";

const enc = encodeURIComponent;
type Group = NonNullable<TrialData["variableGroups"]>[number];
export type GroupPlan = Group & { id?: string; members: string[] };

const describe = (name: string) => `The share of the pixels in each ${name.replace(/ distribution$/, "")} range, one variable per range (they add up to 100 %).`;

// Which groups exist, and which of their members they already have (uris, as PHIS has them).
export async function resolveGroups(groups: Group[]): Promise<GroupPlan[]> {
  return Promise.all(groups.map(async (g) => {
    const hit = (await authedGet(`/core/variables_group?name=${enc(escapeRegex(g.name))}&page_size=50`)).result
      .find((x) => String(x.name ?? "").toLowerCase() === g.name.toLowerCase());
    if (!hit) return { ...g, members: [] };
    const dto = (await authedGetOne(`/core/variables_group/${enc(String(hit.uri))}`)).result;
    const members = ((dto.variables as { uri: string }[] | undefined) ?? []).map((v) => String(v.uri));
    return { ...g, id: String(hit.uri), members };
  }));
}

// The group's summary for the plan: how many bins it has, and for an existing group how many it lacks.
export function groupSummary(plans: GroupPlan[], variableUri: Map<string, string>) {
  return plans.map((g) => ({
    name: g.name, variables: g.variables.length, exists: !!g.id,
    ...(g.id ? { newMembers: g.variables.filter((v) => !g.members.includes(variableUri.get(v) ?? "")).length } : {}),
  }));
}

// Writes one group (variables must exist by now); returns whether anything was written.
export async function writeGroup(g: GroupPlan, variableUri: Map<string, string>) {
  const wanted = g.variables.map((v) => variableUri.get(v)!);
  if (!g.id) {
    await authedPost("/core/variables_group", { name: g.name, description: describe(g.name), variables: wanted });
    return true;
  }
  const missing = wanted.filter((u) => !g.members.includes(u));
  if (!missing.length) return false;
  const dto = (await authedGetOne(`/core/variables_group/${enc(g.id)}`)).result;
  await authedPut("/core/variables_group", { uri: g.id, name: dto.name, description: dto.description, variables: [...g.members, ...missing] });
  return true;
}
