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
    fields: [{ key: "rdf_type", label: "Type", input: "select", options: "api/scientific-object-types", required: true }],
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
  // A factor belongs to exactly one experiment (requiresLink + onlyOne) and is created with its
  // levels: input "lines" = one per line, sent as [{name}], at least one.
  factor: {
    url: "/core/experiments/factors",
    requiresLink: "experiment",
    onlyOne: "experiment",
    linkFields: { experiment: "experiment" },
    scalarLinkFields: ["experiment"],
    fields: [{ key: "levels", label: "Levels (one per line)", input: "lines", required: true }],
  },
  // Germplasm from the Germplasm list: a species, or a variety/accession under a species. The
  // backend (NODE_TYPES.germplasm.create) refuses a variety/accession without one and makes it
  // public. options: a list endpoint, or the choices themselves.
  germplasm: {
    url: "/core/germplasm",
    linkFields: {},
    fields: [
      { key: "rdf_type", label: "Type", input: "select", required: true, options: [
        { id: "vocabulary:Species", label: "Species" },
        { id: "vocabulary:Variety", label: "Variety" },
        { id: "vocabulary:Accession", label: "Accession" },
      ] },
      { key: "species", label: "Species (for a variety or accession)", input: "select", options: "api/germplasm-species" },
    ],
  },
  // A device: its type from OpenSILEX's device classes; from a selected facility it is moved
  // there today (NODE_TYPES.device.create). A taken name is refused.
  device: {
    url: "/core/devices",
    linkFields: { facility: "facility" },
    scalarLinkFields: ["facility"],
    fields: [
      { key: "rdf_type", label: "Type", input: "select", options: "api/device-types", required: true },
      { key: "brand", label: "Brand" },
      { key: "constructor_model", label: "Model" },
      { key: "serial_number", label: "Serial number" },
    ],
  },
  // A variable: what is measured, made of four existing parts (each its own resource, picked from
  // OpenSILEX's lists). The backend (NODE_TYPES.variable.create) adds the datatype (decimal numbers)
  // and refuses a taken name. Its unit and parts can't be changed afterwards.
  variable: {
    url: "/core/variables",
    linkFields: {},
    fields: [
      { key: "entity", label: "Entity (what is measured)", input: "select", options: "api/variable-entities", required: true },
      { key: "characteristic", label: "Characteristic", input: "select", options: "api/variable-characteristics", required: true },
      { key: "method", label: "Method", input: "select", options: "api/variable-methods", required: true },
      { key: "unit", label: "Unit", input: "select", options: "api/variable-units", required: true },
      { key: "description", label: "Description" },
    ],
  },
  // A person: the record experiments and projects point at (an account alone, e.g. someone who signed up, is NOT a
  // person). `name` is the first name. From a selected account the person is made for that account (the account's
  // email is used when none is typed). PHIS has no delete for persons. Never created from an experiment or project:
  // those need a role, so the person is made first and added with "Add … as …".
  person: {
    url: "/security/persons",
    nameLabel: "First name",
    // fromOnly: the only selected types it may be created from; fromOnlyWhy: what to do instead (greyed in "+ New").
    fromOnly: ["account"],
    fromOnlyWhy: "Make the person first, then select them with the experiment or project and use \"Add … as …\".",
    linkFields: { account: "account" },
    scalarLinkFields: ["account"],
    fields: [
      { key: "last_name", label: "Last name", required: true },
      { key: "email", label: "Email, unless it is the account's" },
      { key: "affiliation", label: "Affiliation" },
    ],
  },
  // A group of accounts (members come afterwards, each with a profile): name + description. Created alone, or from a
  // selected experiment, organization, site or germplasm — which is then shared with it.
  group: {
    url: "/security/groups",
    linkFields: {},
    fields: [{ key: "description", label: "Description", required: true }],
  },
  // A named set of variables / of germplasm: a name and a description, created alone or from a selection of its members.
  variable_group: {
    url: "/core/variables_group",
    linkFields: { variable: "variables" },
    fields: [{ key: "description", label: "Description" }],
  },
  germplasm_group: {
    url: "/core/germplasm_group",
    linkFields: { germplasm: "germplasm_list" },
    fields: [{ key: "description", label: "Description" }],
  },
  // An event (watering, sowing, calibration…): made about the selected things (scientific objects, devices, facilities), on a
  // day, of a kind PHIS lists. The "name" is what happened (the event's description). Moves are not made here: a device moves.
  event: {
    url: "/core/events",
    nameLabel: "What happened",
    linkFields: { scientific_object: "targets", device: "targets", facility: "targets" },
    fields: [
      { key: "rdf_type", label: "Kind of event", input: "select", options: "api/event-types", required: true },
      { key: "date", label: "Date", input: "date", required: true },
    ],
  },
  // A note about the selected things (any kind). The "name" is the note's text; the kind of note (PHIS's "motivation") is picked, never defaulted.
  annotation: {
    url: "/core/annotations",
    nameLabel: "Note",
    linkFields: Object.fromEntries(["experiment", "project", "organization", "site", "facility", "device", "variable", "scientific_object", "germplasm", "provenance", "variable_group"].map((t) => [t, "targets"])),
    fields: [{ key: "motivation", label: "Kind of note", input: "select", options: "api/motivations", required: true }],
  },
  // A profile: a name, optionally starting from another profile's rights; the rights themselves are ticked on its page.
  profile: {
    url: "/security/profiles",
    linkFields: {},
    fields: [{ key: "copy_from", label: "Start from the rights of", input: "select", options: "api/profiles" }],
  },
  // One more level of one factor: no POST of its own — the backend saves the factor with the
  // level added (NODE_TYPES.factor_level.create). Not a browsable category, so only + New from
  // a selected factor reaches it.
  factor_level: {
    requiresLink: "factor",
    onlyOne: "factor",
    linkFields: { factor: "factor" },
    scalarLinkFields: ["factor"],
  },
};
