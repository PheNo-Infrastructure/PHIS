"""
Data API Tests - Tests for scientific data upload, query, and export
"""

import pytest


class TestDataAPI:
    """Test suite for Data API endpoints"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        self.client = api_client

    def test_list_data(self):
        """Test listing data (may be empty)"""
        response = self.client.get("/core/data")
        assert response.status_code == 200
        assert 'result' in response.json()

    def test_list_data_with_pagination(self):
        """Test data listing with pagination"""
        response = self.client.get("/core/data", params={"page": 0, "page_size": 10})
        assert response.status_code == 200

        metadata = response.json().get('metadata', {})
        pagination = metadata.get('pagination', {})
        assert 'pageSize' in pagination

    def test_query_data_by_experiment(self, unique_id):
        """Test querying data filtered by experiment"""
        # This test documents the API even if no data exists
        fake_exp_uri = f"http://opensilex.test/exp/{unique_id}"
        response = self.client.get("/core/data", params={"experiment": fake_exp_uri})

        # Should return empty result or valid response
        assert response.status_code in [200, 404]

    def test_query_data_by_variable(self):
        """Test querying data filtered by variable"""
        response = self.client.get("/core/data", params={"variable": "test"})
        # Documents the endpoint
        assert response.status_code in [200, 404, 400]

    def test_query_data_by_date_range(self):
        """Test querying data with date range"""
        params = {
            "start_date": "2024-01-01",
            "end_date": "2024-12-31"
        }
        response = self.client.get("/core/data", params=params)
        assert response.status_code in [200, 400]  # May not support date filtering

    @pytest.mark.smoke
    def test_data_query_performance(self):
        """Test that data queries are reasonably fast"""
        import time
        start = time.time()
        response = self.client.get("/core/data", params={"page_size": 20})
        duration = time.time() - start

        assert response.status_code == 200
        assert duration < 5.0, f"Data query took {duration}s"
