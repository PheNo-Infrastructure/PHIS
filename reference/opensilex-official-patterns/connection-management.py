"""
Connection Management Pattern
==============================

Handles API timeout issues by reconnecting every 30 minutes during long-running operations.

Source: 2026_PheNO_PHIS_DataImport_v3.ipynb (OpenSILEX team)
"""

import datetime
import opensilexClientToolsPython as osC

# Example usage in a long-running import loop

def import_data_with_reconnection(df_data, login_info):
    """
    Import data with automatic reconnection every 30 minutes.

    Args:
        df_data: DataFrame containing data to import
        login_info: Dictionary with 'Identifier', 'Password', 'Host' keys
    """

    # Connect to PHIS Database
    Py_Client = osC.ApiClient()
    Py_Client.connect_to_opensilex_ws(
        identifier=login_info["Identifier"],
        password=login_info["Password"],
        host=login_info["Host"]
    )

    # Set a time limit of 30 minutes from the current time
    timelimit = datetime.datetime.now() + datetime.timedelta(minutes=30)

    # Initialize the Data API
    Dat_Api = osC.DataApi(Py_Client)

    # Process data
    for index, row in df_data.iterrows():

        # Your data processing logic here
        # ...

        # Reconnect to the Database After 30 Minutes
        if datetime.datetime.now() > timelimit:
            print("Reconnecting to API...")
            Py_Client.connect_to_opensilex_ws(
                identifier=login_info["Identifier"],
                password=login_info["Password"],
                host=login_info["Host"]
            )
            # Reinitialize the Data API with the Py_Client instance
            Dat_Api = osC.DataApi(Py_Client)
            # Reset the time limit to 30 minutes from the current time
            timelimit = datetime.datetime.now() + datetime.timedelta(minutes=30)
            print("Reconnected successfully")

    print('Import complete')


# Alternative: Reconnect before each batch
def import_with_batch_reconnection(df_data, login_info, batch_size=1000):
    """
    Import data in batches, reconnecting before each batch to ensure fresh connection.

    Args:
        df_data: DataFrame containing data to import
        login_info: Dictionary with 'Identifier', 'Password', 'Host' keys
        batch_size: Number of records per batch (default: 1000)
    """

    Py_Client = osC.ApiClient()

    # Process in batches
    for batch_start in range(0, len(df_data), batch_size):

        # Reconnect before each batch
        Py_Client.connect_to_opensilex_ws(
            identifier=login_info["Identifier"],
            password=login_info["Password"],
            host=login_info["Host"]
        )

        Dat_Api = osC.DataApi(Py_Client)

        # Process batch
        batch_end = min(batch_start + batch_size, len(df_data))
        df_batch = df_data.iloc[batch_start:batch_end]

        bodies = []
        for index, row in df_batch.iterrows():
            # Build data bodies
            # bodies.append(...)
            pass

        if bodies:
            Dat_Api.add_list_data(body=bodies)
            print(f"Imported batch {batch_start}-{batch_end}")

    print('All batches imported')


# Key Takeaway:
# The OpenSILEX API has timeout limits. For long-running operations:
# 1. Set a 30-minute timer
# 2. Check before each operation
# 3. Reconnect when time limit exceeded
# 4. Reinitialize all API objects after reconnection
