import os
import unittest
from contextlib import ExitStack
from datetime import UTC, date, datetime, time
from unittest.mock import patch

import psycopg

from app import main


class TodayAggregationTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 3, 28, 23, 30, tzinfo=UTC)
        self.actions = [
            {"id": "a-today", "title": "Today", "status": "Open", "priority": "Low", "domain": "administratie", "due_date": date(2026, 3, 29)},
            {"id": "a-overdue", "title": "Overdue", "status": "Bezig", "priority": "High", "domain": "huis_gezin", "due_date": date(2026, 3, 28)},
            {"id": "a-upcoming", "title": "Upcoming", "status": "Open", "priority": "Low", "domain": "huis_gezin", "due_date": date(2026, 3, 30)},
            {"id": "a-project", "title": "Project context", "status": "Open", "priority": "High", "domain": "project", "due_date": date(2026, 3, 28)},
            {"id": "a-done", "title": "Done", "status": "Klaar", "priority": "High", "domain": "administratie", "due_date": date(2026, 3, 28)},
        ]
        self.routines = [{"id": "r-1", "title": "Morning", "frequency": "daily", "reminder_time": time(8, 0)}]

    def view(self, now=None, env=None, **overrides):
        values = {
            "list_actions": self.actions,
            "due_routines_for_date": self.routines,
            "list_projects": [],
            "list_status_cards": [],
            "list_health_weights": [],
            "list_health_activities": [],
            "calendar_schedule": {"status": "Beschikbaar", "events": []},
            "pulse_homelab": {"available": True, "resources": []},
        }
        values.update(overrides)
        with patch.dict(os.environ, env or {}, clear=True), ExitStack() as stack:
            for name, value in values.items():
                if isinstance(value, BaseException):
                    stack.enter_context(patch.object(main, name, side_effect=value))
                else:
                    stack.enter_context(patch.object(main, name, return_value=value))
            return main.build_today_view(object(), now or self.now)

    def test_actions_domains_and_due_buckets(self):
        view = self.view()
        self.assertEqual(view.local_date, date(2026, 3, 29))
        self.assertEqual([item.id for item in view.sections.overdue.items], ["a-overdue"])
        self.assertEqual([item.id for item in view.sections.today.items], ["a-today"])
        self.assertEqual([item.id for item in view.sections.upcoming.items], ["a-upcoming"])
        self.assertEqual([item.id for item in view.sections.context.items], ["a-project"])
        self.assertNotIn("a-done", {item["id"] for section in view.sections.model_dump().values() for item in section["items"]})

    def test_routine_is_due_and_has_reminder(self):
        view = self.view()
        routine = view.sections.routines.items[0]
        self.assertEqual(routine.id, "r-1")
        self.assertEqual(routine.due_date, date(2026, 3, 29))
        self.assertEqual(routine.reminder_time, time(8, 0))
        self.assertFalse(routine.details["completed"])

    def test_health_recent_and_empty_are_valid(self):
        empty = self.view()
        self.assertEqual(empty.sources["health"].status, main.TodayStatus.EMPTY)
        self.assertEqual(empty.sources["projects"].status, main.TodayStatus.EMPTY)
        self.assertEqual(empty.sources["status_cards"].status, main.TodayStatus.EMPTY)
        self.assertEqual(empty.sources["calendar"].status, main.TodayStatus.NOT_CONFIGURED)
        self.assertEqual(empty.sources["homelab"].status, main.TodayStatus.NOT_CONFIGURED)
        recent = self.view(
            list_health_weights=[{"id": "w-1", "measured_at": datetime(2026, 3, 28, 8, tzinfo=UTC), "normalized_kg": 80.2, "source": "manual"}],
            list_health_activities=[{"id": "h-1", "activity_type": "wandelen", "started_at": datetime(2026, 3, 28, 9, tzinfo=UTC), "duration_seconds": 1800, "source": "manual"}],
        )
        self.assertEqual(recent.sources["health"].status, main.TodayStatus.AVAILABLE)
        self.assertEqual([item.kind for item in recent.sections.context.items if item.source == "health"], ["health_weight", "health_activity"])

    def test_context_signals_and_homelab_exception_do_not_displace_personal_focus(self):
        view = self.view(
            env={"PULSE_BASE_URL": "http://pulse"},
            list_projects=[{"slug": "p-1", "display_name": "Project", "status": "Active", "personal_status": "Unknown", "product_key": "P"}],
            list_status_cards=[
                {"id": "card-action", "title": "Attention", "status": "Actie nodig", "resolved_at": None},
                {"id": "card-blocked", "title": "Blocked", "status": "Geblokkeerd", "resolved_at": None},
            ],
            pulse_homelab={"available": True, "resources": [
                {"id": "host-1", "name": "Host", "status": "OK"},
                {"id": "service-1", "name": "Service", "status": "Down"},
            ]},
        )
        self.assertEqual([item.id for item in view.sections.overdue.items[:2]], ["card-blocked", "card-action"])
        self.assertEqual([item.id for item in view.sections.context.items if item.kind == "homelab_exception"], ["service-1"])
        self.assertEqual([item.id for item in view.sections.context.items if item.kind == "project"], ["p-1"])

    def test_source_failure_keeps_other_sections_available(self):
        view = self.view(
            env={"PULSE_BASE_URL": "http://pulse"},
            pulse_homelab={"available": False, "resources": []},
            list_health_weights=psycopg.OperationalError("health query failed"),
        )
        self.assertEqual(view.sources["health"].status, main.TodayStatus.ERROR)
        self.assertEqual(view.sources["homelab"].status, main.TodayStatus.UNAVAILABLE)
        self.assertEqual(view.sections.today.status, main.TodayStatus.PARTIAL)
        self.assertEqual([item.id for item in view.sections.routines.items], ["r-1"])
        self.assertEqual([item.id for item in view.sections.context.items], ["a-project"])

    def test_response_shape_and_local_midnight_boundary(self):
        before = self.view(now=datetime(2026, 3, 28, 22, 59, tzinfo=UTC))
        after = self.view(now=datetime(2026, 3, 28, 23, 0, tzinfo=UTC))
        self.assertEqual(before.local_date, date(2026, 3, 28))
        self.assertEqual(after.local_date, date(2026, 3, 29))
        self.assertEqual([item.id for item in before.sections.upcoming.items], ["a-today", "a-upcoming"])
        self.assertEqual([item.id for item in after.sections.today.items], ["a-today"])
        payload = after.model_dump(mode="json")
        self.assertEqual(set(payload), {"generated_at", "timezone", "local_date", "sources", "sections"})
        self.assertEqual(set(payload["sections"]), {"overdue", "today", "routines", "upcoming", "context"})
        self.assertEqual(payload["timezone"], "Europe/Amsterdam")
        self.assertEqual(main.product_local_date(datetime(2026, 3, 29, 1, 30, tzinfo=UTC)), date(2026, 3, 29))
        route = next(route for route in main.app.routes if getattr(route, "path", None) == "/api/today")
        self.assertIs(route.response_model, main.TodayViewModel)

    def test_stable_sorting_uses_due_priority_title_id(self):
        actions = [
            {"id": "b", "title": "Same", "status": "Open", "priority": "Low", "domain": "administratie", "due_date": date(2026, 3, 29)},
            {"id": "a", "title": "Same", "status": "Open", "priority": "Low", "domain": "administratie", "due_date": date(2026, 3, 29)},
            {"id": "c", "title": "First", "status": "Open", "priority": "High", "domain": "administratie", "due_date": date(2026, 3, 29)},
        ]
        view = self.view(list_actions=actions)
        self.assertEqual([item.id for item in view.sections.today.items], ["c", "a", "b"])


if __name__ == "__main__":
    unittest.main()
