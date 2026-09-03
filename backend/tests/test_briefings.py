import unittest
from datetime import UTC, datetime
from unittest.mock import patch

from app.briefings import BriefingOutput, BriefingRuntimeError, BriefingRuntimeTimeout, CodexRuntime, schedule_due


class BriefingTests(unittest.TestCase):
    def test_schedule_runs_once_after_seven_amsterdam(self):
        morning = datetime(2026, 9, 4, 5, 1, tzinfo=UTC)  # 07:01 Europe/Amsterdam
        self.assertTrue(schedule_due(morning, None))
        self.assertFalse(schedule_due(morning, datetime(2026, 9, 4, 5, 0, tzinfo=UTC)))

    def test_schedule_waits_until_seven(self):
        self.assertFalse(schedule_due(datetime(2026, 9, 4, 4, 59, tzinfo=UTC), None))

    def test_schema_rejects_unexpected_agent_output(self):
        with self.assertRaises(Exception):
            BriefingOutput.model_validate({"summary": "ok", "facts": [], "proposals": [], "unknowns": [], "extra": "no"})

    def test_runtime_requires_configuration(self):
        with self.assertRaises(BriefingRuntimeError):
            CodexRuntime("", "").run({})

    def test_runtime_maps_gateway_timeout(self):
        from urllib.error import HTTPError

        with patch("app.briefings.urlopen", side_effect=HTTPError("http://runtime/run", 504, "timeout", {}, None)):
            with self.assertRaises(BriefingRuntimeTimeout):
                CodexRuntime("http://runtime", "token").run({})

    def test_runtime_accepts_schema_valid_mock_output(self):
        class Response:
            def read(self):
                return b'{"state":"completed","output":"{\\\"summary\\\":\\\"Vandaag\\\",\\\"facts\\\":[\\\"feit\\\"],\\\"proposals\\\":[],\\\"unknowns\\\":[]}"}'

            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

        with patch("app.briefings.urlopen", return_value=Response()):
            output = CodexRuntime("http://runtime", "token").run({"agenda": {}})
        self.assertEqual(output.summary, "Vandaag")


if __name__ == "__main__":
    unittest.main()
