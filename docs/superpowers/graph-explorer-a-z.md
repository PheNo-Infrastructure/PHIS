# Graph Explorer — the A–Z workflow (living roadmap)

**Purpose (user, 2026-10-07):** find everything, from A to Z, that PHIS allows us to implement in the app — above all
*what can be linked* — so researchers never need PHIS's own screens. Today's session covered a lot; this file is the memory
of what is done, what is not, what we learned, and the order to continue. Keep it current: update the status table when
something ships, and rerun the generator when PHIS is upgraded.

- Facts about PHIS (every endpoint, every linkable DTO field): **`phis-api-inventory.md`**, generated — do not edit by hand.
  Refresh: `cd graph-explorer && node --experimental-strip-types --env-file=.env scripts/phis-inventory.ts`
- Design and status of the app as a whole: `specs/2026-09-21-graph-explorer-unified-design.md`.
- Other next steps (chart grid etc.): `graph-explorer-next.md`.

## Rules every A–Z item follows (so new work looks like the old)
1. **Probe first, on a throwaway** (names starting `ZZ`), on phis-test only; write the finding in the "Probed facts" list below.
2. **Same pattern as the neighbours:** `NODE_TYPES` entry (`src/node-types.ts`) for page/rename/delete/links, `CREATABLE`
   (`src/creation.js`) for "+ New", selection-first linking through `/api/link` (+ `/api/unlink`), plain-words buttons,
   a blocked action says the way forward (no dead ends), nothing destructive without its own confirm.
3. **Never default a choice that matters** (a role, a profile): the user picks, one button per option.
4. Tests: backend (stubbed PHIS) + e2e (mocked routes) + one live run on phis-test, cleaned up afterwards.
5. Update this file, the spec's status paragraph, and the project memory.

## Status by area (✔ built · ◐ partial · ✖ not built · ⛔ blocked by PHIS)

| Area (PHIS tag) | Status | Notes |
|---|---|---|
| Organizations, facilities, sites, projects, experiments | ✔ | create/rename/delete/links; visibility (is_public) on experiments |
| Scientific objects (+ per-experiment labels, parts, germplasm, factor levels) | ✔ | |
| Factors and levels | ✔ | create with levels, rename, delete |
| Germplasm | ✔ | species/variety/accession; `isPublic` set at creation |
| Variables | ◐ | create/rename/delete (name only; unit/parts never editable — PHIS would relabel values silently). Parts (entity, characteristic, method, unit) are read-only; **create parts, entity_of_interest, trait, species, match fields: ✖** |
| Variable groups (`VariablesGroup`) | ✔ 2026-10-08 | Data > Variable groups: create (alone or from selected variables), rename, delete (variables stay), link/unlink variables; a variable's page lists its groups. Facilities link to groups (facility `variableGroups`, either side; a group lists its facilities). Facility `locations` still ✖ (geo data, address-duplication bug risk) |
| Germplasm groups (`GermplasmGroup`) | ✔ 2026-10-08 | Trials > Germplasm groups: same as variable groups; a germplasm's page lists its groups |
| Data (measured values) | ◐ | import + read (tables, charts); no manual add/edit/delete of single values; confidence, raw data ✖ |
| Provenances | ✔ | page, rename, delete (blocked while values; "delete its values" separately). **prov_agent (device/person that produced the data): ✖** |
| Data files | ✖ | none in PHIS; empty-state says so |
| Documents | ✖ | none in PHIS; empty-state says so |
| Annotations (comments on anything: `targets`, `motivation`) | ✔ 2026-10-08 | "Notes" under Data: create from selected experiments/projects/organizations/sites/facilities/devices/variables/scientific objects/germplasm/variable groups (text + a kind PHIS lists, never defaulted), edit text, add/remove targets, delete; a target's page lists its notes. Not yet: provenances (no link action), events, persons as targets |
| Events (non-move: e.g. watering, observation) | ✔ 2026-10-08 | create from selected scientific objects/devices/facilities (kind from PHIS, a day, what happened), add/remove targets, delete; moves stay read-only (made by moving a device). Edit date/description/kind: ✖; start/end ranges: ✖ (instants only) |
| Areas, positions, locations (maps, plots in a greenhouse) | ✖ | `Area` (structural or event area), `Position` (x/y/z or point), facility `locations` |
| Devices | ✔ | create/rename/delete, move to a facility on a date, **person in charge (set/replace/clear)** |
| Persons | ✔ | **separate from accounts** (see facts). Create (alone or for an account), rename, link into experiments/projects in a role, link to an account (once). No delete in PHIS |
| Accounts | ◐ | **deferred: user unsure accounts/passwords belong in the portal (2026-10-08), revisit once real login is decided.** Read-only page. **Create/enable/disable/admin/password/language: ✖**; invite a researcher by email (`/security/invite`): ✖ |
| **Groups** (membership + sharing) | ✔ 2026-10-07 | create/rename/delete (confirm says who loses access), add accounts with a chosen profile, remove them, share experiments/organizations/sites/germplasm with a group (and unshare). See "Priority 1" for what is left |
| **Profiles** (credentials) | ✔ 2026-10-07 | tick-box rights editor (24 areas × see/change/delete, presets, copy from another profile, caution on access-controlling areas, Save names who is affected); create (empty or from another profile), rename, delete blocked while a group uses it. See "Priority 2" |
| Favorites (per user) | ✖ | low value |
| Ontology (classes/properties/RDF types, `Ontology`, `Vue.js - Ontology extension`) | ✖ | 25+9 endpoints; would let users add device/object classes. Large |
| Species, Metrics, System, UriSearch | ✖ | read-only helpers |
| BRAPI, Faidare, Staple, Agroportal | — | external/standard APIs, not editing |
| The 2 Holt sites with an `address` | ⛔ | OpenSILEX bug: a PUT duplicates the location and breaks the whole Sites list |

## Priority 1 — Groups: membership and sharing (user asked 2026-10-07) — BUILT, notes kept for reference
What PHIS has (probed read-only, phis-test): two groups — *Researchers* (4 members, all with "Researcher profile") and *Users*
(admin, guest with "Default profile"). A group = name + description + `user_profiles`, a list of **(account, profile)** pairs
(`GroupDTO.user_profiles[]` = `{user_uri, profile_uri}`). Endpoints: `GET/POST/PUT /security/groups`, `GET/DELETE /security/groups/{uri}`.

To build (same selection-first pattern):
- **Create/rename/delete a group** (`+ New group`: name + description required).
- **Add accounts to a group with a profile**: select group + account(s) → one button per profile
  ("Add Thomas to Researchers as Researcher profile"); never default the profile. Unlink = remove the pair.
  Change a member's profile = remove + add (or PUT with the new pair).
- **Share things with a group** (`groups` field on **experiments, organizations, sites, germplasm**): select the thing + group →
  "Share Trial with Researchers"; unlink = stop sharing. This is how non-admin users see experiments (see the "visibility" notes).
- Group page: members with their profile, and what is shared with it (exists, read-only today).
- **Probed and built (2026-10-07):** a group's `user_profiles` is REPLACED as a whole by every update (leave it out and everyone is removed — the app always
  sends the full list); one account can hold two profiles in a group (two pairs); a group can be created without members; deleting a group is allowed while it
  has members/shared things and removes the sharing (confirm says so). Sharing = the `groups` field of experiments/organizations/sites/germplasm ("Shared with").
- Still open here: sharing from the account side (account page chips), "copy members from another group", showing a person's effective access (account → groups → profile → credentials).
- **Performance rule learned the hard way:** the group page must scan experiments/organizations/sites/germplasm (no server-side `groups` filter exists in PHIS).
  Doing that five times at once got phis-test's OpenSILEX pod OOMKilled (2 GiB limit). Scans are now one per page view, sequential, cached 4 s. Never fan out
  parallel full-record reads; check `kubectl get pods -n phis-test` after any new heavy page.

## Priority 2 — Profiles: credentials (user: "setting the credentials in PHIS is extremely tedious") — BUILT, notes kept for reference
What PHIS has: two profiles — *Default profile* (0 credentials) and *Researcher profile* (59). A profile = name + `credentials[]`
(strings like `account-access`). The catalogue `GET /security/credentials` returns 24 groups
(`{group_id, group_key_name, credentials:[{id, name}]}`, e.g. Accounts: `account-modification`, `account-access`).
Endpoints: `GET/POST/PUT /security/profiles`, `GET /security/profiles/all`, `GET/DELETE /security/profiles/{uri}`.

To build:
- **Profile page that shows credentials grouped by the catalogue**, in plain words (the catalogue names are keys like
  `credential.default.modification` → translate to "can edit" / "can view"; keep PHIS's ids visible on hover).
- **Edit credentials fast**: tick per group (all / view only / none), a search box, and **"copy from another profile"**
  (start a new profile from Researcher profile) — the tedious part today.
- **Create / rename / delete a profile** (delete blocked while a group uses it — probe the exact rule).
- **Show what a profile lets a person do** ("Researcher profile: can edit experiments, can view devices, …") and, on an
  account page, the effective rights through its groups.
- **Probed and built (2026-10-07):** create works without a uri (made from the name); an update REPLACES the whole `credentials` list and an empty list is accepted;
  PHIS accepts unknown right ids silently (the app only lets catalogue ids through, plus ones the profile already has — "dataverse-modification" is on Researcher but not in the catalogue);
  deleting a profile that groups use is allowed by PHIS and silently REMOVES those members from the groups — the app blocks it and explains. Rights are regular: `<area>-access|modification|delete`.
- **Security finding to raise with the user:** the *Researcher profile* holds ALL 59 rights, including changing profiles, groups, accounts and users — so every researcher can edit everyone's access
  (and delete them). The *Default profile* has none. The editor tags those four areas "controls access". A sensible next step is a narrower profile (e.g. "Contributor": see + change data areas, nothing under accounts/users/groups/profiles) made by copying Researcher and unticking — the user decides.
- Still open: show an account's effective rights (account → groups → profiles → rights); "which profile can do X" search.

## Priority 3 — Accounts (credentials of people) — DEFERRED 2026-10-08
User: "very unsure this should even be in the portal". Not built until login is decided; nothing below is started.
Create an account (email, password, admin, enable, language, linked person), enable/disable, admin flag, reset password,
`/security/invite` (invite a researcher by email — admin only), `/security/register` flow. Safety: the Guest account on
phis-test has `admin=true` (flagged, not acted on). Passwords never travel through this app's logs/pages — design this one with the user.

## Priority 4 — Collections and richer links
Variable groups, germplasm groups, facility `variableGroups` and `locations`, `entity_of_interest`/`trait`/`species` on variables,
creating variable parts, provenance `prov_agent`, annotations on anything, non-move events, areas/positions, manual data values.
Order by what researchers ask for; each is small once the pattern is known.

## Probed facts that shape the work (all on phis-test, 2026-10-07 unless dated)
- **Variable/germplasm groups (2026-10-08)**: `variables_group` holds `variables` (objects on GET, uris on POST/PUT); `germplasm_group` GET only says `germplasm_count` — members come from `GET .../{uri}/germplasm` (paged) and go back as `germplasm_list`. An update REPLACES the list in both. The germplasm-group list is a POST search (`/core/germplasm_group/search`, filters `name`, `germplasm`); variables groups filter by `variableUri`. Deleting a group leaves members alone.
- **Persons and accounts are separate records.** A signed-up (Feide) user has an **account only**; a person must be created for
  them (the app does it: select the account → + New person). 3 of 6 accounts on phis-test had no person.
- **Persons cannot be deleted** (no endpoint; DELETE answers 405). A person's **account link is set once**: leaving `account`
  out of a later update does not clear it; deleting the account does. (ZZ Ties is a leftover test person; GraphDB cleanup deferred, user: not important on test.)
- **Variables**: renaming keeps the uri; PHIS lets unit/entity change even with values stored (silently relabels) → never offered; delete refused while values exist.
- **Provenances**: rename keeps uri and values; delete refused while values exist; `DELETE /core/data?provenance=` removes exactly that provenance's values.
- **Devices**: `person_in_charge` is a single uri; set/replace by PUT, clear by leaving it out of the PUT.
- **Experiments'/projects' people are bare uri strings, one field per role** (`scientific_supervisors`, `technical_supervisors`;
  `coordinators`, `scientific_contacts`, `administrative_contacts`) — the user always picks the role.
- Names in PHIS lists are not unique keys (a repeated name gets a `/N` uri suffix); `POST /core/data` is all-or-nothing;
  OpenSILEX makes uris from names (see the spec's probe facts).

## Open questions for the user (before any PROD import / change)
- Variable naming, the Unitless unit, reusing PHIS's existing Height/NDVI characteristics.
- Guest account `admin=true` on phis-test (likely prod too).
- Rename the long PBar1x4 provenance (possible in the app now; ask first).
- Which profile should a newly created group member get by default? (App will not default — decide if it should.)
