# The whole of GraphDB in the graph

Status 2026-11-11: built on `graph-explorer/graph-spike`, not merged, not deployed. Goal given by the owner: close the gaps between the portal and GraphDB.

## Why

PHIS is a knowledge graph underneath. The graph pane is where day-to-day PHIS work happens (linking things is already intuitive there), so a graph that holds only a subset sends people out of it whenever they work with scientific objects or variables. The graph should hold everything GraphDB holds.

## The rule

**What is in GraphDB is a node (or an edge) in the graph. What is in MongoDB is not.**

- MongoDB (`opensilex` db) holds: measured values (`data`), `location`, `provenance`, `file`, `batchHistory`, device and germplasm attributes. None of these are nodes.
- Bookkeeping individuals in GraphDB are folded into their owner instead of drawn: time instants (the end of a Move), addresses (of a site), group-membership records (a person in a group with a profile: drawn as the group's links to the account and the profile), observation collections (they tie a batch of data to its objects, which is Mongo-side data; decided without the owner, my call).
- `publisher` (who created a thing, on nearly everything) is not an edge (my call).

The same GraphDB inventory is the checklist for the whole portal: for every kind, is there a list, a page, create, link, rename, delete?

## How to re-read the facts (read-only)

GraphDB, inside the graphdb pod of the `phis-test` namespace (the prod copy): `curl -H "Accept: text/csv" --data-urlencode "query=$Q" http://localhost:7200/repositories/opensilex`, SELECT only.

- Classes per named graph: `SELECT ?g ?type (COUNT(DISTINCT ?s) AS ?n) WHERE { GRAPH ?g { ?s a ?type } } GROUP BY ?g ?type`.
- Links between kinds: put `?s ?p ?o` inside `GRAPH ?g`, and `?s a ?st . ?o a ?ot` outside it (types live in other graphs); leave out the ontology graphs and `rdf:type`.

MongoDB: the root password is in the secret `mongodb-credentials` (key `root-password`); read it into a variable, never print it; list only the `opensilex` database.

## What exists in the graph now (live phis-test: 842 nodes, 1,244 edges, built in about 7 s)

Nodes: organization 9, facility 28, site 3, experiment 4, device 10, person 5, group 2, factor 2, species 2 (used ones), **scientific object 509, variable 78, entity 5, characteristic 80, method 5, unit 11, entity of interest 7, variable group 8, event 31, annotation 3, account 10, germplasm 21 (varieties), profile 2, document 2, factor level 5**.

Links: everything the lists carry, plus object to experiment, object to germplasm / factor level / parent object (one CSV export per experiment, `POST /core/scientific_objects/export`, instead of one read per object: 532 reads took 10 s), variable to its four parts and entity of interest, variable group to variable, a factor to its unit and its levels, a device to the variables it measures and its lens (one read per device), event and annotation to what they are about, account to person and groups, group to profile, variety to species.

Code: `src/routes/graph.ts` (`SOURCES` is the list of kinds; add a kind there, in `public/graph.html` for colour, icon and name, and in `public/index.html` for `GRAPH_TYPES` and `BROWSE_KIND`).

## Portal gaps closed

- A device can be linked to the variables it measures (from a selection, listed on both pages, removed by Unlink selection) and to its lens (two devices selected: the server reads which is the lens).
- Entities, characteristics, methods, units and entities of interest can be made, renamed and deleted (PHIS keeps one a variable is made with: said before the delete). Entities of interest have a list and a page.
- Documents (imported datasets) have a read-only page.

## Left, on purpose or for the owner

- **Accounts** cannot be created, renamed or deleted here. They carry credentials and the real login is still to be decided.
- **Documents and observation collections** stay read-only / folded: they are import bookkeeping.
- **Move from/to a facility** lives in Mongo (`location`); the portal's "Stands in" keeps using it, the graph does not draw it. A device's facility edge is still drawn (from the facility's device list).
- **Variable to experiment** (which variable has data in which experiment) is Mongo-side data, so it is not an edge.
- Not deployed: merge and deploy are the owner's call (full suite first). `/api/graph` now takes about 7 s cold (cached 30 s); a rebuild after every change is the cost to watch on a big instance (objects per experiment, one read per device and per factor).
