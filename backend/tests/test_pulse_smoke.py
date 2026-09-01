import unittest

from app.pulse import pulse_value


class PulseSmokeTests(unittest.TestCase):
    def test_known_value_is_preserved(self):
        self.assertEqual(pulse_value("ok"), "ok")


if __name__ == "__main__":
    unittest.main()
