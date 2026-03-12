"""
Device API Tests - Tests for device management and sensor configuration
"""

import pytest
from urllib.parse import quote


class TestDevicesAPI:
    """Test suite for Devices API"""

    @pytest.fixture(autouse=True)
    def setup(self, api_client):
        self.client = api_client
        self.created_devices = []

    def teardown_method(self):
        for device_uri in self.created_devices:
            try:
                if device_uri:  # Only delete if URI is not None
                    encoded_uri = quote(device_uri, safe='')
                    self.client.delete(f"/core/devices/{encoded_uri}")
            except:
                pass

    def test_create_device(self, test_device_data):
        """Test creating a device"""
        response = self.client.post("/core/devices", test_device_data)

        # Check if endpoint exists (might not be available in all OpenSILEX versions)
        if response.status_code == 404:
            pytest.skip("Device API endpoint not available in this OpenSILEX version")

        # If we get 500, check the error message for more context
        if response.status_code == 500:
            error_msg = response.json().get('metadata', {}).get('status', [{}])[0].get('message', 'Unknown error')
            pytest.fail(f"Server error creating device: {error_msg}")

        assert response.status_code in [200, 201], f"Expected 200/201, got {response.status_code}: {response.text}"
        device_uri = response.json().get('result')
        assert device_uri is not None, "Device URI should not be None"
        self.created_devices.append(device_uri)

    def test_list_devices(self):
        """Test listing devices"""
        response = self.client.get("/core/devices")

        # Check if endpoint exists
        if response.status_code == 404:
            pytest.skip("Device API endpoint not available in this OpenSILEX version")

        # If we get 500, provide helpful error
        if response.status_code == 500:
            error_msg = response.json().get('metadata', {}).get('status', [{}])[0].get('message', 'Unknown error')
            pytest.fail(f"Server error listing devices: {error_msg}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        assert isinstance(response.json().get('result'), list)

    def test_get_device_by_uri(self, test_device_data):
        """Test retrieving device by URI"""
        create_response = self.client.post("/core/devices", test_device_data)

        # Check if endpoint exists
        if create_response.status_code == 404:
            pytest.skip("Device API endpoint not available in this OpenSILEX version")

        # Verify creation succeeded before continuing
        assert create_response.status_code in [200, 201], \
            f"Failed to create device: {create_response.status_code}"

        device_uri = create_response.json().get('result')
        assert device_uri is not None, "Device URI should not be None after creation"
        self.created_devices.append(device_uri)

        encoded_uri = quote(str(device_uri), safe='')
        response = self.client.get(f"/core/devices/{encoded_uri}")

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        device = response.json().get('result')
        assert device.get('uri') == device_uri

    def test_update_device(self, test_device_data):
        """Test updating device"""
        create_response = self.client.post("/core/devices", test_device_data)

        # Check if endpoint exists
        if create_response.status_code == 404:
            pytest.skip("Device API endpoint not available in this OpenSILEX version")

        # Verify creation succeeded
        assert create_response.status_code in [200, 201], \
            f"Failed to create device: {create_response.status_code}"

        device_uri = create_response.json().get('result')
        assert device_uri is not None, "Device URI should not be None"
        self.created_devices.append(device_uri)

        updated_data = test_device_data.copy()
        updated_data['uri'] = device_uri
        updated_data['description'] = "Updated description"

        response = self.client.put("/core/devices", updated_data)

        # Provide helpful error message if update fails
        if response.status_code != 200:
            error_msg = response.json().get('metadata', {}).get('status', [{}])[0].get('message', 'Unknown error')
            pytest.fail(f"Failed to update device (HTTP {response.status_code}): {error_msg}")

        assert response.status_code == 200

    def test_delete_device(self, test_device_data):
        """Test deleting device"""
        create_response = self.client.post("/core/devices", test_device_data)

        # Check if endpoint exists
        if create_response.status_code == 404:
            pytest.skip("Device API endpoint not available in this OpenSILEX version")

        # Verify creation succeeded
        assert create_response.status_code in [200, 201], \
            f"Failed to create device: {create_response.status_code}"

        device_uri = create_response.json().get('result')
        assert device_uri is not None, "Device URI should not be None"

        encoded_uri = quote(str(device_uri), safe='')
        response = self.client.delete(f"/core/devices/{encoded_uri}")

        assert response.status_code in [200, 204], \
            f"Expected 200/204, got {response.status_code}"

    @pytest.mark.smoke
    def test_list_devices_performance(self):
        """Test device listing performance"""
        import time
        start = time.time()
        response = self.client.get("/core/devices")
        duration = time.time() - start
        assert response.status_code == 200
        assert duration < 5.0
