// Terms the import adds to an instance's ontology when it lacks them — API only, so it works on any
// PHIS. They live under pheno.no (not OpenSILEX's `vocabulary:`), the same uri on every instance, so
// data keeps its meaning when it moves between test and prod. Probed on phis-test 2026-10-02.
import { OpenSilexError, authedGetOne, authedPost } from "../opensilex.ts";

const enc = encodeURIComponent;
export const BLOCK = "https://phis.pheno.no/vocabulary#Block";
export const POSITION_IN_BLOCK = "https://phis.pheno.no/vocabulary#positionInBlock";

// OpenSILEX answers a missing class or property with a 500 "... URI not found".
const exists = async (url: string) => {
  try { await authedGetOne(url); return true; }
  catch (err) { if (err instanceof OpenSilexError && /not found/i.test(err.message)) return false; throw err; }
};
const positionExists = () => exists(`/ontology/property?uri=${enc(POSITION_IN_BLOCK)}&rdf_type=${enc("owl:DatatypeProperty")}`);
const plantHasPosition = async () => {
  try {
    const r = (await authedGetOne(`/vuejs/owl_extension/rdf_type_properties?rdf_type=${enc("vocabulary:Plant")}&parent_type=${enc("vocabulary:ScientificObject")}`)).result as { data_properties?: { uri: string }[] };
    return (r.data_properties ?? []).some((p) => p.uri === POSITION_IN_BLOCK);
  } catch (err) {
    // OpenSILEX 1.5.4.7 answers this read with a 500 for EVERY class once two custom classes exist (each gets a Vue ClassExtension node and its
    // lookup expects one; seen on phis-test with Tray + Block, fixed by removing Tray). So: never create a second custom class. The property
    // itself can still be read, so that decides (the restriction is added together with it).
    if (err instanceof OpenSilexError && /Multiple objects/i.test(err.message)) return positionExists();
    throw err;
  }
};

type Term = { uri: string; label: string; present: () => Promise<boolean>; add: () => Promise<void> };
const TERMS: Term[] = [
  {
    uri: BLOCK,
    label: "the object type Block",
    present: () => exists(`/ontology/rdf_type?rdf_type=${enc(BLOCK)}`),
    add: async () => {
      await authedPost("/vuejs/owl_extension/rdf_type", {
        uri: BLOCK, name: "Block", parent: "vocabulary:ScientificObject",
        name_translations: { en: "Block" }, comment_translations: { en: "A block of plants; a scanner images the whole block at once." },
      });
    },
  },
  {
    uri: POSITION_IN_BLOCK,
    label: "the plant property Column in block",
    present: plantHasPosition,
    // The property, then the restriction that lets plants carry it (without it OpenSILEX refuses the value).
    add: async () => {
      if (!(await positionExists())) {
        await authedPost("/ontology/property", {
          uri: POSITION_IN_BLOCK, rdf_type: "owl:DatatypeProperty", domain: "vocabulary:ScientificObject", range: "xsd:integer",
          name_translations: { en: "Column in block" }, comment_translations: { en: "The plant's column in its block, counted from 1." },
        });
      }
      await authedPost("/ontology/rdf_type_property_restriction", { rdf_type: "vocabulary:Plant", domain: "vocabulary:ScientificObject", property: POSITION_IN_BLOCK, required: false, list: false });
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
