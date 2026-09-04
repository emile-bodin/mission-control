import json
import os
import unittest
from unittest.mock import patch

from app.main import pulse_homelab, pulse_value


class PulseResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self) -> bytes:
        return json.dumps(self.payload).encode()


class PulseHomelabTests(unittest.TestCase):
    def test_missing_pulse_value_is_unknown(self):
        self.assertEqual(pulse_value(None), "Unknown")

    def test_returns_unknown_when_pulse_is_not_configured(self):
        with patch.dict(os.environ, {"PULSE_BASE_URL": ""}, clear=False):
            self.assertEqual(
                pulse_homelab(),
                {"available": False, "status": "Unknown", "resources": [], "docker_hosts": [], "last_updated_at": "Unknown"},
            )

    @patch("app.main.urlopen")
    def test_returns_visible_pulse_resources(self, urlopen):
        urlopen.side_effect = [
            PulseResponse({"meta": {"totalPages": 1}, "data": [{"id": "vm-1", "name": "Docker", "type": "vm", "status": "online"}, {"id": "image-1", "name": "Ignored", "type": "docker-image", "status": "online"}]}),
            PulseResponse({"lastUpdate": "2026-09-04T18:54:16Z", "dockerHosts": [{"name": "docker", "containers": 3, "uptimeSeconds": 12, "cpuUsagePercent": 1.5}]}),
        ]

        with patch.dict(os.environ, {"PULSE_BASE_URL": "https://pulse.example", "PULSE_API_TOKEN": "test-token"}, clear=False):
            result = pulse_homelab()

        self.assertTrue(result["available"])
        self.assertEqual(result["resources"], [{"id": "vm-1", "name": "Docker", "type": "vm", "status": "online", "parent_name": "Unknown", "last_seen": "Unknown", "updated_at": "Unknown", "runtime": "Unknown", "runtime_version": "Unknown"}])
        self.assertEqual(result["docker_hosts"][0]["name"], "docker")
        self.assertEqual(urlopen.call_args_list[0].args[0].full_url, "https://pulse.example/api/resources?page=1&limit=100")
