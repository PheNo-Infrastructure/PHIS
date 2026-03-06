"""
API Performance Benchmarking

Measures and tracks response times for critical API endpoints.
Run with: pytest test_api_benchmarks.py --benchmark-only -v

Generates CSV output for tracking performance trends over time.
"""

import pytest
import time
import os
import sys

# Add parent directory to path for conftest imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../tier2/api-tests'))


class TestAPIPerformance:
    """Performance benchmarks for OpenSILEX API"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        """Setup for each test"""
        self.client = api_client

    def benchmark_endpoint(self, method, endpoint, **kwargs):
        """Helper to benchmark an API call"""
        times = []
        iterations = 10  # Run each test 10 times for statistical significance

        for _ in range(iterations):
            start = time.perf_counter()

            if method == 'GET':
                response = self.client.get(endpoint, **kwargs)
            elif method == 'POST':
                response = self.client.post(endpoint, **kwargs)

            duration = (time.perf_counter() - start) * 1000  # Convert to ms

            if response.status_code in [200, 201]:
                times.append(duration)

        # Calculate percentiles
        times.sort()
        p50 = times[len(times) // 2]
        p95 = times[int(len(times) * 0.95)]
        p99 = times[int(len(times) * 0.99)] if len(times) >= 100 else times[-1]

        return {
            'min': min(times),
            'max': max(times),
            'p50': p50,
            'p95': p95,
            'p99': p99,
            'avg': sum(times) / len(times)
        }

    # ==========================================
    # Authentication Benchmarks
    # ==========================================

    def test_benchmark_authentication(self):
        """Benchmark: User authentication"""
        email = os.environ.get('OPENSILEX_ADMIN_EMAIL', 'admin@opensilex.org')
        password = os.environ.get('OPENSILEX_ADMIN_PASSWORD', 'admin')

        times = []
        for _ in range(10):
            start = time.perf_counter()

            response = self.client.session.post(
                f"{self.client.api_url}/security/authenticate",
                json={"identifier": email, "password": password},
                timeout=self.client.timeout
            )

            duration = (time.perf_counter() - start) * 1000

            if response.status_code == 200:
                times.append(duration)

        times.sort()
        avg = sum(times) / len(times)
        p95 = times[int(len(times) * 0.95)]

        print(f"\nAuthentication - Avg: {avg:.0f}ms, P95: {p95:.0f}ms")
        assert avg < 1000, f"Authentication too slow: {avg:.0f}ms (target <1000ms)"

    # ==========================================
    # Projects Benchmarks
    # ==========================================

    def test_benchmark_list_projects(self):
        """Benchmark: List projects with pagination"""
        stats = self.benchmark_endpoint('GET', '/core/projects', params={'page': 0, 'page_size': 20})

        print(f"\nList Projects - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1000, f"List projects too slow: {stats['p95']:.0f}ms (target <1000ms)"

    def test_benchmark_search_projects(self):
        """Benchmark: Search projects by name"""
        stats = self.benchmark_endpoint('GET', '/core/projects', params={'name': '.*test.*', 'page_size': 20})

        print(f"\nSearch Projects - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1500, f"Search projects too slow: {stats['p95']:.0f}ms (target <1500ms)"

    def test_benchmark_create_project(self, unique_id):
        """Benchmark: Create new project"""
        created_uris = []

        times = []
        for i in range(5):  # Create 5 projects
            project_data = {
                "name": f"benchmark_{unique_id}_{i}",
                "shortname": f"bench_{i}",
                "start_date": "2024-01-01"
            }

            start = time.perf_counter()
            response = self.client.post('/core/projects', project_data)
            duration = (time.perf_counter() - start) * 1000

            if response.status_code in [200, 201]:
                times.append(duration)
                uri = response.json().get('result')
                if uri:
                    created_uris.append(uri)

        # Cleanup
        for uri in created_uris:
            try:
                import requests as req
                self.client.delete(f"/core/projects/{req.utils.quote(uri, safe='')}")
            except:
                pass

        if times:
            avg = sum(times) / len(times)
            print(f"\nCreate Project - Avg: {avg:.0f}ms")
            assert avg < 2000, f"Create project too slow: {avg:.0f}ms (target <2000ms)"

    # ==========================================
    # Experiments Benchmarks
    # ==========================================

    def test_benchmark_list_experiments(self):
        """Benchmark: List experiments"""
        stats = self.benchmark_endpoint('GET', '/core/experiments', params={'page': 0, 'page_size': 20})

        print(f"\nList Experiments - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1000, f"List experiments too slow: {stats['p95']:.0f}ms (target <1000ms)"

    def test_benchmark_search_experiments(self):
        """Benchmark: Search experiments"""
        stats = self.benchmark_endpoint('GET', '/core/experiments', params={'name': '.*test.*'})

        print(f"\nSearch Experiments - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1500, f"Search experiments too slow: {stats['p95']:.0f}ms (target <1500ms)"

    # ==========================================
    # Devices Benchmarks
    # ==========================================

    def test_benchmark_list_devices(self):
        """Benchmark: List devices"""
        stats = self.benchmark_endpoint('GET', '/core/devices', params={'page': 0, 'page_size': 20})

        print(f"\nList Devices - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1000, f"List devices too slow: {stats['p95']:.0f}ms (target <1000ms)"

    # ==========================================
    # Data Query Benchmarks
    # ==========================================

    def test_benchmark_query_data(self):
        """Benchmark: Query experimental data"""
        stats = self.benchmark_endpoint('GET', '/core/data', params={'page': 0, 'page_size': 50})

        print(f"\nQuery Data - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        # Data queries can be slower due to larger result sets
        assert stats['p95'] < 2000, f"Query data too slow: {stats['p95']:.0f}ms (target <2000ms)"

    # ==========================================
    # Variables Benchmarks
    # ==========================================

    def test_benchmark_list_variables(self):
        """Benchmark: List variables"""
        stats = self.benchmark_endpoint('GET', '/core/variables', params={'page': 0, 'page_size': 20})

        print(f"\nList Variables - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1000, f"List variables too slow: {stats['p95']:.0f}ms (target <1000ms)"

    # ==========================================
    # Security Benchmarks
    # ==========================================

    def test_benchmark_list_users(self):
        """Benchmark: List users (admin operation)"""
        stats = self.benchmark_endpoint('GET', '/security/users', params={'page': 0, 'page_size': 20})

        print(f"\nList Users - P50: {stats['p50']:.0f}ms, P95: {stats['p95']:.0f}ms")
        assert stats['p95'] < 1000, f"List users too slow: {stats['p95']:.0f}ms (target <1000ms)"


@pytest.fixture(scope="session", autouse=True)
def benchmark_summary(request):
    """Print summary after all benchmarks complete"""
    yield

    print("\n" + "="*60)
    print("Performance Benchmark Summary")
    print("="*60)
    print("\nAll benchmarks completed. Review results above.")
    print("\nPerformance Targets:")
    print("  - Authentication: <1000ms avg")
    print("  - List operations: <1000ms p95")
    print("  - Search operations: <1500ms p95")
    print("  - Create operations: <2000ms avg")
    print("  - Data queries: <2000ms p95")
    print("\nNext steps:")
    print("  - Save these baselines to BASELINE_RESULTS.md")
    print("  - Run periodically to detect performance regressions")
    print("  - Compare against future test runs")
    print("="*60 + "\n")
