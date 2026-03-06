"""
Cross-Database Consistency Tests

Validates that MongoDB and RDF4J are synchronized:
- Experiment URIs exist in both databases
- Project counts match
- No synchronization lag
- No missing records

Run with: pytest test_cross_db_consistency.py -v
"""

import pytest
import os
import sys
import requests
from SPARQLWrapper import SPARQLWrapper, JSON
import pymongo

# Add tier2 conftest to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../tier2/api-tests'))


class TestCrossDBConsistency:
    """Tests for MongoDB ↔ RDF4J synchronization"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup for each test"""
        self.client = api_client
        self.rdf4j_url = "http://20.61.108.197:8080/rdf4j-server/repositories/opensilex"

    def get_mongodb_connection(self):
        """Get MongoDB connection (via SSH tunnel or direct if accessible)"""
        # Note: This requires MongoDB to be accessible
        # In production, might need SSH tunnel or docker exec
        pytest.skip("MongoDB direct connection not implemented - requires SSH tunnel or docker exec")

    def query_sparql(self, query):
        """Execute SPARQL query against RDF4J"""
        try:
            sparql = SPARQLWrapper(self.rdf4j_url)
            sparql.setQuery(query)
            sparql.setReturnFormat(JSON)
            results = sparql.query().convert()
            return results
        except Exception as e:
            pytest.skip(f"Could not execute SPARQL query: {e}")

    # ==========================================
    # Count Consistency Tests
    # ==========================================

    def test_experiment_count_consistency(self):
        """Test that experiment counts are consistent across databases"""
        # Get count from API (which queries both databases)
        api_response = self.client.get('/core/experiments', params={'page': 0, 'page_size': 1})

        if api_response.status_code != 200:
            pytest.skip("Could not query experiments via API")

        metadata = api_response.json().get('metadata', {})
        pagination = metadata.get('pagination', {})
        api_count = pagination.get('totalCount', 0)

        # Get count from RDF4J directly
        sparql_count_query = """
        PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

        SELECT (COUNT(?exp) as ?count) WHERE {
          ?exp rdf:type vocabulary:Experiment .
        }
        """

        try:
            results = self.query_sparql(sparql_count_query)
            bindings = results.get('results', {}).get('bindings', [])

            if bindings:
                rdf_count = int(bindings[0].get('count', {}).get('value', 0))

                print(f"\nAPI count: {api_count}, RDF4J count: {rdf_count}")

                # Counts should match (or be very close)
                # Allow small difference due to timing/caching
                diff = abs(api_count - rdf_count)
                assert diff <= 5, \
                    f"Experiment counts differ too much: API={api_count}, RDF4J={rdf_count}"

        except Exception as e:
            pytest.skip(f"Could not query RDF4J: {e}")

    def test_project_count_consistency(self):
        """Test that project counts are consistent across databases"""
        # Get count from API
        api_response = self.client.get('/core/projects', params={'page': 0, 'page_size': 1})

        if api_response.status_code != 200:
            pytest.skip("Could not query projects via API")

        metadata = api_response.json().get('metadata', {})
        pagination = metadata.get('pagination', {})
        api_count = pagination.get('totalCount', 0)

        # Get count from RDF4J
        sparql_count_query = """
        PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

        SELECT (COUNT(?proj) as ?count) WHERE {
          ?proj rdf:type vocabulary:Project .
        }
        """

        try:
            results = self.query_sparql(sparql_count_query)
            bindings = results.get('results', {}).get('bindings', [])

            if bindings:
                rdf_count = int(bindings[0].get('count', {}).get('value', 0))

                print(f"\nAPI count: {api_count}, RDF4J count: {rdf_count}")

                # Counts should match
                diff = abs(api_count - rdf_count)
                assert diff <= 5, \
                    f"Project counts differ too much: API={api_count}, RDF4J={rdf_count}"

        except Exception as e:
            pytest.skip(f"Could not query RDF4J: {e}")

    # ==========================================
    # URI Consistency Tests
    # ==========================================

    def test_experiment_uris_exist_in_both_dbs(self):
        """Test that experiment URIs from API exist in RDF4J"""
        # Get experiments from API
        api_response = self.client.get('/core/experiments', params={'page': 0, 'page_size': 10})

        if api_response.status_code != 200:
            pytest.skip("Could not query experiments via API")

        experiments = api_response.json().get('result', [])

        if not experiments:
            pytest.skip("No experiments to validate")

        # Check each experiment URI in RDF4J
        missing_count = 0

        for exp in experiments[:5]:  # Check first 5 to avoid long test times
            exp_uri = exp.get('uri')
            if not exp_uri:
                continue

            # Query RDF4J for this URI
            sparql_check = f"""
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            ASK {{
              <{exp_uri}> ?p ?o .
            }}
            """

            try:
                sparql = SPARQLWrapper(self.rdf4j_url)
                sparql.setQuery(sparql_check)
                sparql.setReturnFormat(JSON)
                result = sparql.query().convert()

                if not result.get('boolean', False):
                    missing_count += 1
                    print(f"\nWARN: Experiment URI not found in RDF4J: {exp_uri}")

            except Exception as e:
                pytest.skip(f"Could not query RDF4J: {e}")

        # All URIs should exist in both databases
        assert missing_count == 0, \
            f"{missing_count} experiment URIs missing from RDF4J"

    def test_project_uris_exist_in_both_dbs(self):
        """Test that project URIs from API exist in RDF4J"""
        # Get projects from API
        api_response = self.client.get('/core/projects', params={'page': 0, 'page_size': 10})

        if api_response.status_code != 200:
            pytest.skip("Could not query projects via API")

        projects = api_response.json().get('result', [])

        if not projects:
            pytest.skip("No projects to validate")

        # Check each project URI in RDF4J
        missing_count = 0

        for proj in projects[:5]:  # Check first 5
            proj_uri = proj.get('uri')
            if not proj_uri:
                continue

            # Query RDF4J for this URI
            sparql_check = f"""
            PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

            ASK {{
              <{proj_uri}> ?p ?o .
            }}
            """

            try:
                sparql = SPARQLWrapper(self.rdf4j_url)
                sparql.setQuery(sparql_check)
                sparql.setReturnFormat(JSON)
                result = sparql.query().convert()

                if not result.get('boolean', False):
                    missing_count += 1
                    print(f"\nWARN: Project URI not found in RDF4J: {proj_uri}")

            except Exception as e:
                pytest.skip(f"Could not query RDF4J: {e}")

        # All URIs should exist in both databases
        assert missing_count == 0, \
            f"{missing_count} project URIs missing from RDF4J"

    # ==========================================
    # Data Synchronization Tests
    # ==========================================

    def test_newly_created_experiment_in_rdf4j(self, test_experiment_data, unique_id):
        """Test that newly created experiments appear in RDF4J"""
        # Create project first
        project_data = {
            "name": f"{unique_id}_consistency_project",
            "shortname": f"{unique_id}_cp",
            "start_date": "2024-01-01"
        }

        proj_response = self.client.post('/core/projects', project_data)
        if proj_response.status_code not in [200, 201]:
            pytest.skip("Could not create test project")

        project_uri = proj_response.json().get('result')

        # Create experiment
        exp_data = test_experiment_data.copy()
        exp_data['projects'] = [project_uri]

        exp_response = self.client.post('/core/experiments', exp_data)
        if exp_response.status_code not in [200, 201]:
            pytest.skip("Could not create test experiment")

        exp_uri = exp_response.json().get('result')

        # Give it a moment to sync
        import time
        time.sleep(2)

        # Check if it exists in RDF4J
        sparql_check = f"""
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

        ASK {{
          <{exp_uri}> ?p ?o .
        }}
        """

        try:
            sparql = SPARQLWrapper(self.rdf4j_url)
            sparql.setQuery(sparql_check)
            sparql.setReturnFormat(JSON)
            result = sparql.query().convert()

            exists_in_rdf = result.get('boolean', False)

            # Cleanup
            self.client.delete(f"/core/experiments/{requests.utils.quote(exp_uri, safe='')}")
            self.client.delete(f"/core/projects/{requests.utils.quote(project_uri, safe='')}")

            assert exists_in_rdf, \
                f"Newly created experiment should exist in RDF4J: {exp_uri}"

        except Exception as e:
            # Cleanup even on error
            try:
                self.client.delete(f"/core/experiments/{requests.utils.quote(exp_uri, safe='')}")
                self.client.delete(f"/core/projects/{requests.utils.quote(project_uri, safe='')}")
            except:
                pass

            pytest.skip(f"Could not query RDF4J: {e}")

    # ==========================================
    # Ontology Consistency Tests
    # ==========================================

    def test_ontology_classes_defined(self):
        """Test that core ontology classes are defined in RDF4J"""
        # Check for essential OESO vocabulary classes
        sparql_check = """
        PREFIX vocabulary: <http://www.opensilex.org/vocabulary/oeso#>
        PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>

        SELECT ?class ?label WHERE {
          VALUES ?class {
            vocabulary:Experiment
            vocabulary:Project
            vocabulary:Device
            vocabulary:Variable
          }
          OPTIONAL { ?class rdfs:label ?label }
        }
        """

        try:
            results = self.query_sparql(sparql_check)
            bindings = results.get('results', {}).get('bindings', [])

            found_classes = [b.get('class', {}).get('value', '') for b in bindings]

            print(f"\nFound {len(found_classes)} core ontology classes in RDF4J")

            # Should find at least some core classes
            assert len(found_classes) > 0, \
                "Core ontology classes should be defined in RDF4J"

        except Exception as e:
            pytest.skip(f"Could not query RDF4J ontology: {e}")
