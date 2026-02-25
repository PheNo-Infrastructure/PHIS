#!/usr/bin/env python3
"""
OpenSILEX Auto-Group Monitor for Docker (REST API)
Polls the OpenSILEX API for new users and assigns them to the default
Users group via the REST API (PUT /security/groups).
"""

import argparse
import json
import logging
import os
import sys
import time

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package required. Install with: pip install requests")
    sys.exit(1)

DEFAULT_GROUP_URI = "http://opensilex.org/groups/users"
DEFAULT_PROFILE_URI = "http://opensilex.org/profiles/default"
CHECK_INTERVAL = 60  # seconds

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger(__name__)


class AutoGroupMonitor:
    def __init__(self, api_url, admin_email, admin_password, cache_file):
        self.api_url = api_url.rstrip("/")
        self.admin_email = admin_email
        self.admin_password = admin_password
        self.cache_file = cache_file
        self.token = None
        self.processed_users = self._load_cache()

    def _load_cache(self):
        try:
            if os.path.exists(self.cache_file):
                with open(self.cache_file, "r") as f:
                    return set(json.load(f))
        except Exception as e:
            log.warning("Could not load cache: %s", e)
        return set()

    def _save_cache(self):
        try:
            with open(self.cache_file, "w") as f:
                json.dump(list(self.processed_users), f)
        except Exception as e:
            log.error("Could not save cache: %s", e)

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def authenticate(self):
        """Get a fresh JWT token from the OpenSILEX API."""
        try:
            resp = requests.post(
                f"{self.api_url}/security/authenticate",
                json={"identifier": self.admin_email, "password": self.admin_password},
                timeout=10,
            )
            if resp.status_code == 200:
                self.token = resp.json().get("result", {}).get("token")
                if self.token:
                    return True
            log.error("Auth failed: %s", resp.status_code)
        except Exception as e:
            log.error("Auth error: %s", e)
        return False

    def _request(self, method, path, **kwargs):
        """Make an authenticated request with automatic token refresh."""
        kwargs.setdefault("headers", self._headers())
        kwargs.setdefault("timeout", 15)
        resp = getattr(requests, method)(f"{self.api_url}{path}", **kwargs)
        if resp.status_code == 401:
            log.info("Token expired, re-authenticating...")
            if self.authenticate():
                kwargs["headers"] = self._headers()
                resp = getattr(requests, method)(f"{self.api_url}{path}", **kwargs)
        return resp

    def get_all_users(self):
        """Fetch all user accounts from the API."""
        try:
            resp = self._request("get", "/security/users")
            if resp.status_code == 200:
                return resp.json().get("result", [])
            log.error("Failed to list users: %s", resp.status_code)
        except Exception as e:
            log.error("Error listing users: %s", e)
        return []

    def get_group(self):
        """Get the Users group details including current user_profiles."""
        try:
            encoded_uri = requests.utils.quote(DEFAULT_GROUP_URI, safe="")
            resp = self._request("get", f"/security/groups/{encoded_uri}")
            if resp.status_code == 200:
                return resp.json().get("result", {})
            log.error("Failed to get group: %s %s", resp.status_code, resp.text[:200])
        except Exception as e:
            log.error("Error getting group: %s", e)
        return None

    def get_group_member_uris(self):
        """Return set of user URIs currently in the Users group."""
        group = self.get_group()
        if not group:
            return set()
        members = set()
        for up in group.get("user_profiles", []):
            uri = up.get("user_uri")
            if uri:
                members.add(uri)
        return members

    def add_user_to_group(self, user_uri, user_email):
        """Add a user to the Users group via REST API PUT."""
        group = self.get_group()
        if not group:
            log.error("Cannot add user %s: failed to fetch group", user_email)
            return False

        # Check if user is already in the group
        existing_profiles = group.get("user_profiles", [])
        for up in existing_profiles:
            if up.get("user_uri") == user_uri:
                log.info("User %s already in group", user_email)
                return True

        # Add new user_profile entry
        existing_profiles.append({
            "user_uri": user_uri,
            "profile_uri": DEFAULT_PROFILE_URI,
        })

        # PUT the updated group (preserves all existing members)
        update_body = {
            "uri": group["uri"],
            "name": group["name"],
            "description": group.get("description", ""),
            "user_profiles": existing_profiles,
        }

        try:
            resp = self._request("put", "/security/groups", json=update_body)
            if resp.status_code == 200:
                log.info("Assigned %s to Users group", user_email)
                return True
            log.error(
                "Failed to update group for %s: %s %s",
                user_email, resp.status_code, resp.text[:200],
            )
        except Exception as e:
            log.error("Error updating group for %s: %s", user_email, e)
        return False

    def process_users(self):
        """Check for new users and assign them to the group."""
        if not self.token and not self.authenticate():
            return

        users = self.get_all_users()
        if not users:
            return

        current_members = self.get_group_member_uris()

        for user in users:
            user_uri = user.get("uri")
            user_email = user.get("email", "unknown")
            if not user_uri:
                continue
            if user_email == self.admin_email:
                continue
            if user_uri in current_members or user_uri in self.processed_users:
                continue

            log.info("New user detected: %s", user_email)
            if self.add_user_to_group(user_uri, user_email):
                self.processed_users.add(user_uri)
                self._save_cache()

    def run(self):
        """Main loop."""
        log.info("Starting auto-group monitor (REST API mode)")
        log.info("  API:   %s", self.api_url)
        log.info("  Group: %s", DEFAULT_GROUP_URI)

        while True:
            try:
                self.process_users()
            except KeyboardInterrupt:
                log.info("Shutting down")
                break
            except Exception as e:
                log.error("Unexpected error: %s", e)
            time.sleep(CHECK_INTERVAL)


def main():
    parser = argparse.ArgumentParser(description="OpenSILEX auto-group monitor (REST API)")
    parser.add_argument("--api-url", required=True, help="OpenSILEX REST API base URL (e.g. http://localhost:28081/rest)")
    parser.add_argument("--email", default="admin@opensilex.org", help="Admin email")
    parser.add_argument("--password", default="admin", help="Admin password")
    parser.add_argument("--cache-file", default="/opt/opensilex-auto-groups/processed_users.json",
                        help="Path to processed users cache")
    args = parser.parse_args()

    monitor = AutoGroupMonitor(
        api_url=args.api_url,
        admin_email=args.email,
        admin_password=args.password,
        cache_file=args.cache_file,
    )
    monitor.run()


if __name__ == "__main__":
    main()
