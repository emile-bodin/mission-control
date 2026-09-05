import os
import unittest
from datetime import UTC, datetime
from unittest.mock import patch
from uuid import uuid4

import psycopg
from fastapi import HTTPException, Response
from psycopg.rows import dict_row
from pydantic import ValidationError

from app.main import (
    MAX_BROWSER_STREAM_PAGE_SIZE,
    PairingExchangeRequest,
    StreamEntryInput,
    StreamEntryKind,
    StreamEntryStatus,
    change_stream_entry_status,
    cortex_today,
    create_browser_session,
    create_stream_entry,
    get_stream_entry,
    get_cortex_today,
    list_browser_stream_entries,
    list_stream_entries,
    pair_browser_session,
    require_browser_session,
    require_device_stream_owner,
    require_stream_owner,
    run_migrations,
    secret_hash,
)


TEST_DATABASE_URL = os.environ.get("CORTEX_TEST_DATABASE_URL")


class StreamEntryValidationTests(unittest.TestCase):
    def test_requires_content_for_textual_kinds(self):
        with self.assertRaises(ValidationError):
            StreamEntryInput(kind=StreamEntryKind.TEXT, content="   ")

    def test_voice_reference_rejects_text_and_secret_metadata(self):
        with self.assertRaises(ValidationError):
            StreamEntryInput(
                kind=StreamEntryKind.VOICE_REFERENCE,
                content="not allowed",
                voice_reference={"source": "android", "reference_id": "voice-1"},
            )
        with self.assertRaises(ValidationError):
            StreamEntryInput(kind=StreamEntryKind.TEXT, content="note", source_metadata={"api_token": "secret"})

    @patch("app.main.create_browser_session", return_value=("session-secret", datetime(2030, 1, 1, tzinfo=UTC)))
    @patch("app.main.exchange_pairing_challenge", return_value={"device_token": "never-returned", "device": {"id": "device-1", "owner_id": "default-user", "device_name": "Browser", "paired_at": datetime(2026, 1, 1, tzinfo=UTC), "last_seen_at": None, "revoked_at": None}})
    def test_browser_pair_sets_secure_opaque_cookie(self, _exchange, _session):
        response = Response()
        result = pair_browser_session(PairingExchangeRequest(pairing_code="code"), object(), response, object())
        self.assertEqual(set(result), {"device", "expires_at"})
        self.assertNotIn("device_token", result)
        cookie = response.headers["set-cookie"].lower()
        self.assertIn("httponly", cookie)
        self.assertIn("secure", cookie)
        self.assertIn("samesite=strict", cookie)


@unittest.skipUnless(TEST_DATABASE_URL, "set CORTEX_TEST_DATABASE_URL for Cortex integration tests")
class CortexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        os.environ.setdefault("DEVICE_TOKEN_PEPPER", "hyd-201-test-pepper")
        run_migrations()

    def setUp(self):
        self.owner_id = f"hyd-197-owner-{uuid4()}"
        self.other_owner_id = f"hyd-197-owner-{uuid4()}"
        self.browser_owner_ids: list[str] = []

    def tearDown(self):
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM browser_sessions WHERE device_id = ANY(%s)", (self.browser_owner_ids,))
                cursor.execute("DELETE FROM stream_entry_audits WHERE owner_id IN (%s, %s)", (self.owner_id, self.other_owner_id))
                cursor.execute("DELETE FROM stream_entries WHERE owner_id IN (%s, %s)", (self.owner_id, self.other_owner_id))
                if self.browser_owner_ids:
                    cursor.execute("DELETE FROM stream_entry_audits WHERE owner_id = ANY(%s)", (self.browser_owner_ids,))
                    cursor.execute("DELETE FROM stream_entries WHERE owner_id = ANY(%s)", (self.browser_owner_ids,))
                    cursor.execute("DELETE FROM paired_devices WHERE id = ANY(%s)", (self.browser_owner_ids,))

    def connection(self):
        return psycopg.connect(TEST_DATABASE_URL, row_factory=dict_row)

    def browser_session(self, connection, owner_id: str | None = None) -> tuple[str, str]:
        device_id = f"hyd-201-device-{uuid4()}"
        self.browser_owner_ids.append(device_id)
        owner_id = owner_id or device_id
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO paired_devices (id, owner_id, device_name, token_hash) VALUES (%s, %s, %s, %s)",
                (device_id, owner_id, "browser-test", secret_hash(str(uuid4()))),
            )
        token, _ = create_browser_session(device_id, connection)
        return device_id, token

    def test_migration_is_idempotent(self):
        run_migrations()
        run_migrations()
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT to_regclass('public.stream_entries') AS entries, to_regclass('public.stream_entry_audits') AS audits")
                self.assertEqual(cursor.fetchone(), {"entries": "stream_entries", "audits": "stream_entry_audits"})

    def test_stream_entry_is_owner_bound_and_audited(self):
        with self.connection() as connection:
            entry = create_stream_entry(StreamEntryInput(kind=StreamEntryKind.QUICK_TASK, content="Bel huisarts"), self.owner_id, connection)
            self.assertEqual(list_stream_entries(self.owner_id, connection), [entry])
            with self.assertRaises(HTTPException) as not_found:
                get_stream_entry(entry["id"], self.other_owner_id, connection)
            self.assertEqual(not_found.exception.status_code, 404)
            archived = change_stream_entry_status(entry["id"], self.owner_id, StreamEntryStatus.ARCHIVED, connection)
            self.assertEqual(archived["status"], "archived")
            with self.assertRaises(HTTPException) as conflict:
                change_stream_entry_status(entry["id"], self.owner_id, StreamEntryStatus.DELETED, connection)
            self.assertEqual(conflict.exception.status_code, 409)
            with connection.cursor() as cursor:
                cursor.execute("SELECT event FROM stream_entry_audits WHERE entry_id = %s ORDER BY created_at", (entry["id"],))
                self.assertEqual([row["event"] for row in cursor.fetchall()], ["captured", "archived"])

    def test_browser_sessions_are_owner_bound_bounded_and_revocable(self):
        with self.connection() as connection:
            owner_device_id, token = self.browser_session(connection, self.owner_id)
            _, other_token = self.browser_session(connection, self.other_owner_id)
            entry = create_stream_entry(StreamEntryInput(kind=StreamEntryKind.TEXT, content="Private note"), self.owner_id, connection)
            other_entry = create_stream_entry(StreamEntryInput(kind=StreamEntryKind.TEXT, content="Other note"), self.other_owner_id, connection)
            session = require_browser_session(token, connection)
            self.assertEqual(session["id"], owner_device_id)
            self.assertEqual(session["owner_id"], self.owner_id)
            self.assertEqual(require_stream_owner(None, token, connection)["id"], self.owner_id)
            with self.assertRaises(HTTPException) as raw_read:
                require_device_stream_owner(None, connection)
            self.assertEqual(raw_read.exception.status_code, 401)
            read_model = list_browser_stream_entries(self.owner_id, connection, None, None, "all", 1, 1)
            self.assertEqual([item["id"] for item in read_model["entries"]], [entry["id"]])
            self.assertEqual(set(read_model["entries"][0]), {"id", "kind", "status", "title", "summary", "created_at", "updated_at", "archived", "deleted"})
            self.assertTrue(read_model["entries"][0]["summary"] == "Private note")
            self.assertFalse(read_model["has_more"])
            with self.assertRaises(HTTPException) as cross_owner_read:
                get_stream_entry(entry["id"], require_browser_session(other_token, connection)["owner_id"], connection)
            self.assertEqual(cross_owner_read.exception.status_code, 404)
            with self.assertRaises(HTTPException) as cross_owner_mutation:
                change_stream_entry_status(other_entry["id"], self.owner_id, StreamEntryStatus.ARCHIVED, connection)
            self.assertEqual(cross_owner_mutation.exception.status_code, 404)
            for index in range(2):
                create_stream_entry(StreamEntryInput(kind=StreamEntryKind.TEXT, content=f"More {index}"), self.owner_id, connection)
            page = list_browser_stream_entries(self.owner_id, connection, None, None, "all", 1, 2)
            self.assertEqual(len(page["entries"]), 2)
            self.assertTrue(page["has_more"])
            self.assertEqual(MAX_BROWSER_STREAM_PAGE_SIZE, 50)
            replacement_token, _ = create_browser_session(owner_device_id, connection)
            self.assertNotEqual(token, replacement_token)
            with connection.cursor() as cursor:
                cursor.execute("UPDATE browser_sessions SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE token_hash = %s", (secret_hash(token),))
            with self.assertRaises(HTTPException) as expired:
                require_browser_session(token, connection)
            self.assertEqual(expired.exception.detail, "Browser session expired")
            with connection.cursor() as cursor:
                cursor.execute("UPDATE browser_sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = %s", (secret_hash(replacement_token),))
            with self.assertRaises(HTTPException) as revoked:
                require_browser_session(replacement_token, connection)
            self.assertEqual(revoked.exception.detail, "Browser session revoked")
            with self.assertRaises(HTTPException) as malformed:
                require_browser_session("malformed", connection)
            self.assertEqual(malformed.exception.detail, "Browser session invalid")

    @patch("app.main.pulse_homelab", return_value={"available": False, "status": "Unknown", "resources": [], "docker_hosts": [], "last_updated_at": "Unknown"})
    @patch("app.main.calendar_schedule", return_value={"status": "Onbekend", "events": []})
    def test_cortex_today_exposes_factual_unavailable_states(self, _calendar, _pulse):
        with self.connection() as connection:
            payload = get_cortex_today(connection)
        self.assertIn("generated_at", payload)
        self.assertEqual(payload["timezone"], "Europe/Amsterdam")
        self.assertEqual(payload["chrono"]["calendar_status"], "Onbekend")
        self.assertEqual(payload["health"]["unavailable"]["steps"], "Unavailable: geen stappenbron.")
        self.assertEqual(payload["capabilities"]["calendar_write"]["state"], "unavailable")


if __name__ == "__main__":
    unittest.main()
