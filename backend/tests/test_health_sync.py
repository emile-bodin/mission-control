import json
import os
import unittest
from datetime import UTC, datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg

from app.main import HEALTH_SYNC_MAX_PAYLOAD_BYTES, run_migrations


TEST_DATABASE_URL = os.environ.get("HEALTH_SYNC_TEST_DATABASE_URL")
TEST_BASE_URL = os.environ.get("HEALTH_SYNC_TEST_BASE_URL")


@unittest.skipUnless(
    TEST_DATABASE_URL and TEST_BASE_URL,
    "set HEALTH_SYNC_TEST_DATABASE_URL and HEALTH_SYNC_TEST_BASE_URL for PostgreSQL integration tests",
)
class HealthSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        os.environ.setdefault("DEVICE_TOKEN_PEPPER", "test-device-pepper")
        os.environ.setdefault("DEVICE_ADMIN_TOKEN", "test-device-admin-token")
        run_migrations()

    def setUp(self):
        suffix = str(uuid4())
        self.source = f"sync-test-{suffix}"
        self.device_name = f"sync-device-{suffix}"
        self.admin_headers = {"X-Device-Admin-Token": os.environ["DEVICE_ADMIN_TOKEN"]}

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM health_weights WHERE source = %s", (self.source,))
                cursor.execute("DELETE FROM health_activities WHERE source = %s", (self.source,))
                cursor.execute("DELETE FROM paired_devices WHERE device_name = %s", (self.device_name,))
                cursor.execute("DELETE FROM pairing_challenges WHERE device_name = %s", (self.device_name,))

    def request(self, method: str, path: str, payload=None, headers: dict | None = None):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode() if payload is not None else None
        request = Request(
            f"{TEST_BASE_URL.rstrip('/')}{path}",
            data=data,
            headers={"Content-Type": "application/json", **(headers or {})},
            method=method,
        )
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def token(self) -> str:
        status, challenge = self.request(
            "POST", "/api/devices/pairing-challenges", {"device_name": self.device_name}, self.admin_headers
        )
        self.assertEqual(status, 201)
        status, paired = self.request("POST", "/api/devices/pair", {"pairing_code": challenge["pairing_code"]})
        self.assertEqual(status, 201)
        self.device_id = paired["device"]["id"]
        return paired["device_token"]

    def sync_headers(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    def weight(self, external_record_id: str = "weight-1") -> dict:
        return {
            "type": "weight",
            "measured_at": "2026-08-31T09:30:00+02:00",
            "value": 100,
            "unit": "lb",
            "source": self.source,
            "external_record_id": external_record_id,
        }

    def activity(self, external_record_id: str = "activity-1") -> dict:
        return {
            "type": "activity",
            "activity_type": "running",
            "started_at": "2026-08-31T10:00:00+02:00",
            "ended_at": "2026-08-31T10:30:00+02:00",
            "duration_seconds": 1800,
            "distance_value": 2,
            "distance_unit": "km",
            "energy_value": 418.4,
            "energy_unit": "kj",
            "source": self.source,
            "external_record_id": external_record_id,
            "source_metadata": {"device": "test"},
        }

    def test_authenticated_weight_activity_and_mixed_batches_normalize(self):
        token = self.token()
        status, body = self.request(
            "POST", "/api/v1/health/sync", {"records": [self.weight(), self.activity()]}, self.sync_headers(token)
        )
        self.assertEqual(status, 200)
        self.assertEqual(body["api_version"], "v1")
        self.assertEqual([result["status"] for result in body["results"]], ["created", "created"])
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT normalized_kg FROM health_weights WHERE source = %s", (self.source,))
                self.assertAlmostEqual(cursor.fetchone()[0], 45.359237)
                cursor.execute("SELECT distance_meters, energy_kilocalories FROM health_activities WHERE source = %s", (self.source,))
                distance_meters, energy_kilocalories = cursor.fetchone()
                self.assertEqual(distance_meters, 2000)
                self.assertAlmostEqual(energy_kilocalories, 100.0, places=5)

    def test_missing_invalid_and_revoked_tokens_are_unauthorized(self):
        token = self.token()
        payload = {"records": [self.weight()]}
        self.assertEqual(self.request("POST", "/api/v1/health/sync", payload)[0], 401)
        self.assertEqual(self.request("POST", "/api/v1/health/sync", payload, {"Authorization": "Bearer wrong"})[0], 401)
        self.assertEqual(
            self.request("POST", f"/api/devices/{self.device_id}/revoke", headers=self.admin_headers)[0], 204
        )
        self.assertEqual(self.request("POST", "/api/v1/health/sync", payload, self.sync_headers(token))[0], 401)

    def test_duplicates_and_retries_are_idempotent(self):
        token = self.token()
        payload = {"records": [self.weight(), self.activity()]}
        status, first = self.request("POST", "/api/v1/health/sync", payload, self.sync_headers(token))
        self.assertEqual(status, 200)
        status, retry = self.request("POST", "/api/v1/health/sync", payload, self.sync_headers(token))
        self.assertEqual(status, 200)
        self.assertEqual(first["results"][0]["id"], retry["results"][0]["id"])
        self.assertEqual([result["status"] for result in retry["results"]], ["unchanged", "unchanged"])
        payload["records"][0]["value"] = 101
        _, updated = self.request("POST", "/api/v1/health/sync", payload, self.sync_headers(token))
        self.assertEqual(updated["results"][0]["status"], "updated")
        self.assertEqual(updated["results"][1]["status"], "unchanged")
        _, repeated_update = self.request("POST", "/api/v1/health/sync", payload, self.sync_headers(token))
        self.assertEqual([result["status"] for result in repeated_update["results"]], ["unchanged", "unchanged"])
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT count(*) FROM health_weights WHERE source = %s AND external_record_id = 'weight-1'", (self.source,))
                self.assertEqual(cursor.fetchone()[0], 1)
                cursor.execute(
                    "SELECT count(*) FROM health_activities WHERE source = %s AND external_record_id = 'activity-1'",
                    (self.source,),
                )
                self.assertEqual(cursor.fetchone()[0], 1)

    def test_partial_and_all_invalid_batches_return_per_record_results(self):
        token = self.token()
        invalid = self.weight("invalid-1")
        invalid["value"] = -1
        status, mixed = self.request(
            "POST", "/api/v1/health/sync", {"records": [self.activity(), invalid]}, self.sync_headers(token)
        )
        self.assertEqual(status, 200)
        self.assertEqual(mixed["accepted"], 1)
        self.assertEqual(mixed["results"][1]["status"], "invalid")
        status, rejected = self.request(
            "POST", "/api/v1/health/sync", {"records": [{"type": "weight", "value": 1}]}, self.sync_headers(token)
        )
        self.assertEqual(status, 200)
        self.assertEqual(rejected["accepted"], 0)
        self.assertEqual(rejected["results"][0]["status"], "invalid")

    def test_cursor_is_incremental_and_validated(self):
        token = self.token()
        self.request("POST", "/api/v1/health/sync", {"records": [self.weight()]}, self.sync_headers(token))
        cursor = None
        saw_record = False
        while True:
            path = "/api/v1/health/sync?limit=100" + (f"&cursor={cursor}" if cursor else "")
            status, page = self.request("GET", path, headers=self.sync_headers(token))
            self.assertEqual(status, 200)
            saw_record = saw_record or any(record["source"] == self.source for record in page["records"])
            cursor = page["next_cursor"]
            if not page["has_more"]:
                break
        self.assertTrue(saw_record)
        self.assertIsNotNone(cursor)
        status, next_page = self.request(
            "GET", f"/api/v1/health/sync?cursor={cursor}", headers=self.sync_headers(token)
        )
        self.assertEqual(status, 200)
        self.assertEqual(next_page["records"], [])
        self.assertEqual(next_page["next_cursor"], cursor)
        self.assertEqual(self.request("GET", "/api/v1/health/sync?cursor=invalid", headers=self.sync_headers(token))[0], 422)

    def test_batch_payload_and_top_level_schema_limits(self):
        token = self.token()
        headers = self.sync_headers(token)
        self.assertEqual(
            self.request("POST", "/api/v1/health/sync", {"records": [self.weight()] * 101}, headers)[0], 422
        )
        self.assertEqual(self.request("POST", "/api/v1/health/sync", {"records": [], "extra": True}, headers)[0], 422)
        oversized = b"{" + b" " * HEALTH_SYNC_MAX_PAYLOAD_BYTES + b"}"
        self.assertGreater(len(oversized), HEALTH_SYNC_MAX_PAYLOAD_BYTES)
        self.assertEqual(self.request("POST", "/api/v1/health/sync", oversized, headers)[0], 413)


if __name__ == "__main__":
    unittest.main()
