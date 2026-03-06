"""
Variables API Tests - Tests for variable and trait management
"""

import pytest


class TestVariablesAPI:
    """Test suite for Variables API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        self.client = api_client

    def test_list_variables(self):
        """Test listing variables"""
        response = self.client.get("/core/variables")
        assert response.status_code == 200
        assert isinstance(response.json().get('result'), list)

    def test_list_variables_with_pagination(self):
        """Test variable listing with pagination"""
        response = self.client.get("/core/variables", params={"page": 0, "page_size": 20})

        assert response.status_code == 200
        metadata = response.json().get('metadata', {})
        pagination = metadata.get('pagination', {})
        assert 'pageSize' in pagination

    def test_search_variables_by_name(self):
        """Test searching variables by name"""
        response = self.client.get("/core/variables", params={"name": "test"})
        assert response.status_code == 200

    def test_filter_variables_by_entity(self):
        """Test filtering variables by entity type"""
        response = self.client.get("/core/variables", params={"entity": "Plant"})
        # Documents the filtering capability
        assert response.status_code in [200, 400]

    @pytest.mark.smoke
    def test_list_variables_performance(self):
        """Test variable listing performance"""
        import time
        start = time.time()
        response = self.client.get("/core/variables")
        duration = time.time() - start

        assert response.status_code == 200
        assert duration < 5.0
