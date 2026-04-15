# OpenSILEX Official Patterns

This folder contains reference patterns extracted from the official OpenSILEX team's data import notebook (`2026_PheNO_PHIS_DataImport_v3.ipynb`).

## Source

- **Original notebook**: `2026_PheNO_PHIS_DataImport_v3.ipynb`
- **Created by**: OpenSILEX/NaPPI team
- **Purpose**: Workshop example for importing phenotyping data into PHIS

## Key Patterns

### 1. Connection Management (`connection-management.py`)
Handles API timeout issues by reconnecting every 30 minutes during long-running import operations.

### 2. Exact Match Search (`exact-match-search.py`)
Uses regex patterns to ensure exact matches and prevent partial matches (e.g., "Barke" not matching "Barke-mutant").

### 3. Batch Processing (`batch-processing.py`)
Processes data in 1000-record batches to avoid overwhelming the API.

### 4. Duplicate Detection (`duplicate-detection.py`)
Searches for existing data before creating new records to prevent duplicates.

### 5. Provenance Patterns (`provenance-patterns.py`)
Rich provenance tracking linking data points to source files, software agents, and activities.

## Usage Notes

- These patterns are production-tested by the OpenSILEX team
- They handle real-world issues like timeouts, duplicates, and data integrity
- Batch size of 1000 records is their recommended default
- The 30-minute reconnection interval prevents timeout errors

## See Also

- OpenSILEX Python Client: https://github.com/OpenSILEX/opensilexClientToolsPython
- OpenSILEX Documentation: https://opensilex-scripts.pages.mia.inra.fr/opensilex-generic-scripts/scripts/overview
