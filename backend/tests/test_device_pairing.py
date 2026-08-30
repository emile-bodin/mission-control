import os
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json
from uuid import uuid4

import psycopg

from app.main import run_migrations, secret_hash


TEST_DATABASE_URL = os.environ.get("DEVICE_PAIRING_TEST_DATABASE_URL")
TEST_BASE_URL = os.environ.get("DEVICE_PAIRING_TEST_BASE_URL")


@unittest.skipUnless(
    TEST_DATABASE_URL and TEST_BASE_URL,
    "set DEVICE_PAIRING_TEST_DATABASE_URL and DEVICE_PAIRING_TEST_BASE_URL for PostgreSQL integration tests",
)
class DevicePairingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        os.environ.setdefault("DEVICE_TOKEN_PEPPER", "test-device-pepper")
        os.environ.setdefault("DEVICE_ADMIN_TOKEN", "test-device-admin-token")
        run_migrations()

    def setUp(self):
        self.device_name = f"pairing-test-{uuid4()}"
        self.pairing_hashes: list[str] = []
        self.admin_headers = {"X-Device-Admin-Token": os.environ["DEVICE_ADMIN_TOKEN"]}

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                for pairing_hash in self.pairing_hashes:
                    cursor.execute("DELETE FROM pairing_rate_limits WHERE pairing_code_hash = %s", (pairing_hash,))
                cursor.execute("DELETE FROM paired_devices WHERE device_name = %s", (self.device_name,))
                cursor.execute("DELETE FROM pairing_challenges WHERE device_name = %s", (self.device_name,))

    def request(self, method: str, path: str, payload: dict | None = None, headers: dict | None = None):
        request_headers = {"Content-Type": "application/json", **(headers or {})}
        request = Request(
            f"{TEST_BASE_URL.rstrip('/')}{path}",
            data=json.dumps(payload).encode() if payload is not None else None,
            headers=request_headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.loads(response.read() or b"{}")
        except HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def create_challenge(self) -> str:
        status, response = self.request(
            "POST", "/api/devices/pairing-challenges", {"device_name": self.device_name}, self.admin_headers
        )
        self.assertEqual(status, 201)
        self.pairing_hashes.append(secret_hash(response["pairing_code"]))
        return response["pairing_code"]

    def pair(self, pairing_code: str):
        return self.request("POST", "/api/devices/pair", {"pairing_code": pairing_code})

    def test_valid_pairing_stores_only_hashes_and_migration_is_repeatable(self):
        pairing_code = self.create_challenge()
        status, body = self.pair(pairing_code)
        self.assertEqual(status, 201)
        device_token = body["device_token"]
        self.assertNotIn("token_hash", body)
        self.assertNotIn(pairing_code, str(body["device"]))
        run_migrations()

        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pairing_code_hash FROM pairing_challenges")
                self.assertEqual(cursor.fetchone()[0], secret_hash(pairing_code))
                cursor.execute("SELECT token_hash FROM paired_devices")
                self.assertEqual(cursor.fetchone()[0], secret_hash(device_token))

        status, status_response = self.request("GET", "/api/devices/me", headers={"Authorization": f"Bearer {device_token}"})
        self.assertEqual(status, 200)
        self.assertNotIn(device_token, str(status_response))

    def test_expired_reused_and_wrong_challenges_are_generic_failures(self):
        expired = self.create_challenge()
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE pairing_challenges SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE pairing_code_hash = %s",
                    (secret_hash(expired),),
                )
        self.assertEqual(self.pair(expired)[0], 401)

        usable = self.create_challenge()
        self.assertEqual(self.pair(usable)[0], 201)
        self.assertEqual(self.pair(usable)[0], 401)
        self.assertEqual(self.pair("not-a-real-challenge")[0], 401)

    def test_pairing_rate_limit_and_spoofed_forwarded_header(self):
        wrong_code = f"wrong-{uuid4()}"
        self.pairing_hashes.append(secret_hash(wrong_code))
        for attempt in range(4):
            status, _ = self.request(
                "POST", "/api/devices/pair", {"pairing_code": wrong_code}, {"X-Forwarded-For": f"203.0.113.{attempt}"}
            )
            self.assertEqual(status, 401)
        self.assertEqual(self.pair(wrong_code)[0], 429)
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT client_ip_hash FROM pairing_rate_limits")
                stored_hashes = {row[0] for row in cursor.fetchall()}
        self.assertNotIn(secret_hash("203.0.113.1"), stored_hashes)

    def test_missing_wrong_and_revoked_bearer_tokens_fail_immediately(self):
        pairing_code = self.create_challenge()
        _, paired = self.pair(pairing_code)
        device_id = paired["device"]["id"]
        token = paired["device_token"]

        self.assertEqual(self.request("GET", "/api/devices/me")[0], 401)
        self.assertEqual(self.request("GET", "/api/devices/me", headers={"Authorization": "Bearer wrong"})[0], 401)
        self.assertEqual(
            self.request("POST", f"/api/devices/{device_id}/revoke", headers=self.admin_headers)[0],
            204,
        )
        self.assertEqual(
            self.request("GET", "/api/devices/me", headers={"Authorization": f"Bearer {token}"})[0],
            401,
        )


if __name__ == "__main__":
    unittest.main()
