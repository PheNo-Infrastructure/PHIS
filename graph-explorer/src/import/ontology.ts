// Terms the import adds to an instance's ontology when it lacks them — API only, so it works on any
// PHIS. They live under pheno.no (not OpenSILEX's `vocabulary:`), the same uri on every instance, so
// data keeps its meaning when it moves between test and prod. Probed on phis-test 2026-10-02.
import { OpenSilexError, authedGetOne, authedPost } from "../opensilex.ts";

const enc = encodeURIComponent;
export const TRAY = "https://phis.pheno.no/vocabulary#Tray";
export const POSITION_IN_TRAY = "https://phis.pheno.no/vocabulary#positionInTray";

// OpenSILEX answers a missing class or property with a 500 "... URI not found".
const exists = async (url: string) => {
  try { await authedGetOne(url); return true; }
  catch (err) { if (err instanceof OpenSilexError && /not found/i.test(err.message)) return false; throw err; }
};
const plantHasPosition = async () => {
  const r = (await authedGetOne(`/vuejs/owl_extension/rdf_type_properties?rdf_type=${enc("vocabulary:Plant")}&parent_type=${enc("vocabulary:ScientificObject")}`)).result as { data_properties?: { uri: string }[] };
  return (r.data_properties ?? []).some((p) => p.uri === POSITION_IN_TRAY);
};

type Term = { uri: string; label: string; present: () => Promise<boolean>; add: () => Promise<void> };
const TERMS: Term[] = [
  {
    uri: TRAY,
    label: "the object type Tray",
    present: () => exists(`/ontology/rdf_type?rdf_type=${enc(TRAY)}`),
    add: async () => {
      await authedPost("/vuejs/owl_extension/rdf_type", {
        uri: TRAY, name: "Tray", parent: "vocabulary:ScientificObject",
        name_translations: { en: "Tray" }, comment_translations: { en: "A tray holding several plants; a scanner images the whole tray at once." },
      });
    },
  },
  {
    uri: POSITION_IN_TRAY,
    label: "the plant property Position in tray",
    present: plantHasPosition,
    // The property, then the restriction that lets plants carry it (without it OpenSILEX refuses the value).
    add: async () => {
      if (!(await exists(`/ontology/property?uri=${enc(POSITION_IN_TRAY)}&rdf_type=${enc("owl:DatatypeProperty")}`))) {
        await authedPost("/ontology/property", {
          uri: POSITION_IN_TRAY, rdf_type: "owl:DatatypeProperty", domain: "vocabulary:ScientificObject", range: "xsd:integer",
          name_translations: { en: "Position in tray" }, comment_translations: { en: "The plant's place in its tray (the column), counted from 1." },
        });
      }
      await authedPost("/ontology/rdf_type_property_restriction", { rdf_type: "vocabulary:Plant", domain: "vocabulary:ScientificObject", property: POSITION_IN_TRAY, required: false, list: false });
    },
  },
];

// The terms among `uris` this instance lacks, in the order they must be added.
export async function missingTerms(uris: Set<string>) {
  const wanted = TERMS.filter((t) => uris.has(t.uri));
  const present = await Promise.all(wanted.map((t) => t.present()));
  return wanted.filter((_, i) => !present[i]).map(({ uri, label }) => ({ uri, label }));
}
export async function addTerm(uri: string) {
  await TERMS.find((t) => t.uri === uri)!.add();
}
