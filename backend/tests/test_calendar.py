from datetime import datetime
from pathlib import Path
import unittest

from app.main import parse_ics_events


class CalendarParserTests(unittest.TestCase):
    def test_parses_future_events_from_local_fixture(self):
        content = (Path(__file__).parent / "fixtures" / "calendar.ics").read_text()

        events = parse_ics_events(content, now=datetime(2099, 1, 1))

        self.assertEqual(
            events,
            [
                {"starts_at": "2099-01-02T10:30", "summary": "Planning, personal"},
                {"starts_at": "2099-01-03T12:00", "summary": "Folded calendaritem"},
            ],
        )

    def test_rejects_invalid_calendar(self):
        with self.assertRaises(ValueError):
            parse_ics_events("not an ICS calendar")
