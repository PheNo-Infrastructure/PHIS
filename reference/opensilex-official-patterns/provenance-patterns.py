"""
Provenance Patterns
===================

Rich provenance tracking linking data to source files, software agents, and activities.

Source: 2026_PheNO_PHIS_DataImport_v3.ipynb (OpenSILEX team)
"""

import opensilexClientToolsPython as osC
import json


# Pattern 1: Create Provenance for Data Processing
def create_data_provenance():
    """
    Create provenance for morphological parameters computed by software.
    """

    Dat_Api = osC.DataApi(Py_Client)

    prov_name = "HortControl 3.14_Parameters"
    description = "Morphological and Physiological parameters computed by HortControl version 3.14"

    # Define the activity (what was done)
    prov_activity = [
        osC.ActivityCreationDTO(rdf_type="vocabulary:Computation")
    ]

    # Define the agents (who/what did it)
    prov_agent = [
        osC.AgentModel(
            uri="phis-egi-demo:id/device/hortcontrol_314",
            rdf_type="vocabulary:Software",
            settings={}
        )
    ]

    # Create provenance
    body = osC.ProvenanceCreationDTO(
        name=prov_name,
        description=description,
        prov_agent=prov_agent,
        prov_activity=prov_activity
    )

    Api_Resp = Dat_Api.create_provenance(body=body)
    print(f"Provenance created: {Api_Resp['metadata']['datafiles']}")

    # Get provenance URI
    Prov_Src = Dat_Api.search_provenance(name=prov_name)["result"]
    return Prov_Src[0].uri


# Pattern 2: Create Provenance for Sensor Data
def create_sensor_provenance():
    """
    Create provenance for sensor data acquisition.
    """

    Dat_Api = osC.DataApi(Py_Client)

    prov_name = "TraitFinder_Mesh"
    description = "Mesh generated from the PlantEye camera point cloud of TraitFinder."

    # Define the acquisition activity
    prov_activity = [
        osC.ActivityCreationDTO(rdf_type="vocabulary:Computation")
    ]

    # Define the agents (devices used)
    prov_agent = [
        osC.AgentModel(
            uri="phis-egi-demo:id/device/planteye_f600",
            rdf_type="vocabulary:LaserLightSection"
        ),
        osC.AgentModel(
            uri="phis-egi-demo:id/device/traitfinder",
            rdf_type="vocabulary:HorizontalScreen"
        ),
        osC.AgentModel(
            uri="phis-egi-demo:id/device/hortcontrol_314",
            rdf_type="vocabulary:Software"
        )
    ]

    # Create provenance
    body = osC.ProvenanceCreationDTO(
        name=prov_name,
        description=description,
        prov_agent=prov_agent,
        prov_activity=prov_activity
    )

    Api_Resp = Dat_Api.create_provenance(body=body)
    return Dat_Api.search_provenance(name=prov_name)["result"][0].uri


# Pattern 3: Link Data Point to File via Provenance
def create_data_with_file_provenance(row, prov_uri, exp_uri, var_uri, target_uri, mesh_uri):
    """
    Create a data point linked to its source mesh file via provenance.

    Args:
        row: DataFrame row with data
        prov_uri: Provenance URI
        exp_uri: Experiment URI
        var_uri: Variable URI
        target_uri: Scientific object URI
        mesh_uri: Source mesh file URI
    """

    # Define what was used (input files)
    Prov_Used = osC.ProvEntityModel(
        uri=mesh_uri,
        rdf_type="vocabulary:3DMesh"
    )

    # Define who/what did the processing
    Prov_Was_Associated_With = osC.ProvEntityModel(
        uri="phis-egi-demo:id/device/hortcontrol_314",
        rdf_type="vocabulary:Software"
    )

    # Create data point with full provenance
    body = osC.DataCreationDTO(
        _date=str(row['Timestamp']),
        target=target_uri,
        variable=var_uri,
        value=row['Value'],
        metadata={
            'Block': row['Block'],
            'Column': row['Column'],
            'Row': row['Row']
        },
        provenance=osC.DataProvenanceModel(
            uri=prov_uri,
            prov_used=[Prov_Used],  # Links to source file
            prov_was_associated_with=[Prov_Was_Associated_With],  # Links to software
            experiments=[exp_uri]
        )
    )

    return body


# Pattern 4: File Upload with Provenance
def upload_file_with_provenance(file_path, timestamp, target_uri, prov_uri, exp_uri, metadata):
    """
    Upload a file with provenance information.

    Args:
        file_path: Path to file
        timestamp: ISO timestamp
        target_uri: Scientific object URI
        prov_uri: Provenance URI
        exp_uri: Experiment URI
        metadata: Additional metadata dict
    """

    Dat_Api = osC.DataApi(Py_Client)

    # Build file description
    description = {
        "rdf_type": "vocabulary:3DMesh",
        "date": timestamp,
        "target": target_uri,
        "metadata": metadata,
        "provenance": {
            "uri": prov_uri,
            "settings": {},
            "experiments": [exp_uri]
        }
    }

    # Upload file
    Dat_Api.post_data_file(
        description=json.dumps(description),
        file=file_path
    )


# Key Takeaways:
# 1. Provenance has three main components:
#    - prov_activity: What was done (Computation, Measurement, etc.)
#    - prov_agent: Who/what did it (Software, Device, Person)
#    - prov_used: What inputs were used (Files, previous data)
#
# 2. Data points can reference:
#    - Source files via prov_used
#    - Processing software via prov_was_associated_with
#    - Experiment context via experiments
#
# 3. Files have provenance embedded in their description
#
# 4. Provenance enables:
#    - Data traceability
#    - Reproducibility
#    - Quality control
#    - Audit trails
