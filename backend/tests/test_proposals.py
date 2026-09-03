import os
import unittest
from datetime import timedelta
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row

from app.main import ActionInput, create_action, decide_briefing_proposal, get_action, run_migrations


TEST_DATABASE_URL = os.environ.get("PROPOSAL_TEST_DATABASE_URL")


@unittest.skipUnless(TEST_DATABASE_URL, "set PROPOSAL_TEST_DATABASE_URL for PostgreSQL proposal integration tests")
class ProposalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        run_migrations()

    def setUp(self):
        self.prefix = f"hyd-180-{uuid4()}"
        self.connection = psycopg.connect(TEST_DATABASE_URL, row_factory=dict_row)
        self.action = create_action(ActionInput(title=f"{self.prefix}-action"), self.connection)
        self.briefing_id = f"{self.prefix}-briefing"
        with self.connection.cursor() as cursor:
            cursor.execute("INSERT INTO briefing_runs (id, trigger, status) VALUES (%s, 'manual', 'Completed')", (self.briefing_id,))

    def tearDown(self):
        with self.connection.cursor() as cursor:
            cursor.execute("DELETE FROM briefing_runs WHERE id = %s", (self.briefing_id,))
            cursor.execute("DELETE FROM actions WHERE id = %s", (self.action["id"],))
        self.connection.close()

    def proposal(self, expected_updated_at):
        proposal_id = f"{self.prefix}-proposal-{uuid4()}"
        with self.connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO briefing_proposals (
                    id, briefing_id, title, rationale, record_type, record_id, expected_updated_at,
                    changes, source_context, expected_impact
                ) VALUES (%s, %s, 'Finish action', 'Test', 'action', %s, %s, '{"status":"Klaar"}', '["test"]', 'Done')
                """,
                (proposal_id, self.briefing_id, self.action["id"], expected_updated_at),
            )
        return proposal_id

    def audit_count(self, proposal_id):
        with self.connection.cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS count FROM briefing_proposal_audits WHERE proposal_id = %s", (proposal_id,))
            return cursor.fetchone()["count"]

    def test_accept_is_idempotent_and_audited(self):
        proposal_id = self.proposal(self.action["updated_at"])
        accepted = decide_briefing_proposal(self.connection, proposal_id, "accepted")
        retried = decide_briefing_proposal(self.connection, proposal_id, "accepted")
        self.assertEqual(accepted["status"], "accepted")
        self.assertEqual(retried["status"], "accepted")
        self.assertEqual(get_action(self.action["id"], self.connection)["status"], "Klaar")
        self.assertEqual(self.audit_count(proposal_id), 1)

    def test_reject_does_not_change_domain_record(self):
        proposal_id = self.proposal(self.action["updated_at"])
        rejected = decide_briefing_proposal(self.connection, proposal_id, "rejected")
        self.assertEqual(rejected["status"], "rejected")
        self.assertEqual(get_action(self.action["id"], self.connection)["status"], "Open")
        self.assertEqual(self.audit_count(proposal_id), 1)

    def test_stale_target_fails_without_overwrite(self):
        proposal_id = self.proposal(self.action["updated_at"] - timedelta(seconds=1))
        failed = decide_briefing_proposal(self.connection, proposal_id, "accepted")
        self.assertEqual(failed["status"], "failed")
        self.assertEqual(get_action(self.action["id"], self.connection)["status"], "Open")
        self.assertEqual(self.audit_count(proposal_id), 1)


if __name__ == "__main__":
    unittest.main()
