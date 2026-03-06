"""
Device API Tests - Tests for device management and sensor configuration
"""

import pytest
import requests


class TestDevicesAPI:
    """Test suite for Devices API"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        self.client = api_client
        self.created_devices = []

    def teardown_method(self):
        for device_uri in self.created_devices:
            try:
                self.client.delete(f"/core/devices/{requests.utils.quote(device_uri, safe='')}")
            except:
                pass

    def test_create_device(self, test_device_data):
        """Test creating a device"""
        response = self.client.post("/core/devices", test_device_data)
        assert response.status_code in [200, 201]
        device_uri = response.json().get('result')
        assert device_uri is not None
        self.created_devices.append(device_uri)

    def test_list_devices(self):
        """Test listing devices"""
        response = self.client.get("/core/devices")
        assert response.status_code == 200
        assert isinstance(response.json().get('result'), list)

    def test_get_device_by_uri(self, test_device_data):
        """Test retrieving device by URI"""
        create_response = self.client.post("/core/devices", test_device_data)
        device_uri = create_response.json().get('result')
        self.created_devices.append(device_uri)

        encoded_uri = requests.utils.quote(device_uri, safe='')
        response = self.client.get(f"/core/devices/{encoded_uri}")

        assert response.status_code == 200
        device = response.json().get('result')
        assert device.get('uri') == device_uri

    def test_update_device(self, test_device_data):
        """Test updating device"""
        create_response = self.client.post("/core/devices", test_device_data)
        device_uri = create_response.json().get('result')
        self.created_devices.append(device_uri)

        updated_data = test_device_data.copy()
        updated_data['uri'] = device_uri
        updated_data['description'] = "Updated description"

        response = self.client.put("/core/devices", updated_data)
        assert response.status_code == 200

    def test_delete_device(self, test_device_data):
        """Test deleting device"""
        create_response = self.client.post("/core/devices", test_device_data)
        device_uri = create_response.json().get('result')

        encoded_uri = requests.utils.quote(device_uri, safe='')
        response = self.client.delete(f"/core/devices/{encoded_uri}")

        assert response.status_code in [200, 204]

    @pytest.mark.smoke
    def test_list_devices_performance(self):
        """Test device listing performance"""
        import time
        start = time.time()
        response = self.client.get("/core/devices")
        duration = time.time() - start
        assert response.status_code == 200
        assert duration < 5.0
