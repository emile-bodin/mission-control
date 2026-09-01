import unittest

from app.entrypoint import app


class PulseRouteTests(unittest.TestCase):
    def test_homelab_route_is_registered(self):
        self.assertIn("/api/homelab", {route.path for route in app.routes})


if __name__ == "__main__":
    unittest.main()
