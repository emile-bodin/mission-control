import os
import unittest
from unittest.mock import patch

from app.main import pulse_homelab, pulse_value


class PulseHomelabTests(unittest.TestCase):
    def test_missing_pulse_value_is_unknown(self):
        self.assertEqual(pulse_value(None), "Unknown")

    def test_returns_unknown_when_pulse_is_not_configured(self):
        with patch.dict(os.environ, {"PULSE_BASE_URL": ""}, clear=False):
            self.assertEqual(
                pulse_homelab(),
                {"available": False, "status": "Unknown", "resources": [], "docker_hosts": [], "last_updated_at": "Unknown"},
            )
