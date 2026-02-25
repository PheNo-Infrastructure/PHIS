#!/usr/bin/env python3
"""
OpenSILEX Profile and Group Setup for Feide/OpenID Connect
Creates Administrator and Default User profiles, Users and Administrators groups.
Idempotent -- safe to run multiple times.
"""

import argparse
import json
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

# Profiles and groups configuration

ADMIN_CREDENTIALS = [
    "account-access", "account-modification",
    "annotation-access", "annotation-modification", "annotation-delete",
    "area-access", "area-modification", "area-delete",
    "data-access", "data-modification", "data-delete",
    "dataverse-access", "dataverse-modification",
    "device-access", "device-modification", "device-delete",
    "document-access", "document-modification", "document-delete",
    "event-access", "event-modification", "event-delete",
    "experiment-access", "experiment-modification", "experiment-delete",
    "facility-access", "facility-modification", "facility-delete",
    "factor-access", "factor-modification", "factor-delete",
    "germplasm-access", "germplasm-modification", "germplasm-delete",
    "group-access", "group-modification", "group-delete",
    "organization-access", "organization-modification", "organization-delete",
    "package-access",
    "person-access", "person-modification",
    "profile-access", "profile-modification", "profile-delete",
    "project-access", "project-modification", "project-delete",
    "provenance-access", "provenance-modification", "provenance-delete",
    "scientific-objects-access", "scientific-objects-modification", "scientific-objects-delete",
    "spatial-access",
    "user-access", "user-modification", "user-delete",
    "variable-access", "variable-modification", "variable-delete",
    "vocabulary-access",
    "admin-access", "dashboard-access", "menu-access", "profile-read-own",
]

DEFAULT_USER_CREDENTIALS = [
    "dashboard-access",
    "menu-access",
    "profile-read-own",
    "organization-access",
    "project-access",
    "experiment-access",
    "facility-access",
    "device-access",
    "event-access",
    "variable-access",
    "germplasm-access",
    "document-access",
    "scientific-objects-access",
    "provenance-access",
    "data-access",
    "spatial-access",
    "vocabulary-access",
    "person-access",
]


def authenticate(base_url, email, password):
    """Authenticate and return JWT token."""
    resp = requests.post(
        f"{base_url}/security/authenticate",
        json={"identifier": email, "password": password},
        headers={"Content-Type": "application/json"},
    )
    if resp.status_code == 200:
        token = resp.json().get("result", {}).get("token")
        if token:
            return token
    print(f"ERROR: Authentication failed ({resp.status_code})")
    return None


def create_profile(base_url, token, profile_data):
    """Create a profile. Returns True on success or if already exists."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{base_url}/security/profiles", json=profile_data, headers=headers)

    if resp.status_code in (200, 201):
        return True
    elif resp.status_code == 409:
        # Already exists -- update it
        resp2 = requests.put(f"{base_url}/security/profiles", json=profile_data, headers=headers)
        return resp2.status_code == 200
    else:
        print(f"ERROR: Failed to create profile '{profile_data.get('name')}': {resp.status_code} {resp.text}")
        return False


def create_group(base_url, token, group_data):
    """Create a group. Returns True on success or if already exists."""
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    resp = requests.post(f"{base_url}/security/groups", json=group_data, headers=headers)

    if resp.status_code in (200, 201):
        return True
    elif resp.status_code == 409:
        return True  # Already exists
    else:
        print(f"ERROR: Failed to create group '{group_data.get('name')}': {resp.status_code} {resp.text}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Setup OpenSILEX profiles and groups for Feide")
    parser.add_argument("--api-url", required=True, help="OpenSILEX REST API base URL")
    parser.add_argument("--email", default="admin@opensilex.org", help="Admin email")
    parser.add_argument("--password", default="admin", help="Admin password")
    args = parser.parse_args()

    base_url = args.api_url.rstrip("/")

    # Authenticate with retry
    token = None
    for attempt in range(5):
        token = authenticate(base_url, args.email, args.password)
        if token:
            break
        print(f"  Retry {attempt + 1}/5...")
        time.sleep(5)

    if not token:
        print("ERROR: Could not authenticate after 5 attempts")
        sys.exit(1)

    print("[OK] Authenticated with OpenSILEX API")

    # Create profiles
    ok = create_profile(base_url, token, {
        "uri": "http://opensilex.org/profiles/admin",
        "name": "Administrator",
        "credentials": ADMIN_CREDENTIALS,
    })
    print(f"[{'OK' if ok else 'FAIL'}] Administrator profile")

    ok = create_profile(base_url, token, {
        "uri": "http://opensilex.org/profiles/default",
        "name": "Default User",
        "credentials": DEFAULT_USER_CREDENTIALS,
    })
    print(f"[{'OK' if ok else 'FAIL'}] Default User profile")

    # Create groups
    ok = create_group(base_url, token, {
        "uri": "http://opensilex.org/groups/users",
        "name": "Users",
        "description": "Default group for Feide/OpenID users - automatically assigned",
        "user_profiles": [],
    })
    print(f"[{'OK' if ok else 'FAIL'}] Users group")

    ok = create_group(base_url, token, {
        "uri": "http://opensilex.org/groups/administrators",
        "name": "Administrators",
        "description": "System administrators with full access",
        "user_profiles": [],
    })
    print(f"[{'OK' if ok else 'FAIL'}] Administrators group")

    print("[OK] Setup complete")


if __name__ == "__main__":
    main()
