import os
import unittest
from unittest.mock import patch
from uuid import uuid4

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row
from pydantic import ValidationError

from app.main import (
    StreamEntryInput,
    StreamEntryKind,
    StreamEntryStatus,
    change_stream_entry_status,
    cortex_today,
    create_stream_entry,
    get_stream_entry,
    get_cortex_today,
    list_stream_entries,
    run_migrations,
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


@unittest.skipUnless(TEST_DATABASE_URL, "set CORTEX_TEST_DATABASE_URL for Cortex integration tests")
class CortexTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        run_migrations()

    def setUp(self):
        self.owner_id = f"hyd-197-owner-{uuid4()}"
        self.other_owner_id = f"hyd-197-owner-{uuid4()}"

    def tearDown(self):
        with self.connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM stream_entry_audits WHERE owner_id IN (%s, %s)", (self.owner_id, self.other_owner_id))
                cursor.execute("DELETE FROM stream_entries WHERE owner_id IN (%s, %s)", (self.owner_id, self.other_owner_id))

    def connection(self):
        return psycopg.connect(TEST_DATABASE_URL, row_factory=dict_row)

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
