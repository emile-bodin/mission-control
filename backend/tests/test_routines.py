import json
import os
import unittest
from datetime import UTC, date, datetime, time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from pydantic import ValidationError

from app.main import (
    RoutineFrequency,
    RoutineInput,
    RoutineOccurrenceInput,
    RoutinePatch,
    complete_routine,
    create_routine,
    due_routines_for_date,
    get_routine,
    list_routine_completions,
    product_local_date,
    run_migrations,
    uncomplete_routine,
    update_routine,
)


TEST_DATABASE_URL = os.environ.get("ROUTINE_TEST_DATABASE_URL")
TEST_BASE_URL = os.environ.get("ROUTINE_TEST_BASE_URL")


@unittest.skipUnless(TEST_DATABASE_URL, "set ROUTINE_TEST_DATABASE_URL for PostgreSQL routine integration tests")
class RoutineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["DATABASE_URL"] = TEST_DATABASE_URL
        run_migrations()

    def setUp(self):
        self.prefix = f"hyd-168-{uuid4()}"

    def tearDown(self):
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM routines WHERE id LIKE %s", (f"{self.prefix}%",))

    def connection(self):
        return psycopg.connect(TEST_DATABASE_URL, row_factory=dict_row)

    def create(
        self,
        frequency: RoutineFrequency = RoutineFrequency.DAILY,
        weekdays: list[int] | None = None,
        active: bool = True,
        owner_id: str | None = None,
    ) -> dict:
        with self.connection() as connection:
            return create_routine(
                RoutineInput(
                    title=f"{self.prefix}-{frequency.value}",
                    active=active,
                    frequency=frequency,
                    weekdays=weekdays or [],
                    reminder_time=time(9, 30),
                    owner_id=owner_id,
                ),
                connection,
            )

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

    def test_00_migration_is_idempotent_and_preserves_routine_data(self):
        routine_id = f"{self.prefix}-legacy"
        created_at = datetime(2025, 1, 2, 3, 4, 5, tzinfo=UTC)
        updated_at = datetime(2025, 2, 3, 4, 5, 6, tzinfo=UTC)
        with psycopg.connect(TEST_DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO routines (id, title, active, frequency, weekdays, reminder_time, owner_id, created_at, updated_at)
                    VALUES (%s, 'Existing routine', TRUE, 'weekly', '[1]'::jsonb, TIME '08:00', 'future-owner', %s, %s)
                    """,
                    (routine_id, created_at, updated_at),
                )
        run_migrations()
        run_migrations()
        with self.connection() as connection:
            routine = get_routine(routine_id, connection)
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT pg_get_constraintdef(pg_constraint.oid)
                    FROM pg_constraint
                    JOIN pg_class ON pg_class.oid = pg_constraint.conrelid
                    WHERE pg_class.relname = 'routine_completions' AND pg_constraint.contype = 'u'
                    """
                )
                constraints = [row["pg_get_constraintdef"] for row in cursor.fetchall()]
        self.assertEqual(routine["title"], "Existing routine")
        self.assertEqual(routine["weekdays"], [1])
        self.assertEqual(routine["owner_id"], "future-owner")
        self.assertEqual(routine["created_at"], created_at)
        self.assertEqual(routine["updated_at"], updated_at)
        self.assertIn("UNIQUE (routine_id, occurrence_date)", constraints)

    def test_create_daily_weekly_and_selected_weekday_routines(self):
        daily = self.create()
        weekly = self.create(RoutineFrequency.WEEKLY, [2], owner_id="future-owner")
        selected = self.create(RoutineFrequency.SELECTED_WEEKDAYS, [1, 3])
        self.assertEqual(daily["frequency"], "daily")
        self.assertEqual(weekly["weekdays"], [2])
        self.assertEqual(weekly["owner_id"], "future-owner")
        self.assertEqual(selected["weekdays"], [1, 3])

    def test_invalid_schedules_and_reminder_time_are_rejected(self):
        common = {"title": "invalid", "reminder_time": "09:30"}
        invalid = [
            {**common, "frequency": "daily", "weekdays": [1]},
            {**common, "frequency": "weekly", "weekdays": []},
            {**common, "frequency": "weekly", "weekdays": [1, 2]},
            {**common, "frequency": "selected_weekdays", "weekdays": []},
            {**common, "frequency": "selected_weekdays", "weekdays": [0]},
            {**common, "frequency": "selected_weekdays", "weekdays": [1, 1]},
            {"title": "invalid", "frequency": "daily", "reminder_time": "25:00"},
        ]
        for payload in invalid:
            with self.assertRaises(ValidationError):
                RoutineInput.model_validate(payload)

    def test_patch_revalidates_combined_schedule(self):
        routine = self.create()
        with self.connection() as connection:
            with self.assertRaises(ValidationError):
                update_routine(routine["id"], RoutinePatch(frequency=RoutineFrequency.WEEKLY), connection)
            updated = update_routine(
                routine["id"],
                RoutinePatch(frequency=RoutineFrequency.SELECTED_WEEKDAYS, weekdays=[2, 4], owner_id="future-owner"),
                connection,
            )
            cleared_owner = update_routine(routine["id"], RoutinePatch(owner_id=None), connection)
        self.assertEqual(updated["frequency"], "selected_weekdays")
        self.assertEqual(updated["weekdays"], [2, 4])
        self.assertEqual(updated["owner_id"], "future-owner")
        self.assertIsNone(cleared_owner["owner_id"])

    def test_due_scheduling_for_daily_weekly_selected_and_inactive(self):
        daily = self.create()
        weekly_tuesday = self.create(RoutineFrequency.WEEKLY, [2])
        selected_monday_wednesday = self.create(RoutineFrequency.SELECTED_WEEKDAYS, [1, 3])
        inactive = self.create(active=False)
        monday = date(2026, 1, 5)
        tuesday = date(2026, 1, 6)
        with self.connection() as connection:
            monday_due = due_routines_for_date(connection, monday)
            tuesday_due = due_routines_for_date(connection, tuesday)
        monday_ids = {routine["id"] for routine in monday_due}
        tuesday_ids = {routine["id"] for routine in tuesday_due}
        self.assertIn(daily["id"], monday_ids)
        self.assertIn(selected_monday_wednesday["id"], monday_ids)
        self.assertNotIn(weekly_tuesday["id"], monday_ids)
        self.assertIn(weekly_tuesday["id"], tuesday_ids)
        self.assertNotIn(selected_monday_wednesday["id"], tuesday_ids)
        self.assertNotIn(inactive["id"], monday_ids | tuesday_ids)

    def test_complete_is_idempotent_and_history_hides_completed_occurrence(self):
        routine = self.create()
        occurrence_date = date(2026, 1, 5)
        with self.connection() as connection:
            first = complete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=occurrence_date), connection)
            second = complete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=occurrence_date), connection)
            history = list_routine_completions(routine["id"], connection)
            due = due_routines_for_date(connection, occurrence_date)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual([completion["id"] for completion in history], [first["id"]])
        self.assertNotIn(routine["id"], [item["id"] for item in due])

    def test_uncomplete_is_idempotent_and_keeps_other_history(self):
        routine = self.create()
        monday = date(2026, 1, 5)
        tuesday = date(2026, 1, 6)
        with self.connection() as connection:
            complete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=monday), connection)
            complete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=tuesday), connection)
            first = uncomplete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=monday), connection)
            second = uncomplete_routine(routine["id"], RoutineOccurrenceInput(occurrence_date=monday), connection)
            history = list_routine_completions(routine["id"], connection)
            due = due_routines_for_date(connection, monday)
        self.assertTrue(first["removed"])
        self.assertFalse(second["removed"])
        self.assertEqual([completion["occurrence_date"] for completion in history], [tuesday])
        self.assertIn(routine["id"], [item["id"] for item in due])

    def test_product_timezone_handles_winter_summer_dst_and_day_boundaries(self):
        cases = [
            (datetime(2026, 1, 15, 22, 30, tzinfo=UTC), date(2026, 1, 15)),
            (datetime(2026, 7, 15, 21, 30, tzinfo=UTC), date(2026, 7, 15)),
            (datetime(2026, 3, 29, 0, 30, tzinfo=UTC), date(2026, 3, 29)),
            (datetime(2026, 3, 29, 1, 30, tzinfo=UTC), date(2026, 3, 29)),
            (datetime(2026, 10, 25, 0, 30, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 10, 25, 1, 30, tzinfo=UTC), date(2026, 10, 25)),
            (datetime(2026, 1, 15, 22, 59, tzinfo=UTC), date(2026, 1, 15)),
            (datetime(2026, 1, 15, 23, 0, tzinfo=UTC), date(2026, 1, 16)),
        ]
        for timestamp, expected_date in cases:
            self.assertEqual(product_local_date(timestamp), expected_date)

    @unittest.skipUnless(TEST_BASE_URL, "set ROUTINE_TEST_BASE_URL for routine API integration tests")
    def test_api_crud_due_completion_and_history(self):
        status, routine = self.request(
            "POST",
            "/api/routines",
            {"title": f"{self.prefix}-api", "frequency": "daily", "reminder_time": "08:00", "owner_id": None},
        )
        self.assertEqual(status, 201)
        self.assertIsNone(routine["owner_id"])
        status, updated = self.request("PATCH", f"/api/routines/{routine['id']}", {"reminder_time": "10:15"})
        self.assertEqual(status, 200)
        self.assertEqual(updated["reminder_time"], "10:15:00")

        today = product_local_date().isoformat()
        status, due = self.request("GET", "/api/routines/due")
        self.assertEqual(status, 200)
        self.assertIn(routine["id"], [item["id"] for item in due])
        status, completion = self.request("POST", f"/api/routines/{routine['id']}/complete", {"occurrence_date": today})
        self.assertEqual(status, 200)
        status, repeated = self.request("POST", f"/api/routines/{routine['id']}/complete", {"occurrence_date": today})
        self.assertEqual(status, 200)
        self.assertEqual(repeated["id"], completion["id"])
        status, history = self.request("GET", f"/api/routines/{routine['id']}/completions")
        self.assertEqual(status, 200)
        self.assertEqual(len(history), 1)


if __name__ == "__main__":
    unittest.main()
