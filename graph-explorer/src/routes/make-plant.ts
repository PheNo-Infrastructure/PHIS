import { OpenSilexError, authedGet, authedGetOne, authedPost, compactUri, escapeRegex, respondOpenSilexErrors } from "../opensilex.ts";
import { readJsonBody, type RouteHandler } from "../http.ts";

// "Make a plant here": a position (a block's slot, a pot) is the identity the import gives an object, because a file only knows where
// something stands. A real Plant is something only its scientists can name, so it is made on request: a new Plant in ONE experiment,
// part of the position there (a part-of is per experiment, and a plant can later be put under another position in another experiment,
// which is how the same plant is followed across trials). The position keeps everything it has — its measured values, germplasm and
// treatment — so charts and counts don't change; the plant starts with just its place in the hierarchy.
export const handleMakePlant: RouteHandler = async (req, res, { pathname }) => {
  if (pathname !== "/api/make-plant" || req.method !== "POST") return false;
  const body = (await readJsonBody(req)) as { position?: string; experiment?: string; name?: string };
  const name = String(body.name ?? "").trim();
  if (!body.position || !body.experiment || !name) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "needs a position, an experiment and a name for the plant" }));
    return true;
  }
  await respondOpenSilexErrors(res, async () => {
    const enc = encodeURIComponent;
    const where = (await authedGetOne(`/core/scientific_objects/${enc(body.position!)}?experiment=${enc(body.experiment!)}`)).result;
    if (/#Plant$|:Plant$/.test(String(where.rdf_type ?? ""))) throw new OpenSilexError(400, `${where.name} is a plant already; a plant is made at a position.`);
    const taken = (await authedGet(`/core/scientific_objects?experiment=${enc(body.experiment!)}&name=${enc(`^${escapeRegex(name)}$`)}&page_size=50`)).result
      .some((r) => String(r.name).toLowerCase() === name.toLowerCase());
    if (taken) throw new OpenSilexError(400, `There is already a scientific object named "${name}" in this experiment.`);
    const id = String([(await authedPost("/core/scientific_objects", {
      name, rdf_type: "vocabulary:Plant", experiment: body.experiment,
      relations: [{ property: "vocabulary:isPartOf", value: body.position, inverse: false }],
    })).result].flat()[0]);
    const out = JSON.stringify({ ok: true, plant: { id, type: "scientific_object", label: name }, position: await compactUri(body.position!) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(out);
  });
  return true;
};
