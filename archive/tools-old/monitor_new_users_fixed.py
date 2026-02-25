#!/usr/bin/env python3
"""
Fixed OpenSILEX Auto-Groups Monitor - GraphDB SPARQL Direct Access
Bypasses broken OpenSILEX /security/groups API by querying GraphDB directly
"""

import requests
import json
import time
import logging
import os
import sys
import urllib.parse
from datetime import datetime

# Configuration
OPENSILEX_API_URL = "http://localhost:8666/rest"
GRAPHDB_URL = "http://localhost:7200"
GRAPHDB_REPO = "opensilex"
ADMIN_EMAIL = "admin@opensilex.org"
ADMIN_PASSWORD = "admin"
DEFAULT_GROUP_URI = "http://opensilex.org/groups/users"
DEFAULT_PROFILE_URI = "http://opensilex.org/profiles/default"
CHECK_INTERVAL = 60  # seconds
PROCESSED_USERS_FILE = "/opt/opensilex-auto-groups/processed_users.json"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('/var/log/opensilex-auto-groups.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class FixedAutoGroups:
    def __init__(self):
        self.token = None
        self.processed_users = self.load_processed_users()

    def load_processed_users(self):
        try:
            if os.path.exists(PROCESSED_USERS_FILE):
                with open(PROCESSED_USERS_FILE, 'r') as f:
                    return set(json.load(f))
        except Exception as e:
            logger.warning(f"Could not load processed users: {e}")
        return set()

    def save_processed_users(self):
        try:
            with open(PROCESSED_USERS_FILE, 'w') as f:
                json.dump(list(self.processed_users), f)
        except Exception as e:
            logger.error(f"Could not save processed users: {e}")

    def authenticate(self):
        """Authenticate with OpenSILEX API"""
        try:
            auth_data = {"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD}
            response = requests.post(f"{OPENSILEX_API_URL}/security/authenticate",
                                   json=auth_data)

            if response.status_code == 200:
                result = response.json()
                self.token = result.get('result', {}).get('token')
                if self.token:
                    logger.info("✅ Authenticated with OpenSILEX API")
                    return True

            logger.error(f"Authentication failed: {response.status_code}")
            return False
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            return False

    def get_users_from_api(self):
        """Get all users from OpenSILEX API"""
        try:
            headers = {"Authorization": f"Bearer {self.token}"}
            response = requests.get(f"{OPENSILEX_API_URL}/security/users", headers=headers)

            if response.status_code == 200:
                data = response.json()
                return data.get('result', [])
            else:
                logger.error(f"Failed to get users: {response.status_code}")
                return []
        except Exception as e:
            logger.error(f"Error getting users: {e}")
            return []

    def get_group_members_sparql(self):
        """Get group members directly from GraphDB via SPARQL"""
        try:
            query = f"""
PREFIX security: <http://www.opensilex.org/security#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

SELECT ?userUri WHERE {{
  <{DEFAULT_GROUP_URI}> security:hasUserProfile ?profile .
  ?profile security:hasUser ?userUri .
}}
"""
            response = requests.post(
                f"{GRAPHDB_URL}/repositories/{GRAPHDB_REPO}",
                headers={"Accept": "application/sparql-results+json"},
                data={"query": query}
            )

            if response.status_code == 200:
                data = response.json()
                members = set()
                for binding in data.get('results', {}).get('bindings', []):
                    user_uri = binding.get('userUri', {}).get('value')
                    if user_uri:
                        members.add(user_uri)
                logger.debug(f"Found {len(members)} members in Users group")
                return members
            else:
                logger.error(f"Failed to query GraphDB: {response.status_code}")
                return set()
        except Exception as e:
            logger.error(f"Error querying GraphDB: {e}")
            return set()

    def add_user_to_group_sparql(self, user_uri, user_email):
        """Add user to group directly via SPARQL INSERT"""
        try:
            # Generate a unique ID for the user profile
            import hashlib
            profile_id = abs(hash(user_uri + DEFAULT_GROUP_URI)) % (10**10)
            profile_uri = f"http://phis.pheno.no/id/group/{profile_id}"

            query = f"""
PREFIX security: <http://www.opensilex.org/security#>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

INSERT DATA {{
  GRAPH <http://www.opensilex.org/security> {{
    <{DEFAULT_GROUP_URI}> security:hasUserProfile <{profile_uri}> .
    <{profile_uri}> rdf:type security:UserProfile ;
                     security:hasUser <{user_uri}> ;
                     security:hasProfile <{DEFAULT_PROFILE_URI}> .
  }}
}}
"""
            response = requests.post(
                f"{GRAPHDB_URL}/repositories/{GRAPHDB_REPO}/statements",
                headers={"Content-Type": "application/sparql-update"},
                data=query
            )

            if response.status_code == 204 or response.status_code == 200:
                logger.info(f"✅ Successfully assigned {user_email} to Users group")
                return True
            else:
                logger.error(f"Failed to insert into GraphDB: {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Error inserting into GraphDB: {e}")
            return False

    def process_new_users(self):
        """Process new users and assign to group"""
        try:
            if not self.token and not self.authenticate():
                logger.warning("Failed to authenticate")
                return

            # Get all users from API
            users = self.get_users_from_api()
            if not users:
                logger.debug("No users returned from API")
                return

            # Get current group members from GraphDB
            current_members = self.get_group_members_sparql()

            # Process each user
            new_users_found = False
            for user in users:
                user_uri = user.get('uri')
                user_email = user.get('email', 'unknown')

                if not user_uri:
                    continue

                # Skip admin user
                if user_email == ADMIN_EMAIL:
                    continue

                # Check if user needs to be added to group
                if user_uri not in current_members and user_uri not in self.processed_users:
                    logger.info(f"🆕 New user detected: {user_email}")
                    if self.add_user_to_group_sparql(user_uri, user_email):
                        self.processed_users.add(user_uri)
                        self.save_processed_users()
                        new_users_found = True
                    else:
                        logger.error(f"Failed to assign {user_email}")

            if not new_users_found:
                logger.debug(f"No new users to process (Total users: {len(users)})")

        except Exception as e:
            logger.error(f"Error in process_new_users: {e}")
            import traceback
            traceback.print_exc()

    def run_monitor(self):
        """Main monitoring loop"""
        logger.info("🚀 Starting OpenSILEX Auto-Groups Monitor (GraphDB Direct Mode)")
        logger.info(f"✅ Using GraphDB at {GRAPHDB_URL}")
        logger.info(f"✅ Bypassing broken OpenSILEX /security/groups API")

        while True:
            try:
                self.process_new_users()
                time.sleep(CHECK_INTERVAL)
            except KeyboardInterrupt:
                logger.info("Shutting down monitor...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in monitor loop: {e}")
                time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    monitor = FixedAutoGroups()
    monitor.run_monitor()
