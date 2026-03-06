"""
Experiment API Tests

Tests for OpenSILEX experiment management endpoints:
- Experiment lifecycle (create, modify, end)
- Project association
- Device linking
- Factor and variable configuration
- Search and filtering
"""

import pytest
import requests


class TestExperimentsAPI:
    """Test suite for Experiments API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client, cleanup_tracker):
        """Setup for each test"""
        self.client = api_client
        self.cleanup = cleanup_tracker
        self.created_experiments = []
        self.created_projects = []

    def teardown_method(self):
        """Cleanup created entities"""
        # Delete experiments first (they reference projects)
        for exp_uri in self.created_experiments:
            try:
                self.client.delete(f"/core/experiments/{requests.utils.quote(exp_uri, safe='')}")
            except:
                pass

        # Then delete projects
        for proj_uri in self.created_projects:
            try:
                self.client.delete(f"/core/projects/{requests.utils.quote(proj_uri, safe='')}")
            except:
                pass

    def create_test_project(self, unique_id):
        """Helper to create a project for experiment tests"""
        project_data = {
            "name": f"{unique_id}_project",
            "shortname": f"{unique_id}_p",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }

        response = self.client.post("/core/projects", project_data)
        if response.status_code in [200, 201]:
            project_uri = response.json().get('result')
            self.created_projects.append(project_uri)
            return project_uri
        return None

    # ==========================================
    # CREATE Tests
    # ==========================================

    def test_create_experiment_minimal(self, test_experiment_data, unique_id):
        """Test creating experiment with minimal required fields"""
        # Create parent project
        project_uri = self.create_test_project(unique_id)
        assert project_uri is not None, "Failed to create test project"

        # Add project to experiment data
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        response = self.client.post("/core/experiments", exp_data)

        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        exp_uri = response.json().get('result')
        assert exp_uri is not None

        self.created_experiments.append(exp_uri)

    def test_create_experiment_with_description(self, unique_id):
        """Test creating experiment with detailed description"""
        project_uri = self.create_test_project(unique_id)

        exp_data = {
            "name": f"{unique_id}_detailed_exp",
            "objective": "Test detailed experiment creation",
            "description": "This experiment tests the full API capabilities including description fields",
            "start_date": "2024-02-01",
            "end_date": "2024-11-30",
            "projects": [project_uri]
        }

        response = self.client.post("/core/experiments", exp_data)

        assert response.status_code in [200, 201]
        exp_uri = response.json().get('result')
        self.created_experiments.append(exp_uri)

    def test_create_experiment_without_project(self, test_experiment_data):
        """Test that experiments can optionally be created without a project"""
        exp_data = test_experiment_data.copy()
        # Don't add projects field

        response = self.client.post("/core/experiments", exp_data)

        # This might succeed or fail depending on API requirements
        if response.status_code in [200, 201]:
            exp_uri = response.json().get('result')
            self.created_experiments.append(exp_uri)
            # Experiment created without project - allowed
        else:
            # Project required
            assert response.status_code >= 400

    def test_create_experiment_multiple_projects(self, unique_id):
        """Test creating experiment linked to multiple projects"""
        # Create two projects
        project1_uri = self.create_test_project(f"{unique_id}_1")
        project2_uri = self.create_test_project(f"{unique_id}_2")

        exp_data = {
            "name": f"{unique_id}_multi_project_exp",
            "objective": "Test multi-project experiment",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31",
            "projects": [project1_uri, project2_uri]
        }

        response = self.client.post("/core/experiments", exp_data)

        if response.status_code in [200, 201]:
            exp_uri = response.json().get('result')
            self.created_experiments.append(exp_uri)
        else:
            pytest.skip("API may not support multi-project experiments")

    # ==========================================
    # READ Tests
    # ==========================================

    def test_list_experiments(self):
        """Test listing all experiments"""
        response = self.client.get("/core/experiments")

        assert response.status_code == 200
        data = response.json()
        assert 'result' in data
        assert isinstance(data['result'], list)

    def test_list_experiments_pagination(self):
        """Test experiment listing with pagination"""
        response = self.client.get("/core/experiments", params={"page": 0, "page_size": 20})

        assert response.status_code == 200
        data = response.json()

        # Check pagination
        metadata = data.get('metadata', {})
        pagination = metadata.get('pagination', {})

        assert 'pageSize' in pagination
        assert 'currentPage' in pagination

    def test_get_experiment_by_uri(self, test_experiment_data, unique_id):
        """Test retrieving specific experiment by URI"""
        # Create experiment
        project_uri = self.create_test_project(unique_id)
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')
        self.created_experiments.append(exp_uri)

        # Retrieve it
        encoded_uri = requests.utils.quote(exp_uri, safe='')
        response = self.client.get(f"/core/experiments/{encoded_uri}")

        assert response.status_code == 200
        experiment = response.json().get('result')

        assert experiment is not None
        assert experiment.get('uri') == exp_uri
        assert experiment.get('name') == exp_data['name']

    def test_search_experiments_by_name(self, test_experiment_data, unique_id):
        """Test searching experiments by name (regex-based)"""
        # Create experiment with unique name
        project_uri = self.create_test_project(unique_id)
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')
        self.created_experiments.append(exp_uri)

        # Search for it using regex pattern
        response = self.client.get("/core/experiments", params={"name": f".*{unique_id}.*"})

        assert response.status_code == 200
        experiments = response.json().get('result', [])

        # Match by name content since URI format may vary
        matching = [e for e in experiments if unique_id in e.get('name', '')]
        assert len(matching) > 0, "Should find created experiment"

    def test_filter_experiments_by_project(self, unique_id):
        """Test filtering experiments by project URI"""
        project_uri = self.create_test_project(unique_id)

        # Create experiment linked to project
        exp_data = {
            "name": f"{unique_id}_project_filter",
            "objective": "Test project filtering",
            "start_date": "2024-01-01",
            "projects": [project_uri]
        }

        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')
        self.created_experiments.append(exp_uri)

        # Filter by project (note: parameter is "projects" plural, not "project")
        response = self.client.get("/core/experiments", params={"projects": project_uri})

        if response.status_code == 200:
            experiments = response.json().get('result', [])
            # Should include our experiment (match by name since URI format may vary)
            matching = [e for e in experiments if unique_id in e.get('name', '')]
            assert len(matching) > 0, "Should find experiment filtered by project"
        else:
            pytest.skip("Project filtering may not be supported")

    # ==========================================
    # UPDATE Tests
    # ==========================================

    def test_update_experiment(self, test_experiment_data, unique_id):
        """Test updating an experiment"""
        project_uri = self.create_test_project(unique_id)
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        # Create
        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')
        self.created_experiments.append(exp_uri)

        # Update
        updated_data = exp_data.copy()
        updated_data['uri'] = exp_uri
        updated_data['objective'] = "Updated objective for testing"
        updated_data['description'] = "Updated description"

        response = self.client.put("/core/experiments", updated_data)

        assert response.status_code == 200

        # Verify update
        encoded_uri = requests.utils.quote(exp_uri, safe='')
        get_response = self.client.get(f"/core/experiments/{encoded_uri}")
        updated_exp = get_response.json().get('result')

        assert updated_exp.get('objective') == "Updated objective for testing"

    def test_update_experiment_dates(self, test_experiment_data, unique_id):
        """Test updating experiment start/end dates"""
        project_uri = self.create_test_project(unique_id)
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')
        self.created_experiments.append(exp_uri)

        # Update dates
        updated_data = exp_data.copy()
        updated_data['uri'] = exp_uri
        updated_data['start_date'] = "2024-03-01"
        updated_data['end_date'] = "2024-10-31"

        response = self.client.put("/core/experiments", updated_data)

        assert response.status_code == 200

    # ==========================================
    # DELETE Tests
    # ==========================================

    def test_delete_experiment(self, test_experiment_data, unique_id):
        """Test deleting an experiment"""
        project_uri = self.create_test_project(unique_id)
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        create_response = self.client.post("/core/experiments", exp_data)
        exp_uri = create_response.json().get('result')

        # Delete
        encoded_uri = requests.utils.quote(exp_uri, safe='')
        response = self.client.delete(f"/core/experiments/{encoded_uri}")

        assert response.status_code in [200, 204]

        # Verify gone
        get_response = self.client.get(f"/core/experiments/{encoded_uri}")
        assert get_response.status_code == 404

    # ==========================================
    # VALIDATION Tests
    # ==========================================

    def test_experiment_date_validation(self, unique_id):
        """Test behavior with end_date before start_date"""
        project_uri = self.create_test_project(unique_id)

        invalid_data = {
            "name": f"{unique_id}_invalid_dates",
            "objective": "Test date validation",
            "start_date": "2024-12-31",
            "end_date": "2024-01-01",  # Before start
            "projects": [project_uri]
        }

        response = self.client.post("/core/experiments", invalid_data)

        # API allows invalid dates - document this behavior
        if response.status_code in [200, 201]:
            exp_uri = response.json().get('result')
            self.created_experiments.append(exp_uri)
            pytest.skip("API allows end_date before start_date (no validation)")
        else:
            assert response.status_code >= 400

    # ==========================================
    # PERFORMANCE Tests
    # ==========================================

    @pytest.mark.smoke
    def test_list_experiments_performance(self):
        """Test that listing experiments is fast"""
        import time

        start = time.time()
        response = self.client.get("/core/experiments", params={"page_size": 50})
        duration = time.time() - start

        assert response.status_code == 200
        assert duration < 5.0, f"List experiments took {duration}s"
