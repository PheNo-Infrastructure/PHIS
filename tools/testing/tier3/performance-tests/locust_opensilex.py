"""
Locust Load Testing for OpenSILEX

Simulates realistic scientific user behavior:
- User authentication
- Experiment management
- Data upload and queries
- Device operations

Usage:
  locust -f locust_opensilex.py --host http://20.61.108.197/sandbox/rest --users 50 --spawn-rate 5

Web UI:
  locust -f locust_opensilex.py --host http://20.61.108.197/sandbox/rest
  Then open http://localhost:8089
"""

import os
import random
import time
from locust import HttpUser, task, between, events
import requests


class OpenSILEXUser(HttpUser):
    """Simulates a scientist using OpenSILEX platform"""

    wait_time = between(1, 3)  # Wait 1-3 seconds between tasks

    def on_start(self):
        """Authenticate when user starts"""
        # Get credentials from environment
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
        password = os.environ.get('OPENSILEX_ADMIN_PASSWORD', 'admin')

        # Authenticate
        with self.client.post(
            "/security/authenticate",
            json={"identifier": email, "password": password},
            catch_response=True,
            name="POST /security/authenticate"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('result', {}).get('token')
                if self.token:
                    response.success()
                else:
                    response.failure("No token in response")
            else:
                response.failure(f"Auth failed: {response.status_code}")
                self.token = None

    def get_auth_headers(self):
        """Return authorization headers"""
        if self.token:
            return {"Authorization": f"Bearer {self.token}"}
        return {}

    @task(10)
    def list_projects(self):
        """Most common operation: list projects"""
        self.client.get(
            "/core/projects",
            params={"page": 0, "page_size": 20},
            headers=self.get_auth_headers(),
            name="GET /core/projects (list)"
        )

    @task(8)
    def list_experiments(self):
        """Second most common: list experiments"""
        self.client.get(
            "/core/experiments",
            params={"page": 0, "page_size": 20},
            headers=self.get_auth_headers(),
            name="GET /core/experiments (list)"
        )

    @task(5)
    def search_projects_by_name(self):
        """Search operations"""
        search_terms = ["test", ".*2024.*", ".*project.*"]
        term = random.choice(search_terms)
        self.client.get(
            "/core/projects",
            params={"name": term, "page_size": 20},
            headers=self.get_auth_headers(),
            name="GET /core/projects (search)"
        )

    @task(5)
    def list_devices(self):
        """List devices"""
        self.client.get(
            "/core/devices",
            params={"page": 0, "page_size": 20},
            headers=self.get_auth_headers(),
            name="GET /core/devices"
        )

    @task(3)
    def query_data(self):
        """Query experimental data"""
        self.client.get(
            "/core/data",
            params={"page": 0, "page_size": 50},
            headers=self.get_auth_headers(),
            name="GET /core/data"
        )

    @task(3)
    def list_variables(self):
        """List variables/ontologies"""
        self.client.get(
            "/core/variables",
            params={"page": 0, "page_size": 20},
            headers=self.get_auth_headers(),
            name="GET /core/variables"
        )

    @task(2)
    def create_project(self):
        """Less frequent: create new project"""
        unique_id = f"load_test_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

        project_data = {
            "name": f"{unique_id}_project",
            "shortname": f"{unique_id}_p",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }

        with self.client.post(
            "/core/projects",
            json=project_data,
            headers=self.get_auth_headers(),
            catch_response=True,
            name="POST /core/projects"
        ) as response:
            if response.status_code in [200, 201]:
                # Store URI for cleanup (in real implementation)
                response.success()
            else:
                response.failure(f"Failed to create project: {response.status_code}")

    @task(2)
    def get_user_info(self):
        """Get current user information"""
        self.client.get(
            "/security/users",
            params={"page": 0, "page_size": 10},
            headers=self.get_auth_headers(),
            name="GET /security/users"
        )

    @task(1)
    def create_experiment(self):
        """Rare but important: create experiment"""
        unique_id = f"load_test_{int(time.time() * 1000)}_{random.randint(1000, 9999)}"

        # First create a project (simplified - in real scenario would reuse existing)
        project_data = {
            "name": f"{unique_id}_project",
            "shortname": f"{unique_id}_p",
            "start_date": "2024-01-01"
        }

        proj_response = self.client.post(
            "/core/projects",
            json=project_data,
            headers=self.get_auth_headers(),
            name="POST /core/projects (for experiment)"
        )

        if proj_response.status_code in [200, 201]:
            project_uri = proj_response.json().get('result')

            # Now create experiment
            exp_data = {
                "name": f"{unique_id}_experiment",
                "objective": "Load test experiment",
                "start_date": "2024-02-01",
                "projects": [project_uri]
            }

            self.client.post(
                "/core/experiments",
                json=exp_data,
                headers=self.get_auth_headers(),
                name="POST /core/experiments"
            )


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Print test configuration when load test starts"""
    print("\n" + "="*60)
    print("OpenSILEX Load Testing Started")
    print("="*60)
    print(f"Target: {environment.host}")
    print(f"Users: {environment.runner.target_user_count if hasattr(environment.runner, 'target_user_count') else 'N/A'}")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Print summary when load test completes"""
    print("\n" + "="*60)
    print("OpenSILEX Load Testing Completed")
    print("="*60)

    stats = environment.stats
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Failed requests: {stats.total.num_failures}")
    print(f"Median response time: {stats.total.median_response_time}ms")
    print(f"95th percentile: {stats.total.get_response_time_percentile(0.95)}ms")
    print(f"99th percentile: {stats.total.get_response_time_percentile(0.99)}ms")
    print(f"Requests per second: {stats.total.total_rps:.2f}")
    print("="*60 + "\n")


if __name__ == "__main__":
    """Run from command line"""
    import sys

    # Check if running standalone
    if len(sys.argv) == 1:
        print("\nUsage:")
        print("  locust -f locust_opensilex.py --host http://YOUR_SERVER/rest")
        print("\nFor web UI:")
        print("  locust -f locust_opensilex.py --host http://YOUR_SERVER/rest")
        print("  Then open http://localhost:8089")
        print("\nFor headless mode:")
        print("  locust -f locust_opensilex.py --host http://YOUR_SERVER/rest --users 50 --spawn-rate 5 --run-time 5m --headless")
        sys.exit(0)
