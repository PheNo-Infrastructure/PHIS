# Vendored scripts for the graph view

Copied unchanged so the portal loads nothing from a public CDN for the graph (no third party can change what runs here).
All three are MIT licensed.

| File | Package | Version | Source |
|---|---|---|---|
| graphology.umd.min.js | graphology | 0.25.4 | https://cdnjs.cloudflare.com/ajax/libs/graphology/0.25.4/graphology.umd.min.js |
| graphology-library.min.js | graphology-library (ForceAtlas2 etc.) | 0.8.0 | https://cdn.jsdelivr.net/npm/graphology-library@0.8.0/dist/graphology-library.min.js |
| sigma.min.js | sigma | 2.4.0 | https://cdnjs.cloudflare.com/ajax/libs/sigma.js/2.4.0/sigma.min.js |

To upgrade: download the new file from the same place, replace it here, update this table, and run the graph tests.
