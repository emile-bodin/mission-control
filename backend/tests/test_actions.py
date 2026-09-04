import json
import os
import unittest
from datetime import UTC, datetime
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from pydantic import ValidationError

from app.main import ActionDomain, ActionInput, ActionPatch, create_action, get_action, list_actions, run_migrations, update_action


TEST_DATABASE_URL = os.environ.get("ACTION_TEST_DATABASE_URL")
TEST_BASE_URL = os.environ.get("ACTION_TEST_BASE_URL")


@unittest.skipUnless(TEST_DATABASE_URL, "set ACTION_TEST_DATABASE_URL for PostgreSQL action integration tests")
class ActionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        run_migrations()

    def setUp(self):
        self.prefix = f"hyd-167-{uuid4()}"
        self.card_id = f"{self.prefix}-card"
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO status_cards (
                        id, title, status, facts, interpretation, next_safe_step, source_type, source_reference
                    ) VALUES (%s, %s, 'OK', 'fact', 'interpretation', 'next step', 'test', 'hyd-167')
                    """,
                    (self.card_id, "HYD-167 test card"),
                )

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM actions WHERE id LIKE %s", (f"{self.prefix}%",))
                cursor.execute("DELETE FROM status_cards WHERE id = %s", (self.card_id,))

    def connection(self):
        return psycopg.connect(TEST_DATABASE_URL, row_factory=dict_row)

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

    def create(self, domain: ActionDomain = ActionDomain.PROJECT, owner_id: str | None = None):
        with self.connection() as connection:
            return create_action(
                ActionInput(
                    title=f"{self.prefix}-{domain.value}",
                    domain=domain,
                    owner_id=owner_id,
                    status_card_id=self.card_id,
                ),
                connection,
            )

    def test_00_migration_preserves_legacy_action_and_is_idempotent(self):
        action_id = f"{self.prefix}-legacy"
        created_at = datetime(2025, 1, 2, 3, 4, 5, tzinfo=UTC)
        updated_at = datetime(2025, 2, 3, 4, 5, 6, tzinfo=UTC)
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_domain_check")
                cursor.execute("ALTER TABLE actions DROP COLUMN IF EXISTS owner_id")
                cursor.execute("ALTER TABLE actions DROP COLUMN IF EXISTS domain")
                cursor.execute(
                    """
                    INSERT INTO actions (id, title, type, status, priority, status_card_id, due_date, created_at, updated_at)
                    VALUES (%s, 'Legacy action', 'Unknown', 'Open', 'Unknown', %s, DATE '2025-01-02', %s, %s)
                    """,
                    (action_id, self.card_id, created_at, updated_at),
                )

        run_migrations()
        run_migrations()

        with self.connection() as connection:
            legacy = get_action(action_id, connection)
        self.assertEqual(legacy["id"], action_id)
        self.assertEqual(legacy["title"], "Legacy action")
        self.assertEqual(legacy["status_card_id"], self.card_id)
        self.assertEqual(legacy["due_date"].isoformat(), "2025-01-02")
        self.assertEqual(legacy["created_at"], created_at)
        self.assertEqual(legacy["updated_at"], updated_at)
        self.assertEqual(legacy["domain"], ActionDomain.PROJECT.value)
        self.assertIsNone(legacy["owner_id"])

    def test_create_accepts_each_domain_and_null_owner(self):
        for domain in ActionDomain:
            action = self.create(domain)
            self.assertEqual(action["domain"], domain.value)
            self.assertIsNone(action["owner_id"])

    def test_default_domain_keeps_old_clients_compatible(self):
        with self.connection() as connection:
            action = create_action(ActionInput(title=f"{self.prefix}-old-client"), connection)
        self.assertEqual(action["domain"], ActionDomain.PROJECT.value)

    def test_domain_filter_and_status_card_link_remain_available(self):
        project_action = self.create(ActionDomain.PROJECT)
        household_action = self.create(ActionDomain.HOUSEHOLD)
        with self.connection() as connection:
            actions = list_actions(ActionDomain.PROJECT, connection)
            linked_action = get_action(project_action["id"], connection)
        self.assertIn(project_action["id"], [action["id"] for action in actions])
        self.assertNotIn(household_action["id"], [action["id"] for action in actions])
        self.assertEqual(linked_action["status_card_id"], self.card_id)

    def test_invalid_domain_is_rejected(self):
        with self.assertRaises(ValidationError):
            ActionInput(title="invalid", domain="invalid")
        with self.assertRaises(ValidationError):
            ActionPatch(domain=None)

    @unittest.skipUnless(TEST_BASE_URL, "set ACTION_TEST_BASE_URL for action API integration tests")
    def test_api_rejects_invalid_domain_and_filters(self):
        status, created = self.request(
            "POST",
            "/api/actions",
            {"title": f"{self.prefix}-api", "domain": "huis_gezin", "owner_id": None},
        )
        self.assertEqual(status, 201)
        self.assertEqual(created["domain"], "huis_gezin")
        self.assertIsNone(created["owner_id"])

        status, invalid = self.request("POST", "/api/actions", {"title": "invalid", "domain": "invalid"})
        self.assertEqual(status, 422)
        self.assertIn("domain", str(invalid))

        status, filtered = self.request("GET", "/api/actions?domain=huis_gezin")
        self.assertEqual(status, 200)
        self.assertIn(created["id"], [action["id"] for action in filtered])

    def test_update_domain_and_null_owner(self):
        action = self.create(ActionDomain.ADMINISTRATION, owner_id="future-owner")
        with self.connection() as connection:
            updated = update_action(
                action["id"],
                ActionPatch(domain=ActionDomain.HOUSEHOLD, owner_id=None),
                connection,
            )
        self.assertEqual(updated["domain"], ActionDomain.HOUSEHOLD.value)
        self.assertIsNone(updated["owner_id"])


if __name__ == "__main__":
    unittest.main()
