/* Per-type creation config: which OpenSILEX endpoint to POST to, and which CreationDTO field
   receives the linked URIs for each adjacent anchor type. Grounded in the live swagger.json
   DTOs (same source as adjacency.js's ADJACENT comment).

   Deliberately data-driven and keyed by type, not an if/else per type in the backend: adding
   the next type is "add one entry here", not a new code path. Two entries exist so far
   (facility, organization) — the rest of ADJACENT's types are NOT implemented yet; their DTOs
   need fields beyond a name + link (e.g. ExperimentCreationDTO needs objective/start_date),
   which is a bigger step than this one.

   Every entry here is also creatable with NO links at all (see /api/create's handling of an
   empty `links` array) — clusters have to start somewhere, and OrganizationCreationDTO in
   particular has real root instances in production data (a top-level org has no parent).
   Minimizing orphans doesn't mean every node needs a relation at birth, just that linking
   should stay easy once there's something real to link to.

   Plain JS, no DOM/Node dependency, served both inlined into the page (like adjacency.js) and
   imported directly by the Node backend — one file, one source of truth for what creation
   actually needs. */

export const CREATABLE = {
  facility: {
    url: "/core/facilities",
    linkFields: { organization: "organizations", site: "sites" },
  },
  organization: {
    url: "/core/organisations",
    linkFields: { organization: "parents", facility: "facilities" },
  },
  // fields: values a CreationDTO requires beyond name + links — the frontend shows a small form
  // for them instead of a bare name prompt, and /api/create passes through only these keys.
  // Projects/supervisors aren't linkable yet (project isn't a wired type; persons are bare
  // ORCIDs) — /api/create refuses such a link instead of dropping it.
  experiment: {
    url: "/core/experiments",
    linkFields: { organization: "organisations", facility: "facilities", project: "projects" },
    fields: [
      { key: "objective", label: "Objective", required: true },
      { key: "start_date", label: "Start date", input: "date", required: true },
      { key: "end_date", label: "End date", input: "date" },
    ],
  },
  // scalarLinkFields: link fields that hold ONE id per POST, not a list. Several selected (a
  // scientific object in several experiments) = the first POST creates it, then each extra one
  // is linked like /api/link does (a copy with the SAME uri in that experiment) — OpenSILEX keeps
  // one copy per experiment (probed live). No experiment at all = a "global" object. The type is a required ontology class,
  // picked from OpenSILEX's own list (options = a list endpoint returning {id, label}).
  scientific_object: {
    url: "/core/scientific_objects",
    linkFields: { experiment: "experiment" },
    scalarLinkFields: ["experiment"],
    fields: [{ key: "rdf_type", label: "Type", input: "select", options: "/api/scientific-object-types", required: true }],
  },
  // No linkFields: a project's links are all held by the other side (each experiment's
  // `projects`), so /api/create links them right after the POST, like /api/link would.
  project: {
    url: "/core/projects",
    linkFields: {},
    fields: [
      { key: "start_date", label: "Start date", input: "date", required: true },
      { key: "end_date", label: "End date", input: "date" },
    ],
  },
  // requiresLink: OpenSILEX refuses a site with no organization ("A site must be attached to at
  // least one organization"), so the standalone "+ New site" asks for orgs first instead of
  // POSTing something that can only fail. The exception to "everything here is creatable alone".
  site: {
    url: "/core/sites",
    requiresLink: "organization",
    linkFields: { organization: "organizations", facility: "facilities" },
  },
};
