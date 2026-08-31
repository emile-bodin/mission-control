import json
import os
import unittest
from datetime import UTC, datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg

from app.main import run_migrations


TEST_DATABASE_URL = os.environ.get("HEALTH_DATA_TEST_DATABASE_URL")
TEST_BASE_URL = os.environ.get("HEALTH_DATA_TEST_BASE_URL")


@unittest.skipUnless(
    TEST_DATABASE_URL and TEST_BASE_URL,
    "set HEALTH_DATA_TEST_DATABASE_URL and HEALTH_DATA_TEST_BASE_URL for PostgreSQL integration tests",
)
class HealthDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        run_migrations()

    def setUp(self):
        suffix = str(uuid4())
        self.manual_source = f"manual-test-{suffix}"
        self.external_source = f"external-test-{suffix}"

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM health_weights WHERE source IN (%s, %s)", (self.manual_source, self.external_source))
                cursor.execute("DELETE FROM health_activities WHERE source IN (%s, %s)", (self.manual_source, self.external_source))

    def request(self, method: str, path: str, payload: dict | None = None):
        request = Request(
            f"{TEST_BASE_URL.rstrip('/')}{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json"},
            method=method,
        )
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def activity_payload(self, source: str, external_record_id: str | None = None) -> dict:
        return {
            "activity_type": "running",
            "started_at": "2026-08-31T10:00:00+02:00",
            "ended_at": "2026-08-31T10:30:00+02:00",
            "duration_seconds": 1800,
            "distance_value": 2,
            "distance_unit": "km",
            "energy_value": 418.4,
            "energy_unit": "kj",
            "source": source,
            "external_record_id": external_record_id,
            "source_metadata": {"device": "test"},
        }

    def test_migration_creates_health_tables_idempotently(self):
        run_migrations()
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT to_regclass('health_weights'), to_regclass('health_activities')")
                self.assertEqual(cursor.fetchone(), ("health_weights", "health_activities"))

    def test_weight_create_read_update_and_normalization(self):
        status, created = self.request(
            "POST",
            "/api/health/weights",
            {
                "measured_at": "2026-08-31T09:30:00+02:00",
                "value": 100,
                "unit": "lb",
                "source": self.manual_source,
            },
        )
        self.assertEqual(status, 201)
        self.assertAlmostEqual(created["normalized_kg"], 45.359237)
        self.assertEqual(created["source_value"], 100)
        self.assertEqual(created["source_unit"], "lb")
        self.assertEqual(datetime.fromisoformat(created["measured_at"].replace("Z", "+00:00")).tzinfo, UTC)

        status, fetched = self.request("GET", f"/api/health/weights/{created['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(fetched["id"], created["id"])

        status, updated = self.request("PATCH", f"/api/health/weights/{created['id']}", {"value": 46, "unit": "kg"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["source_value"], 46)
        self.assertEqual(updated["normalized_kg"], 46)

    def test_activity_create_read_update_and_original_values(self):
        status, created = self.request("POST", "/api/health/activities", self.activity_payload(self.manual_source))
        self.assertEqual(status, 201)
        self.assertEqual(created["source_distance_value"], 2)
        self.assertEqual(created["source_distance_unit"], "km")
        self.assertEqual(created["distance_meters"], 2000)
        self.assertEqual(created["source_energy_unit"], "kj")
        self.assertAlmostEqual(created["energy_kilocalories"], 100, places=5)
        self.assertEqual(created["source_metadata"], {"device": "test"})
        self.assertEqual(datetime.fromisoformat(created["started_at"].replace("Z", "+00:00")).tzinfo, UTC)

        status, fetched = self.request("GET", f"/api/health/activities/{created['id']}")
        self.assertEqual(status, 200)
        self.assertEqual(fetched["id"], created["id"])

        status, updated = self.request(
            "PATCH",
            f"/api/health/activities/{created['id']}",
            {"distance_value": 1500, "distance_unit": "m", "energy_value": 110, "energy_unit": "kcal"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["distance_meters"], 1500)
        self.assertEqual(updated["source_distance_unit"], "m")
        self.assertEqual(updated["energy_kilocalories"], 110)

    def test_external_ids_upsert_without_duplicates(self):
        payload = {
            "measured_at": "2026-08-31T09:30:00+02:00",
            "value": 70,
            "unit": "kg",
            "source": self.external_source,
            "external_record_id": "weight-1",
        }
        status, created = self.request("POST", "/api/health/weights", payload)
        self.assertEqual(status, 201)
        payload["value"] = 71
        status, repeated = self.request("POST", "/api/health/weights", payload)
        self.assertEqual(status, 200)
        self.assertEqual(repeated["id"], created["id"])
        self.assertEqual(repeated["normalized_kg"], 71)

        status, weights = self.request("GET", "/api/health/weights")
        self.assertEqual(status, 200)
        self.assertEqual(len([weight for weight in weights if weight["source"] == self.external_source]), 1)

    def test_manual_and_external_activity_records_are_distinct(self):
        status, manual = self.request("POST", "/api/health/activities", self.activity_payload(self.manual_source))
        self.assertEqual(status, 201)
        status, external = self.request(
            "POST", "/api/health/activities", self.activity_payload(self.external_source, "activity-1")
        )
        self.assertEqual(status, 201)
        self.assertNotEqual(manual["id"], external["id"])

    def test_invalid_health_payloads_are_rejected(self):
        invalid_weights = [
            {"measured_at": "2026-08-31T09:30:00+02:00", "value": -1, "unit": "kg", "source": self.manual_source},
            {"measured_at": "2026-08-31T09:30:00+02:00", "value": 70, "unit": "stone", "source": self.manual_source},
            {"measured_at": "2026-08-31T09:30:00", "value": 70, "unit": "kg", "source": self.manual_source},
        ]
        for payload in invalid_weights:
            self.assertEqual(self.request("POST", "/api/health/weights", payload)[0], 422)

        invalid_activity = self.activity_payload(self.manual_source)
        invalid_activity["ended_at"] = "2026-08-31T09:00:00+02:00"
        self.assertEqual(self.request("POST", "/api/health/activities", invalid_activity)[0], 422)

        invalid_activity = self.activity_payload(self.manual_source)
        invalid_activity["duration_seconds"] = 1
        self.assertEqual(self.request("POST", "/api/health/activities", invalid_activity)[0], 422)

        invalid_activity = self.activity_payload(self.manual_source)
        invalid_activity["distance_value"] = -1
        self.assertEqual(self.request("POST", "/api/health/activities", invalid_activity)[0], 422)


if __name__ == "__main__":
    unittest.main()
