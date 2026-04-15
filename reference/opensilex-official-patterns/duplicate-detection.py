"""
Duplicate Detection Pattern
============================

Search for existing data before creating new records to prevent duplicates.

Source: 2026_PheNO_PHIS_DataImport_v3.ipynb (OpenSILEX team)
"""

import opensilexClientToolsPython as osC

# Initialize API
Dat_Api = osC.DataApi(Py_Client)


def import_data_with_duplicate_check(df_data, experiment_uri, variable_uri, target_uri_dict):
    """
    Import data points while checking for duplicates.

    Args:
        df_data: DataFrame with data to import
        experiment_uri: Experiment URI
        variable_uri: Variable URI
        target_uri_dict: Dictionary mapping plant IDs to URIs
    """

    logfile = []  # Track duplicates
    bodies = []   # New data to import

    for index, row in df_data.iterrows():

        # Search for existing data point
        Dat_Src = Dat_Api.search_data_list(
            targets=[target_uri_dict[row["Plant_ID"]]],
            start_date=row['Timestamp'].replace('+', '.000+'),
            end_date=row['Timestamp'].replace('+', '.000+'),
            variables=[variable_uri],
            experiments=[experiment_uri],
            page_size=20
        )['result']

        if Dat_Src:
            # Data already exists - log it
            logfile.append({
                'Plant_ID': row["Plant_ID"],
                'Timestamp': row["Timestamp"]
            })
        else:
            # Data doesn't exist - prepare to create it
            body = osC.DataCreationDTO(
                _date=str(row['Timestamp']),
                target=target_uri_dict[row["Plant_ID"]],
                variable=variable_uri,
                value=row['Value'],
                metadata={},
                provenance=osC.DataProvenanceModel(...)
            )
            bodies.append(body)

    # Import all new data points
    if bodies:
        Dat_Api.add_list_data(body=bodies)
        print(f"Imported {len(bodies)} new data points")
    else:
        print("All data already uploaded - no new records")

    # Report duplicates
    if logfile:
        print(f"Skipped {len(logfile)} duplicate records")

    return logfile


def check_file_exists(target_uri, filename, timestamp):
    """
    Check if a file already exists for a given target and timestamp.

    Args:
        target_uri: Scientific object URI
        filename: File name to check
        timestamp: Timestamp string

    Returns:
        File URI if exists, None otherwise
    """

    # Get all files for this target
    Dat_Src = Dat_Api.get_data_file_descriptions_by_targets(
        targets=[target_uri]
    )["result"]

    # Search for matching file
    for file_desc in Dat_Src:
        if file_desc.filename == filename and file_desc._date == timestamp:
            # Found matching file
            return file_desc.uri

    # No match found
    return None


def import_files_with_duplicate_check(df_files):
    """
    Import files while checking for duplicates.

    Args:
        df_files: DataFrame with file information
    """

    imported_count = 0
    skipped_count = 0

    for index, row in df_files.iterrows():

        # Check if file already exists
        existing_uri = check_file_exists(
            target_uri=row["Plant_URI"],
            filename=row["Filename"],
            timestamp=row['Timestamp'].replace('+', '.000+')
        )

        if existing_uri:
            # File already exists
            skipped_count += 1
            continue
        else:
            # Import new file
            description = {
                "rdf_type": "vocabulary:3DMesh",
                "date": row["Timestamp"],
                "target": row["Plant_URI"],
                "provenance": {"uri": row["Prov"]}
            }

            Dat_Api.post_data_file(
                description=json.dumps(description),
                file=row["Path"]
            )
            imported_count += 1

    print(f"Imported {imported_count} new files")
    print(f"Skipped {skipped_count} duplicate files")


# Key Takeaways:
# 1. Always search before creating to prevent duplicates
# 2. Search criteria must match exactly:
#    - Target (scientific object)
#    - Timestamp (with timezone: .000+)
#    - Variable (for data points)
#    - Experiment
# 3. Log duplicates for debugging
# 4. Batch the "create" operations after filtering duplicates
# 5. For files: check by filename + timestamp + target
