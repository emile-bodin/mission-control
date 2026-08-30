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
                {"starts_at": "2099-01-02T10:30", "summary": "Planning, personal", "all_day": False},
                {"starts_at": "2099-01-03T12:00", "summary": "Folded calendaritem", "all_day": False},
            ],
        )

    def test_includes_end_time(self):
        events = parse_ics_events(
            "BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20990102T103000\nDTEND:20990102T110000\nSUMMARY:Appointment\nEND:VEVENT\nEND:VCALENDAR",
            now=datetime(2099, 1, 1),
        )

        self.assertEqual(events[0]["ends_at"], "2099-01-02T11:00")

    def test_rejects_invalid_calendar(self):
        with self.assertRaises(ValueError):
            parse_ics_events("not an ICS calendar")
