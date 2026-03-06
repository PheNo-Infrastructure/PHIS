"""
Pytest configuration for Tier 3 tests

Imports all fixtures from Tier 2 conftest so they're available to Tier 3 tests.
"""

import sys
import os
import pytest

# Add tier2 to Python path BEFORE importing
tier2_api_tests = os.path.abspath(os.path.join(os.path.dirname(__file__), '../tier2/api-tests'))
if tier2_api_tests not in sys.path:
    sys.path.insert(0, tier2_api_tests)

# Now import from tier2 conftest
try:
    # Import the module
    import importlib.util
    spec = importlib.util.spec_from_file_location("tier2_conftest", os.path.join(tier2_api_tests, "conftest.py"))
    tier2_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(tier2_module)

    # Re-export fixtures
    api_client = tier2_module.api_client
    admin_token = tier2_module.admin_token
    unique_id = tier2_module.unique_id
    test_project_data = tier2_module.test_project_data
    test_experiment_data = tier2_module.test_experiment_data
    test_device_data = tier2_module.test_device_data
    cleanup_tracker = tier2_module.cleanup_tracker

except Exception as e:
    print(f"Warning: Could not import tier2 fixtures: {e}")
    # Fallback: just do wildcard import
    from conftest import *  # noqa: F401, F403
