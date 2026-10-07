# PHIS API inventory

Generated 2026-10-07 from http://20.23.34.101/rest/swagger.json (OpenSILEX 1.5.4.7) by `graph-explorer/scripts/phis-inventory.ts`.
Do not edit by hand — rerun the script. What the app does about each area, and why, is in `graph-explorer-a-z.md`.

## Areas and endpoints

### Agroportal API (3)

- `GET /core/agroportal/ontologies` — Get ontologies from agroportal
- `GET /core/agroportal/ping` — Ping agroportal server
- `GET /core/agroportal/search` — Search through agroportal

### Annotations (7)

- `GET /core/annotations` — Search annotations
- `POST /core/annotations` — Create an annotation
- `PUT /core/annotations` — Update an annotation
- `DELETE /core/annotations/{uri}` — Delete an annotation
- `GET /core/annotations/{uri}` — Get an annotation
- `GET /core/annotations/count` — Count annotations
- `GET /core/annotations/motivations` — Search motivations

### Area (6)

- `POST /core/area` — Add an area
- `PUT /core/area` — Update an area
- `DELETE /core/area/{uri}` — Delete an area
- `GET /core/area/{uri}` — Get an area
- `POST /core/area/export_geospatial` — Export a given list of areas URIs to shapefile
- `POST /core/area/intersects` — Get area whose geometry corresponds to the Intersections

### Authentication (12)

- `GET /security/accept-invite` — Accept a researcher invite via email link
- `POST /security/authenticate` — Authenticate a user and return an access token
- `GET /security/confirm-registration` — Confirm account registration via email token
- `GET /security/credentials` — Get list of existing credentials indexed by Swagger @API concepts in the application
- `POST /security/forgot-password` — Send an e-mail confirmation
- `POST /security/invite` — Invite a researcher by email (admin only)
- `DELETE /security/logout` — Logout by discarding a user token
- `GET /security/openid` — Authenticate a user and return an access token
- `POST /security/register` — Register a new account — sends a confirmation email
- `PUT /security/renew-password` — Update user password
- `PUT /security/renew-token` — Send back a new token if the provided one is still valid
- `GET /security/saml` — Authenticate a user and return an access token from SAML response

### BRAPI (10)

- `GET /brapi/v1/calls` — Check the available BrAPI calls
- `GET /brapi/v1/germplasm` — Submit a search request for germplasm (type accession in OpenSILEX
- `GET /brapi/v1/studies` — Retrieve studies information
- `GET /brapi/v1/studies-search` — Retrieve studies information
- `GET /brapi/v1/studies/{studyDbId}` — Retrieve study details
- `GET /brapi/v1/studies/{studyDbId}/observations` — Get the observations associated to a specific study
- `GET /brapi/v1/studies/{studyDbId}/observationunits` — List all the observation units measured in the study.
- `GET /brapi/v1/studies/{studyDbId}/observationvariables` — List all the observation variables measured in the study.
- `GET /brapi/v1/variables` — BrAPIv1CallDTO to retrieve a list of observationVariables available in the system
- `GET /brapi/v1/variables/{observationVariableDbId}` — Retrieve variable details by id

### Data (44)

- `DELETE /core/data` — Delete data on criteria
- `GET /core/data` — Search data
- `POST /core/data` — Add data
- `PUT /core/data` — Update data
- `DELETE /core/data/{uri}` — Delete data
- `GET /core/data/{uri}` — Get data
- `PUT /core/data/{uri}/confidence` — Update confidence index
- `GET /core/data/batch_history` — Search data batch history
- `DELETE /core/data/batch_history/{uri}` — Delete batch history by URI
- `GET /core/data/batch_history/{uri}` — Get batch
- `POST /core/data/by_targets` — Search data for a large list of targets
- `POST /core/data/count` — Count data
- `GET /core/data/data_serie/facility` — Get all data series associated with a facility
- `GET /core/data/export` — Export data
- `POST /core/data/export` — Export data
- `POST /core/data/import` — Import a CSV file for the given provenanceURI
- `POST /core/data/import_validation` — Import a CSV file for the given provenanceURI.
- `GET /core/data/mathematicalOperators` — Get mathematical operators
- `GET /core/data/provenances` — Search provenances linked to data
- `POST /core/data/provenances/by_targets` — Search provenances linked to data for a large list of targets
- `POST /core/data/search` — Search data for a large list of targets
- `GET /core/data/variables` — Get variables linked to data
- `GET /core/datafiles` — Search data files
- `POST /core/datafiles` — Add a data file
- `DELETE /core/datafiles/{uri}` — Delete a datafile
- `GET /core/datafiles/{uri}` — Get a data file
- `GET /core/datafiles/{uri}/description` — Get a data file description
- `GET /core/datafiles/{uri}/path` — Get a datafile path
- `GET /core/datafiles/{uri}/thumbnail` — Get a picture thumbnail
- `POST /core/datafiles/by_targets` — Search data files for a large list of targets 
- `GET /core/datafiles/count` — Count datafiles
- `POST /core/datafiles/description` — Describe datafiles and give their relative paths in the configured storage system. In the case of already stored datafiles.
- `POST /core/datafiles/export-spectra-files` — 
- `GET /core/datafiles/provenances` — Search provenances linked to datafiles
- `POST /core/datafiles/provenances/by_targets` — Search provenances linked to datafiles for a large list of targets
- `POST /core/datafiles/upload-dx` — Upload and parse DX file
- `POST /core/datafiles/upload-spectra-csv` — Upload and parse spectra CSV file
- `GET /core/provenances` — Get provenances
- `POST /core/provenances` — Add a provenance
- `PUT /core/provenances` — Update a provenance
- `DELETE /core/provenances/{uri}` — Delete a provenance that doesn't describe data
- `GET /core/provenances/{uri}` — Get a provenance
- `GET /core/provenances/by_uris` — Get a list of provenances by their URIs
- `POST /core/provenances/by_uris` — Get a list of provenances by their URIs

### Devices (19)

- `GET /core/devices` — Search devices
- `POST /core/devices` — Create a device
- `PUT /core/devices` — Update a device
- `DELETE /core/devices/{uri}` — Delete a device
- `GET /core/devices/{uri}` — Get device detail
- `GET /core/devices/{uri}/data` — Search device data
- `GET /core/devices/{uri}/data/count` — Count device data
- `GET /core/devices/{uri}/data/provenances` — Get provenances of data that have been measured on this device
- `GET /core/devices/{uri}/datafiles` — Search device datafiles descriptions
- `GET /core/devices/{uri}/datafiles/provenances` — Get provenances of datafiles linked to this device
- `GET /core/devices/{uri}/facility` — Get devices by facility
- `GET /core/devices/{uri}/variables` — Get variables linked to the device
- `GET /core/devices/by_uris` — Get devices by uris
- `POST /core/devices/by_uris` — Get devices by uris
- `GET /core/devices/export` — export devices
- `POST /core/devices/export_by_uris` — export devices
- `POST /core/devices/export_geospatial` — Export a given list of devices URIs to shapefile
- `POST /core/devices/import` — Import a CSV file with one device per line
- `POST /core/devices/import_validation` — Validate the import of a CSV file with one device per line

### Documents (7)

- `GET /core/documents` — Search documents
- `POST /core/documents` — Add a document
- `PUT /core/documents` — Update document's description
- `DELETE /core/documents/{uri}` — Delete a document
- `GET /core/documents/{uri}` — Get document
- `GET /core/documents/{uri}/description` — Get document's description
- `GET /core/documents/count` — Count documents

### Events (17)

- `GET /core/events` — Search events
- `POST /core/events` — Create a list of event
- `PUT /core/events` — Update an event
- `DELETE /core/events/{uri}` — Delete an event
- `GET /core/events/{uri}` — Get an event
- `GET /core/events/{uri}/details` — Get an event with all it's properties
- `GET /core/events/count` — Count events
- `POST /core/events/import` — Import a CSV file with one move and one target per line
- `POST /core/events/import_validation` — Check a CSV file with one move and one target per line
- `POST /core/events/moves` — Create a list of move event
- `PUT /core/events/moves` — Update a move event
- `DELETE /core/events/moves/{uri}` — Delete a move event
- `GET /core/events/moves/{uri}` — Get a move with all it's properties
- `GET /core/events/moves/by_uris` — Get a list of moves with all positional information
- `POST /core/events/moves/by_uris` — Get a list of moves with all positional information
- `POST /core/events/moves/import` — Import a CSV file with one move and one target per line
- `POST /core/events/moves/import_validation` — Check a CSV file with one move and one target per line

### Experiments (17)

- `GET /core/experiments` — Search experiments
- `POST /core/experiments` — Add an experiment
- `PUT /core/experiments` — Update an experiment
- `DELETE /core/experiments/{uri}` — Delete an experiment
- `GET /core/experiments/{uri}` — Get an experiment
- `GET /core/experiments/{uri}/available_facilities` — Get facilities available for an experiment
- `GET /core/experiments/{uri}/data` — Search data
- `GET /core/experiments/{uri}/data/export` — export experiment data
- `POST /core/experiments/{uri}/data/import` — Import a CSV file for the given experiment URI and scientific object type.
- `POST /core/experiments/{uri}/data/import_validation` — Import a CSV file for the given experiment URI and scientific object type.
- `GET /core/experiments/{uri}/factors` — Get factors with their levels associated to an experiment
- `GET /core/experiments/{uri}/provenances` — Get provenances involved in an experiment
- `GET /core/experiments/{uri}/species` — Get species present in an experiment
- `GET /core/experiments/{uri}/variables` — Get variables involved in an experiment
- `GET /core/experiments/by_uris` — Get experiments URIs
- `POST /core/experiments/by_uris` — Get experiments URIs
- `GET /core/experiments/funding` — Search funding

### Factors (15)

- `GET /core/experiments/factors` — Search factors
- `POST /core/experiments/factors` — Create a factor
- `PUT /core/experiments/factors` — Update a factor
- `DELETE /core/experiments/factors/{uri}` — Delete a factor
- `GET /core/experiments/factors/{uri}` — Get a factor
- `GET /core/experiments/factors/{uri}/experiments` — Get factor associated experiments
- `GET /core/experiments/factors/{uri}/levels` — Get factor levels
- `GET /core/experiments/factors/by_uris` — Get a list of factors by their URIs
- `POST /core/experiments/factors/by_uris` — Get a list of factors by their URIs
- `GET /core/experiments/factors/categories` — Search categories
- `GET /core/experiments/factors/count` — Count factors
- `GET /core/experiments/factors/factor_levels` — Search factors levels
- `DELETE /core/experiments/factors/levels/{uri}` — Delete a factor level
- `GET /core/experiments/factors/levels/{uri}` — Get a factor level
- `GET /core/experiments/factors/levels/{uri}/details` — Get a factor level

### Faidare (6)

- `GET /faidare/v1/calls` — Check the available faidare calls
- `GET /faidare/v1/germplasm` — Submit a search request for germplasm
- `GET /faidare/v1/locations` — Faidarev1CallDTO to retrieve a list of locations available in the system
- `GET /faidare/v1/studies` — Retrieve studies information
- `GET /faidare/v1/trials` — Faidarev1CallDTO to retrieve a list of trials available in the system
- `GET /faidare/v1/variables` — Faidarev1CallDTO to retrieve a list of observationVariables available in the system

### Germplasm (21)

- `GET /core/germplasm` — Search germplasm
- `POST /core/germplasm` — Add a germplasm
- `PUT /core/germplasm` — Update a germplasm
- `POST /core/germplasm_group` — Add a germplasm group
- `PUT /core/germplasm_group` — Update a germplasm group
- `DELETE /core/germplasm_group/{uri}` — Delete a germplasm group
- `GET /core/germplasm_group/{uri}` — Get a germplasm group
- `GET /core/germplasm_group/{uri}/germplasm` — Get a germplasm group's germplasm, paginated
- `POST /core/germplasm_group/by_uris` — Get germplasm groups by their URIs
- `GET /core/germplasm_group/by-uris` — Get germplasm groups by their URIs
- `POST /core/germplasm_group/search` — Search germplasm groups
- `GET /core/germplasm_group/with-germplasm/{uri}` — Get a germplasm group with nested germplasm details
- `DELETE /core/germplasm/{uri}` — Delete a germplasm
- `GET /core/germplasm/{uri}` — Get a germplasm
- `GET /core/germplasm/{uri}/experiments` — Get experiments where a germplasm has been used
- `GET /core/germplasm/attributes` — Get attributes of all germplasm
- `GET /core/germplasm/attributes/{attribute}` — Get attribute values of all germplasm for a given attribute
- `POST /core/germplasm/by_uris` — Get a list of germplasms by their URIs
- `POST /core/germplasm/check` — check germplasms exist
- `POST /core/germplasm/export` — export germplasm
- `POST /core/germplasm/import` — Add or update many germplasms

### Locations (3)

- `GET /core/locations/count` — Count locations
- `GET /core/locations/history` — Search location history of an object
- `POST /core/locations/targetLocations` — Search the last geospatialized location of a target

### Metrics (4)

- `GET /core/metrics/experiment/{uri}` — Get an experiment summary history
- `GET /core/metrics/running_experiments` — Get running experiments metrics
- `GET /core/metrics/system` — Get system metrics
- `GET /core/metrics/system/summary` — Get system metrics summary

### Ontology (25)

- `PUT /ontology/{uri}/rename` — Rename all occurrences of the given URI
- `GET /ontology/base_uri` — Return base uri
- `POST /ontology/check_rdf_types` — Check the given rdf-types on the given uris
- `GET /ontology/data_properties` — Search data properties tree
- `GET /ontology/domain_hierarchy_restrictions` — Get restrictions from some super-class domain to one lower down in the hierarchy, ordered by what domain they first appear in.
- `GET /ontology/linkable_properties` — Search properties linkable to a domain
- `GET /ontology/name_space` — Return namespaces
- `GET /ontology/object_properties` — Search object properties tree
- `GET /ontology/properties/{domain}` — Search properties tree
- `DELETE /ontology/property` — Delete a property
- `GET /ontology/property` — Return property model definition detail
- `POST /ontology/property` — Create a RDF property
- `PUT /ontology/property` — Update a RDF property
- `GET /ontology/rdf_type` — Return class model definition with properties
- `DELETE /ontology/rdf_type_property_restriction` — Delete a rdf type property restriction
- `POST /ontology/rdf_type_property_restriction` — Add a rdf type property restriction
- `PUT /ontology/rdf_type_property_restriction` — Update a rdf type property restriction
- `GET /ontology/rdf_types` — Return classes models definitions with properties for a list of rdf types
- `GET /ontology/shared_resource_instances` — Return the list of shared resource instances
- `GET /ontology/subclasses_of` — Search sub-classes tree of an RDF class
- `GET /ontology/subclasses_of/search` — Search sub-classes tree of an RDF class
- `GET /ontology/subproperties_of` — Return property list from a parent property
- `GET /ontology/uri_label` — Return associated rdfs:label of an uri if exists
- `POST /ontology/uri_types` — Return all rdf types of some URIS
- `POST /ontology/uris_labels` — Return associated rdfs:label of uris if they exist

### Organizations (22)

- `GET /core/facilities` — Search facilities
- `POST /core/facilities` — Create a facility
- `PUT /core/facilities` — Update a facility
- `DELETE /core/facilities/{uri}` — Delete a facility
- `GET /core/facilities/{uri}` — Get a facility
- `GET /core/facilities/all_facilities` — Get all facilities
- `GET /core/facilities/by_uris` — Get facilities by their URIs
- `POST /core/facilities/by_uris` — Get facilities by their URIs
- `GET /core/facilities/minimal_search` — Search facilities returning minimal embedded information for better performance
- `GET /core/facilities/with_location` — Get only a list of facilities with a position (address/spatial coordinates
- `GET /core/organisations` — Search organisations
- `POST /core/organisations` — Create an organisation
- `PUT /core/organisations` — Update an organisation
- `DELETE /core/organisations/{uri}` — Delete an organisation
- `GET /core/organisations/{uri}` — Get an organisation 
- `GET /core/sites` — Search all sites
- `POST /core/sites` — Create a site
- `PUT /core/sites` — Update a site
- `DELETE /core/sites/{uri}` — Delete a site
- `GET /core/sites/{uri}` — Get a site
- `GET /core/sites/by_uris` — Get a list of sites
- `GET /core/sites/with_location` — Get only the list of sites with a location

### Positions (4)

- `GET /core/positions/{uri}` — Get the position of an object
- `GET /core/positions/count` — Count moves
- `POST /core/positions/geospatializedPosition` — Search the last geospatialized position of a target for an experiment
- `GET /core/positions/history` — Search history of position of an object

### Projects (7)

- `GET /core/projects` — Search projects
- `POST /core/projects` — Add a project
- `PUT /core/projects` — Update a project
- `DELETE /core/projects/{uri}` — Delete a project
- `GET /core/projects/{uri}` — Get a project
- `GET /core/projects/by_uris` — Get projects by their URIs
- `POST /core/projects/by_uris` — Get projects by their URIs

### Scientific Objects (19)

- `GET /core/scientific_objects` — Search list of scientific objects
- `POST /core/scientific_objects` — Create a scientific object for the given experiment
- `PUT /core/scientific_objects` — Update a scientific object for the given experiment
- `DELETE /core/scientific_objects/{uri}` — Delete a scientific object
- `GET /core/scientific_objects/{uri}` — Get scientific object detail
- `GET /core/scientific_objects/{uri}/data/provenances` — Get provenances of data that have been measured on this scientific object
- `GET /core/scientific_objects/{uri}/datafiles/provenances` — Get provenances of datafiles linked to this scientific object
- `GET /core/scientific_objects/{uri}/experiments` — Get scientific object detail for each experiments, a null value for experiment in response means a properties defined outside of any experiment (shared object).
- `GET /core/scientific_objects/{uri}/variables` — Get variables measured on this scientific object
- `POST /core/scientific_objects/by_uris` — Get scientific objet list of a given experiment URI
- `GET /core/scientific_objects/children` — Get list of scientific object children
- `GET /core/scientific_objects/count` — Count scientific objects
- `POST /core/scientific_objects/export` — Export a given list of scientific object URIs to csv data file
- `POST /core/scientific_objects/export_geospatial` — Export a given list of scientific object URIs to shapefile or geojson
- `GET /core/scientific_objects/geometry` — Get scientific objet list with geometry of a given experiment URI
- `POST /core/scientific_objects/import` — Import a CSV file for the given experiment URI and scientific object type.
- `POST /core/scientific_objects/import_validation` — Validate a CSV file for the given experiment URI and scientific object type.
- `POST /core/scientific_objects/json_import` — Create many scientific objects from a JSON list
- `GET /core/scientific_objects/used_types` — get used scientific object types

### Security (41)

- `GET /security/accounts` — Search accounts
- `POST /security/accounts` — Add an account
- `PUT /security/accounts` — Update an account
- `DELETE /security/accounts/{accountURI}` — Delete an account
- `GET /security/accounts/{uri}` — Get an account
- `GET /security/accounts/{uri}/groups` — Get groups of a user
- `GET /security/accounts/by_uris` — Get accounts by their URIs
- `POST /security/accounts/by_uris` — Get accounts by their URIs
- `GET /security/accounts/favorites` — Get list of favorites for a user
- `POST /security/accounts/favorites` — Add a favorite
- `DELETE /security/accounts/favorites/{uriFavorite}` — Delete a favorite
- `GET /security/groups` — Search groups
- `POST /security/groups` — Add a group
- `PUT /security/groups` — Update a group
- `DELETE /security/groups/{uri}` — Delete a group
- `GET /security/groups/{uri}` — Get a group
- `GET /security/groups/by_uris` — Get groups by their URIs
- `POST /security/groups/by_uris` — Get groups by their URIs
- `GET /security/persons` — Search persons
- `POST /security/persons` — Add a person
- `PUT /security/persons` — Update a person
- `GET /security/persons/{uri}` — Get a Person
- `GET /security/persons/by_uris` — Get persons by their URIs
- `POST /security/persons/by_uris` — Get persons by their URIs
- `GET /security/persons/GDPR` — Get RGPD PDF
- `GET /security/persons/orcid_record` — Get infos from an ORCID
- `GET /security/profiles` — Search profiles
- `POST /security/profiles` — Add a profile
- `PUT /security/profiles` — Update a profile
- `DELETE /security/profiles/{uri}` — Delete a profile
- `GET /security/profiles/{uri}` — Get a profile
- `GET /security/profiles/all` — Get all profiles
- `GET /security/users` — Search users
- `POST /security/users` — Add a user
- `PUT /security/users` — Update a user
- `GET /security/users/{uri}` — Get a user
- `GET /security/users/{uri}/groups` — Get groups of a user
- `GET /security/users/by_uris` — Get users by their URIs
- `GET /security/users/favorites` — Get list of favorites for a user
- `POST /security/users/favorites` — Add a favorite
- `DELETE /security/users/favorites/{uriFavorite}` — Delete a favorite

### Species (1)

- `GET /core/species` — get species (no pagination)

### Staple API (2)

- `GET /staple/ontology_file` — Export ontology file for Staple API as turtle syntax
- `GET /staple/resource_graph` — Get all graphs associated with resources

### System (1)

- `GET /core/system/info` — get system information

### UriSearch (1)

- `GET /core/uri_search/{uri}` — Get a list of objects that match the passed URI

### Variables (54)

- `GET /core/characteristics` — Search characteristics by name
- `POST /core/characteristics` — Add a characteristic
- `PUT /core/characteristics` — Update a characteristic
- `DELETE /core/characteristics/{uri}` — Delete a characteristic
- `GET /core/characteristics/{uri}` — Get a characteristic
- `GET /core/characteristics/by_uris` — Get detailed characteristics by uris
- `POST /core/characteristics/by_uris` — Get detailed characteristics by uris
- `GET /core/entities` — Search entities by name
- `POST /core/entities` — Add an entity
- `PUT /core/entities` — Update an entity
- `GET /core/entities_of_interest` — Search entities of interest by name
- `POST /core/entities_of_interest` — Add an entity of interest
- `PUT /core/entities_of_interest` — Update an entity of interest
- `DELETE /core/entities_of_interest/{uri}` — Delete an entity of interest
- `GET /core/entities_of_interest/{uri}` — Get an entity of interest
- `GET /core/entities_of_interest/by_uris` — Get detailed entities of interest by uris
- `POST /core/entities_of_interest/by_uris` — Get detailed entities of interest by uris
- `DELETE /core/entities/{uri}` — Delete an entity
- `GET /core/entities/{uri}` — Get an entity
- `GET /core/entities/by_uris` — Get detailed entities by uris
- `POST /core/entities/by_uris` — Get detailed entities by uris
- `GET /core/methods` — Search methods by name
- `POST /core/methods` — Add a method
- `PUT /core/methods` — Update a method
- `DELETE /core/methods/{uri}` — Delete a method
- `GET /core/methods/{uri}` — Get a method
- `GET /core/methods/by_uris` — Get detailed methods by uris
- `POST /core/methods/by_uris` — Get detailed methods by uris
- `GET /core/units` — Search units by name
- `POST /core/units` — Add an unit
- `PUT /core/units` — Update an unit
- `DELETE /core/units/{uri}` — Delete an unit
- `GET /core/units/{uri}` — Get an unit
- `GET /core/units/by_uris` — Get detailed units by uris
- `POST /core/units/by_uris` — Get detailed units by uris
- `GET /core/variables` — Search variables
- `POST /core/variables` — Add a variable
- `PUT /core/variables` — Update a variable
- `GET /core/variables_group` — Search variables groups
- `POST /core/variables_group` — Add a variables group
- `PUT /core/variables_group` — Update a variables group
- `DELETE /core/variables_group/{uri}` — Delete a variables group
- `GET /core/variables_group/{uri}` — Get a variables group
- `GET /core/variables_group/by_uris` — Get variables groups by their URIs
- `POST /core/variables_group/by_uris` — Get variables groups by their URIs
- `DELETE /core/variables/{uri}` — Delete a variable
- `GET /core/variables/{uri}` — Get a variable
- `GET /core/variables/by_uris` — Get detailed variables by uris
- `POST /core/variables/by_uris` — Get detailed variables by uris
- `POST /core/variables/copy_from_shared_resource_instance` — Copy the selected variables from the shared resource instance
- `GET /core/variables/datatypes` — Get variables datatypes
- `GET /core/variables/details` — Search detailed variables by name, long name, entity, characteristic, method or unit name
- `POST /core/variables/export_classic_by_uris` — export variable by list of uris
- `POST /core/variables/export_details_by_uris` — export detailed variable by list of uris

### Vue.js (7)

- `GET /vuejs/config` — Return the current configuration
- `GET /vuejs/extension/css/{module}.css` — Return the front Vue JS extension css file to include
- `GET /vuejs/extension/js/{module}.js` — Return the front Vue JS extension file to include
- `GET /vuejs/theme/{moduleId}/{themeId}/config` — Return the front Vue JS theme configuration
- `GET /vuejs/theme/{moduleId}/{themeId}/resource` — Return the theme requested resource
- `GET /vuejs/theme/{moduleId}/{themeId}/style.css` — Return the theme css file
- `GET /vuejs/user_config` — Return the user-specific configuration

### Vue.js - Ontology extension (9)

- `GET /vuejs/owl_extension/data_types` — Return literal datatypes definition
- `GET /vuejs/owl_extension/object_types` — Return object types definition
- `PUT /vuejs/owl_extension/properties_order` — Define properties order
- `GET /vuejs/owl_extension/rdf_type` — Return rdf type model definition with properties
- `POST /vuejs/owl_extension/rdf_type` — Create a custom class
- `PUT /vuejs/owl_extension/rdf_type` — Update a custom class
- `GET /vuejs/owl_extension/rdf_type_properties` — Return class model properties definitions
- `DELETE /vuejs/owl_extension/rdf_type/{uri}` — Delete a RDF type
- `GET /vuejs/owl_extension/rdf_types_parameters` — Return RDF types parameters for Vue.js application

## What can be linked: fields of every Creation/Update DTO that are not plain facts

A field here is a candidate link (to another resource, a list of them, or a nested record). "required" = PHIS refuses without it.

- **AccountCreationDTO**: `favorites` (list of string), `linked_person` (string)
- **AccountUpdateDTO**: `favorites` (list of string), `linked_person` (string)
- **ActivityCreationDTO**: `settings` (object)
- **AnnotationCreationDTO**: `targets` (list of string, required), `motivation` (string, required)
- **AnnotationUpdateDTO**: `targets` (list of string, required), `motivation` (string, required)
- **AreaCreationDTO**: `is_structural_area` (boolean, required), `event` (→ EventCreationDTO)
- **AreaUpdateDTO**: `is_structural_area` (boolean, required), `event` (→ EventCreationDTO)
- **CharacteristicCreationDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **CharacteristicUpdateDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **DataCreationDTO**: `target` (string), `variable` (string, required), `confidence` (number), `provenance` (→ DataProvenanceModel, required), `raw_data` (list of object)
- **DataFilePathCreationDTO**: `target` (string), `provenance` (→ DataProvenanceModel, required), `archive` (string), `relative_path` (string, required)
- **DataUpdateDTO**: `target` (string), `variable` (string, required), `confidence` (number), `provenance` (→ DataProvenanceModel, required), `raw_data` (list of object)
- **DeviceCreationDTO**: `person_in_charge` (string)
- **EntityCreationDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **EntityUpdateDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **EventCreationDTO**: `targets` (list of string, required)
- **EventUpdateDTO**: `targets` (list of string, required)
- **ExperimentCreationDTO**: `organisations` (list of string), `facilities` (list of string), `projects` (list of string), `scientific_supervisors` (list of string), `technical_supervisors` (list of string), `groups` (list of string), `factors` (list of string), `funding` (list of string)
- **FacilityCreationDTO**: `organizations` (list of string), `sites` (list of string), `variableGroups` (list of string), `locations` (list of LocationObservationDTO)
- **FacilityUpdateDTO**: `organizations` (list of string), `locations` (list of LocationObservationDTO), `sites` (list of string), `variableGroups` (list of string)
- **FactorCreationDTO**: `category` (string), `levels` (list of FactorLevelCreationDTO, required), `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string), `experiment` (string)
- **FactorUpdateDTO**: `category` (string), `levels` (list of FactorLevelCreationDTO, required), `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **Faidarev1LastUpdateDTO**: `timestamp` (string), `version` (string)
- **GermplasmCreationDTO**: `synonyms` (list of string), `code` (string), `production_year` (integer), `species` (string), `variety` (string), `accession` (string), `institute` (string), `groups` (list of string)
- **GermplasmGroupCreationDTO**: `germplasm_list` (list of string)
- **GermplasmGroupUpdateDTO**: `germplasm_list` (list of string)
- **GermplasmUpdateDTO**: `synonyms` (list of string), `code` (string), `production_year` (integer), `species` (string), `variety` (string), `accession` (string), `institute` (string), `groups` (list of string)
- **GroupCreationDTO**: `user_profiles` (list of GroupUserProfileDTO)
- **GroupUpdateDTO**: `user_profiles` (list of GroupUserProfileDTO)
- **InterestEntityCreationDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **InterestEntityUpdateDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **MethodCreationDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **MethodUpdateDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **MoveCreationDTO**: `targets` (list of string, required), `location` (→ LocationObservationDTO), `from` (string), `to` (string), `targets_positions` (list of TargetPositionCreationDTO)
- **MoveUpdateDTO**: `targets` (list of string, required), `location` (→ LocationObservationDTO), `from` (string), `to` (string), `targets_positions` (list of TargetPositionCreationDTO)
- **OrganizationCreationDTO**: `parents` (list of string), `groups` (list of string), `facilities` (list of string)
- **OrganizationUpdateDTO**: `parents` (list of string), `groups` (list of string), `facilities` (list of string)
- **PositionCreationDTO**: `point` (→ Point), `x` (string), `y` (string), `z` (string), `text` (string)
- **ProfileCreationDTO**: `credentials` (list of string, required)
- **ProfileUpdateDTO**: `credentials` (list of string, required)
- **ProjectCreationDTO**: `related_projects` (list of string), `coordinators` (list of string), `scientific_contacts` (list of string), `administrative_contacts` (list of string)
- **ProvenanceCreationDTO**: `prov_activity` (list of ActivityCreationDTO), `prov_agent` (list of AgentModel), `issued` (string), `modified` (string)
- **ProvenanceUpdateDTO**: `prov_activity` (list of ActivityCreationDTO), `prov_agent` (list of AgentModel), `issued` (string), `modified` (string)
- **ScientificObjectCreationDTO**: `experiment` (string), `move` (→ MoveCreationDTO)
- **ScientificObjectUpdateDTO**: `experiment` (string), `move` (→ MoveCreationDTO)
- **SiteCreationDTO**: `organizations` (list of string), `facilities` (list of string), `groups` (list of string)
- **SiteUpdateDTO**: `organizations` (list of string), `facilities` (list of string), `groups` (list of string)
- **TargetPositionCreationDTO**: `target` (string, required), `position` (→ PositionCreationDTO)
- **UnitCreationDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **UnitUpdateDTO**: `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **UserCreationDTO**: `favorites` (list of string), `linked_person` (string)
- **UserUpdateDTO**: `favorites` (list of string), `linked_person` (string)
- **VariableCreationDTO**: `entity` (string, required), `entity_of_interest` (string), `characteristic` (string, required), `trait` (string), `trait_name` (string), `method` (string, required), `unit` (string, required), `species` (list of string), `time_interval` (string), `sampling_interval` (string), `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **VariableUpdateDTO**: `entity` (string, required), `entity_of_interest` (string), `characteristic` (string, required), `trait` (string), `trait_name` (string), `method` (string, required), `unit` (string, required), `species` (list of string), `time_interval` (string), `sampling_interval` (string), `exact_match` (list of string), `close_match` (list of string), `broad_match` (list of string), `narrow_match` (list of string)
- **VariablesGroupCreationDTO**: `variables` (list of string)
- **VariablesGroupUpdateDTO**: `variables` (list of string)
