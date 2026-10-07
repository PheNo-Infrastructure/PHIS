/* What each type can create/link to. Grounded directly in the real OpenSILEX Creation/Detail
   DTO fields (checked against the live swagger.json at phis.pheno.no/rest/swagger.json), not
   guessed:
     OrganizationCreationDTO:  parents, facilities
     FacilityCreationDTO:      organizations, sites
     SiteCreationDTO:          organizations, facilities
     ExperimentCreationDTO:    organisations, facilities, projects, scientific_supervisors,
                                technical_supervisors, factors  (+ ScientificObject via its own "experiment" field)
     ProjectGetDTO:            related_projects, coordinators, scientific_contacts, administrative_contacts
     ScientificObjectCreationDTO/DetailDTO: experiment, parent (self), factor_level, relations (incl. hasGermplasm)
     GermplasmCreationDTO:     species, variety, accession (all self: other Germplasm)
     VariableCreationDTO:      entity, entity_of_interest, characteristic, method, unit
     FactorCreationDTO:        experiment (levels are nested, not independently browsable)
     DeviceGetDTO:             person_in_charge (+ facility via the /core/devices?facility filter)
     ProvenanceCreationDTO:    prov_agent (Device or Person, generically)
     EventCreationDTO:         targets (generic URIs — scientific_object/device/facility in practice)
     DataFileGetDTO:           target (generic URI), provenance
   Document is deliberately left out: its "targets" field is untyped/any-URI, so there's no
   real basis for a specific suggested type — better to omit than guess. Same reasoning for
   why "person" doesn't get its own entry here: nothing in the DTOs above treats a Person as
   a thing you create *other* things from.

   This file is plain JS (no TS syntax) and has no DOM/Node dependency, deliberately: it's
   served as-is to the browser (as a <script src>) AND imported directly by the Node backend
   and its tests, so the adjacency rule exists in exactly one place instead of two copies that
   can silently drift out of sync. */

/* Who may be linked to an experiment or a project, and in WHICH role (the DTO field). Each role is its own
   field, so a person is never linked without the user saying which — the app never defaults one. */
export const PERSON_ROLES = {
  experiment: [
    { field: "scientific_supervisors", label: "scientific supervisor" },
    { field: "technical_supervisors", label: "technical supervisor" },
  ],
  project: [
    { field: "coordinators", label: "coordinator" },
    { field: "scientific_contacts", label: "scientific contact" },
    { field: "administrative_contacts", label: "administrative contact" },
  ],
};

export const ADJACENT = {
  // site/experiment: their CreationDTOs own the link (organizations / organisations+facilities),
  // not the org/facility — but creatableTypesFor only reads the SELECTED type's list, so they
  // have to be listed here too to be offered from an org or facility.
  organization: ["facility", "organization", "site", "experiment", "group"],
  facility: ["organization", "site", "experiment", "device"],
  site: ["organization", "facility", "group"],
  experiment: ["organization", "facility", "project", "person", "factor", "scientific_object", "group"],
  project: ["experiment", "project", "person"],
  scientific_object: ["experiment", "scientific_object", "germplasm", "factor"],
  germplasm: ["scientific_object", "germplasm", "group"],
  variable: ["entity", "entity_of_interest", "characteristic", "method", "unit"],
  factor: ["experiment", "factor_level"],
  device: ["facility", "person"],
  provenance: ["device", "person"],
  // A signed-up account has no person until one is made for it (+ New person), or linked (Link selection).
  account: ["person", "group"],
  // Sharing: a group is what an experiment, organization, site or germplasm is shared with; its members are accounts.
  group: ["experiment", "organization", "site", "germplasm", "account"],
  event: ["scientific_object", "device", "facility"],
  data_file: ["scientific_object", "device", "provenance"],
};

/* Intersection, not union: a single new node gets linked to EVERY given type at once, so its
   type must be a valid adjacency target for all of them simultaneously — offering a type
   that's only adjacent to some of them would suggest a create-and-link that fails for the
   rest. One type given still degenerates to that type's own adjacency list.

   Direction-agnostic by design: the manual UI calls this to DISCOVER valid target types from
   a set of selected anchors. A future autonomous/file-import path would call the exact same
   function to VALIDATE a plugin-declared target type against a row's resolved anchors — that's
   just `creatableTypesFor(anchorTypes).has(targetType)`, not a different rule. */
export function creatableTypesFor(types) {
  let result = null;
  types.forEach((t) => {
    const adj = new Set(ADJACENT[t] || []);
    result = result === null ? adj : new Set([...result].filter((x) => adj.has(x)));
  });
  return result || new Set();
}
