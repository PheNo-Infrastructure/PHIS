"""
Batch Processing Pattern
=========================

Process data in batches (default: 1000 records) to avoid overwhelming the API.

Source: 2026_PheNO_PHIS_DataImport_v3.ipynb (OpenSILEX team)
"""

import opensilexClientToolsPython as osC
from tqdm import tqdm

# Initialize API
Dat_Api = osC.DataApi(Py_Client)


def import_data_in_batches(df_data, batch_size=1000):
    """
    Import data in batches to prevent API overload.

    Args:
        df_data: DataFrame with data to import
        batch_size: Number of records per batch (default: 1000)
    """

    # Official OpenSILEX team uses 1000 as default batch size
    pas = batch_size  # "pas" is French for "step"
    count = 0

    # Iterate over the data in slices of size 'pas'
    for slc in range(0, len(df_data), pas):
        df_Slice = df_data.iloc[slc:slc + pas]  # Slice the dataframe
        bodies = []  # Initialize list to store data bodies
        count += 1

        # Build bodies list for this batch
        for index, row in df_Slice.iterrows():
            body = osC.DataCreationDTO(
                _date=str(row['Timestamp']),
                target=row['Plant_URI'],
                variable=row['Variable_URI'],
                value=row['Value'],
                metadata={'Block': row['Block'], 'Column': row['Column'], 'Row': row['Row']},
                provenance=row['Provenance']
            )
            bodies.append(body)

        # Submit entire batch at once
        if bodies:
            Dat_Api.add_list_data(body=bodies)
            print(f"Batch {count} imported ({len(bodies)} records)")

    print(f'Import complete: {count} batches processed')


def import_with_progress_bar(df_data, batch_size=1000):
    """
    Import data in batches with progress bar using tqdm.

    Args:
        df_data: DataFrame with data to import
        batch_size: Number of records per batch
    """

    total_batches = (len(df_data) + batch_size - 1) // batch_size

    for batch_num in tqdm(range(total_batches), desc="Importing batches"):
        start_idx = batch_num * batch_size
        end_idx = min(start_idx + batch_size, len(df_data))

        df_batch = df_data.iloc[start_idx:end_idx]
        bodies = []

        for index, row in df_batch.iterrows():
            # Build body
            body = osC.DataCreationDTO(...)
            bodies.append(body)

        if bodies:
            Dat_Api.add_list_data(body=bodies)

    print('Import complete')


# Example: Process files in batches
def import_files_in_batches(df_files, batch_size=100):
    """
    Import files in smaller batches (files are larger than data points).

    Args:
        df_files: DataFrame with file paths
        batch_size: Files per batch (smaller for large files)
    """

    for batch_start in range(0, len(df_files), batch_size):
        batch_end = min(batch_start + batch_size, len(df_files))
        df_batch = df_files.iloc[batch_start:batch_end]

        for index, row in tqdm(df_batch.iterrows(), desc="Files processing"):
            # Import individual file
            description = {
                "rdf_type": "vocabulary:3DMesh",
                "date": row["Timestamp"],
                "target": row["Plant_URI"],
                "metadata": {'Block': row['Block'], 'Column': row['Column'], 'Row': row['Row']},
                "provenance": {"uri": row["Prov"], "experiments": [exp_uri]}
            }

            Dat_Api.post_data_file(
                description=json.dumps(description),
                file=row["Path"]
            )

        print(f"Batch {batch_start}-{batch_end} complete")


# Key Takeaways:
# 1. Default batch size: 1000 records for data points
# 2. Smaller batches (100-200) for file uploads
# 3. Always check if bodies list is not empty before API call
# 4. Use tqdm for progress tracking on long imports
# 5. Batch processing prevents:
#    - API rate limiting
#    - Memory issues
#    - Timeout errors
