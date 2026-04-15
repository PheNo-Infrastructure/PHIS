"""
Exact Match Search Pattern
===========================

Uses regex patterns to ensure exact matches and prevent partial matches.

Example: Searching for "Barke" should NOT match "Barke-mutant" or "Barke_line_2"

Source: 2026_PheNO_PHIS_DataImport_v3.ipynb (OpenSILEX team)
"""

import opensilexClientToolsPython as osC

# Initialize APIs
Germ_Api = osC.GermplasmApi(Py_Client)
ScObj_Api = osC.ScientificObjectsApi(Py_Client)


# BAD: Partial match (default behavior)
def search_partial_match(name):
    """
    Default search - matches partial strings
    "Barke" will match: "Barke", "Barke-mutant", "Barke_line_2"
    """
    result = Germ_Api.search_germplasm(name=name)["result"]
    return result


# GOOD: Exact match using regex
def search_exact_match(name):
    """
    Exact match search using regex anchors ^ and $
    "Barke" will ONLY match: "Barke"
    """
    # Use regex: ^name$ means start (^) + exact string + end ($)
    result = Germ_Api.search_germplasm(name=f"^{name}$")["result"]
    return result


# Example from the official notebook
def get_or_create_germplasm(species, rdf_type):
    """
    Search for germplasm using exact match pattern.

    Args:
        species: Exact species name (e.g., "Hordeum vulgare")
        rdf_type: RDF type URI
    """

    # Search for exact match using regex pattern
    Germ_Src = Germ_Api.search_germplasm(
        name=f"^{species}$",  # Exact match: ^species$
        rdf_type=rdf_type
    )["result"]

    if Germ_Src:
        # Found existing germplasm
        return Germ_Src[0].uri
    else:
        # Create new germplasm
        body = osC.GermplasmCreationDTO(
            name=species,
            rdf_type=rdf_type
        )
        Germ_Api.create_germplasm(body=body, check_only=False)

        # Search again to get URI
        Germ_Src = Germ_Api.search_germplasm(
            name=f"^{species}$",
            rdf_type=rdf_type
        )["result"]

        return Germ_Src[0].uri


# Example: Scientific Objects
def search_scientific_object_exact(plant_id):
    """
    Search for scientific object with exact plant ID.

    Args:
        plant_id: Exact plant identifier (e.g., "SP_001")
    """
    ScObj_Src = ScObj_Api.search_scientific_objects(
        name=f"^{plant_id}$"  # Exact match
    )["result"]

    if ScObj_Src:
        return ScObj_Src[0].uri
    else:
        return None


# Key Takeaway:
# Always use f"^{name}$" pattern for exact matches to prevent:
# - Duplicate creation due to partial matches
# - Incorrect associations
# - Data integrity issues
