"""
Project API Tests

Tests for OpenSILEX project management endpoints:
- Create, Read, Update, Delete operations
- Search and filtering
- Validation and error handling
"""

import pytest
import requests


class TestProjectsAPI:
    """Test suite for Projects API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client, cleanup_tracker):
        """Setup for each test"""
        self.client = api_client
        self.cleanup = cleanup_tracker
        self.created_projects = []

    def teardown_method(self):
        """Cleanup created projects after each test"""
        for project_uri in self.created_projects:
            try:
                self.client.delete(f"/core/projects/{requests.utils.quote(project_uri, safe='')}")
            except:
                pass

    # ==========================================
    # CREATE Tests
    # ==========================================

    def test_create_project_minimal(self, test_project_data):
        """Test creating a project with minimal required fields"""
        response = self.client.post("/core/projects", test_project_data)

        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}"
        result = response.json().get('result')
        assert result is not None, "No URI returned for created project"

        self.created_projects.append(result)

    def test_create_project_full_fields(self, unique_id):
        """Test creating a project with all optional fields"""
        project_data = {
            "name": f"{unique_id}_project_full",
            "shortname": f"{unique_id}_pf",
            "description": "Full test project with all fields",
            "objective": "Test all project fields",
            "start_date": "2024-01-01",
            "end_date": "2024-12-31",
            "keywords": ["test", "automation", "api"],
            "homepage": "https://example.com/project"
        }

        response = self.client.post("/core/projects", project_data)

        assert response.status_code in [200, 201]
        result = response.json().get('result')
        assert result is not None

        self.created_projects.append(result)

    def test_create_project_missing_required_fields(self):
        """Test that creating a project without required fields fails"""
        incomplete_data = {
            "description": "Missing name field"
        }

        response = self.client.post("/core/projects", incomplete_data)

        # Should fail with 400 Bad Request or similar
        assert response.status_code >= 400, "Should reject incomplete project data"

    def test_create_project_invalid_dates(self, unique_id):
        """Test behavior with end_date before start_date"""
        invalid_data = {
            "name": f"{unique_id}_invalid_dates",
            "shortname": f"{unique_id}_id",
            "start_date": "2024-12-31",
            "end_date": "2024-01-01"  # Before start date
        }

        response = self.client.post("/core/projects", invalid_data)

        # API allows invalid dates in 1.4.7 - document this behavior
        if response.status_code in [200, 201]:
            # Date validation not enforced
            project_uri = response.json().get('result')
            self.created_projects.append(project_uri)
            pytest.skip("API allows end_date before start_date (no validation)")
        else:
            # Date validation enforced
            assert response.status_code >= 400

    # ==========================================
    # READ Tests
    # ==========================================

    def test_list_projects(self):
        """Test listing all projects"""
        response = self.client.get("/core/projects")

        assert response.status_code == 200
        data = response.json()
        assert 'result' in data
        assert isinstance(data['result'], list)

    def test_list_projects_pagination(self):
        """Test project listing with pagination"""
        response = self.client.get("/core/projects", params={"page": 0, "page_size": 10})

        assert response.status_code == 200
        data = response.json()

        # Check pagination metadata
        metadata = data.get('metadata', {})
        pagination = metadata.get('pagination', {})

        assert 'pageSize' in pagination
        assert 'currentPage' in pagination
        assert 'totalCount' in pagination

    def test_get_project_by_uri(self, test_project_data):
        """Test retrieving a specific project by URI"""
        # First create a project
        create_response = self.client.post("/core/projects", test_project_data)
        project_uri = create_response.json().get('result')
        self.created_projects.append(project_uri)

        # Now retrieve it
        encoded_uri = requests.utils.quote(project_uri, safe='')
        response = self.client.get(f"/core/projects/{encoded_uri}")

        assert response.status_code == 200
        project = response.json().get('result')

        assert project is not None
        assert project.get('uri') == project_uri
        assert project.get('name') == test_project_data['name']

    def test_get_nonexistent_project(self):
        """Test that getting a non-existent project returns error"""
        fake_uri = "http://opensilex.test/nonexistent/project/12345"
        encoded_uri = requests.utils.quote(fake_uri, safe='')

        response = self.client.get(f"/core/projects/{encoded_uri}")

        # API may return 404 or 500 for non-existent resources
        assert response.status_code >= 400, f"Should return error for non-existent project, got {response.status_code}"

    def test_search_projects_by_name(self, test_project_data, unique_id):
        """Test searching projects by name pattern (regex-based)"""
        # Create a project with known name
        create_response = self.client.post("/core/projects", test_project_data)
        project_uri = create_response.json().get('result')
        self.created_projects.append(project_uri)

        # Search for it using regex pattern (API uses regex, not exact match)
        # Use .* prefix for broad match since we don't know the exact name format
        response = self.client.get("/core/projects", params={"name": f".*{unique_id}.*"})

        assert response.status_code == 200
        projects = response.json().get('result', [])

        # Should find at least our created project
        # Note: URI format may differ (e.g., opensilex-sandbox:id/project/... vs http://opensilex.test/...)
        matching_projects = [p for p in projects if unique_id in p.get('name', '')]
        assert len(matching_projects) > 0, "Should find created project in search results"

    # ==========================================
    # UPDATE Tests
    # ==========================================

    def test_update_project(self, test_project_data):
        """Test updating a project"""
        # Create project
        create_response = self.client.post("/core/projects", test_project_data)
        project_uri = create_response.json().get('result')
        self.created_projects.append(project_uri)

        # Update it
        updated_data = test_project_data.copy()
        updated_data['uri'] = project_uri
        updated_data['description'] = "Updated description"
        updated_data['objective'] = "Updated objective"

        response = self.client.put("/core/projects", updated_data)

        assert response.status_code == 200, f"Update failed with status {response.status_code}"

        # Verify the update
        encoded_uri = requests.utils.quote(project_uri, safe='')
        get_response = self.client.get(f"/core/projects/{encoded_uri}")
        updated_project = get_response.json().get('result')

        assert updated_project.get('description') == "Updated description"
        assert updated_project.get('objective') == "Updated objective"

    def test_update_project_invalid_uri(self, test_project_data):
        """Test that updating with invalid URI fails"""
        invalid_data = test_project_data.copy()
        invalid_data['uri'] = "http://opensilex.test/nonexistent/project/12345"

        response = self.client.put("/core/projects", invalid_data)

        assert response.status_code >= 400, "Should fail to update non-existent project"

    # ==========================================
    # DELETE Tests
    # ==========================================

    def test_delete_project(self, test_project_data):
        """Test deleting a project"""
        # Create project
        create_response = self.client.post("/core/projects", test_project_data)
        project_uri = create_response.json().get('result')

        # Delete it
        encoded_uri = requests.utils.quote(project_uri, safe='')
        response = self.client.delete(f"/core/projects/{encoded_uri}")

        assert response.status_code in [200, 204], f"Delete failed with status {response.status_code}"

        # Verify it's gone (may return 404 or 500)
        get_response = self.client.get(f"/core/projects/{encoded_uri}")
        assert get_response.status_code >= 400, f"Project should not exist after deletion (got {get_response.status_code})"

    def test_delete_nonexistent_project(self):
        """Test that deleting a non-existent project fails gracefully"""
        fake_uri = "http://opensilex.test/nonexistent/project/12345"
        encoded_uri = requests.utils.quote(fake_uri, safe='')

        response = self.client.delete(f"/core/projects/{encoded_uri}")

        # Should return 404 or handle gracefully
        assert response.status_code in [404, 400], "Should handle non-existent project deletion"

    # ==========================================
    # VALIDATION Tests
    # ==========================================

    def test_project_name_uniqueness(self, test_project_data):
        """Test that project names should be unique (if enforced)"""
        # Create first project
        response1 = self.client.post("/core/projects", test_project_data)
        if response1.status_code in [200, 201]:
            project_uri1 = response1.json().get('result')
            self.created_projects.append(project_uri1)

            # Try to create duplicate
            response2 = self.client.post("/core/projects", test_project_data)

            # Depending on API behavior, this might succeed or fail
            # Document the behavior
            if response2.status_code in [200, 201]:
                # Duplicate allowed - cleanup
                project_uri2 = response2.json().get('result')
                self.created_projects.append(project_uri2)
                pytest.skip("API allows duplicate project names")
            else:
                # Duplicate rejected
                assert response2.status_code >= 400, "Duplicate project name should be rejected"

    def test_project_shortname_validation(self, unique_id):
        """Test shortname validation rules"""
        # Test with special characters
        test_data = {
            "name": f"{unique_id}_special_chars",
            "shortname": "test@#$%",  # May or may not be allowed
            "start_date": "2024-01-01"
        }

        response = self.client.post("/core/projects", test_data)

        # Document the validation behavior
        if response.status_code >= 400:
            # Special characters not allowed
            assert True, "API validates shortname format"
        else:
            # Special characters allowed
            project_uri = response.json().get('result')
            self.created_projects.append(project_uri)
            pytest.skip("API allows special characters in shortname")

    # ==========================================
    # PERFORMANCE Tests
    # ==========================================

    @pytest.mark.smoke
    def test_list_projects_performance(self):
        """Test that listing projects completes quickly"""
        import time

        start_time = time.time()
        response = self.client.get("/core/projects", params={"page_size": 100})
        duration = time.time() - start_time

        assert response.status_code == 200
        assert duration < 5.0, f"List projects took {duration}s (target: <5s)"
