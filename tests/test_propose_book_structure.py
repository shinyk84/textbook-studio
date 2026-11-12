import statistics
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import propose_book_structure as pbs


class ProposeBookStructureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = pbs.load_baselines()

    def test_allocates_all_hours_and_respects_page_limit(self):
        for rev in ("2015", "2022"):
            for band in ("3-4", "5-6"):
                spec = pbs.spec_from_curriculum(self.data, rev, band)
                result = pbs.propose(spec, self.data, ["2015", "2022"])
                self.assertEqual(result["textbook"]["chasi_total"], 102)
                self.assertTrue(result["textbook"]["within_limit"])
                self.assertTrue(all(u["pages"] % 2 == 0 for u in result["textbook"]["units"]))

    def test_cross_revision_backtest_error_stays_small(self):
        errors = []
        for target, source in (("2022", ["2015"]), ("2015", ["2022"])):
            for band in ("3-4", "5-6"):
                spec = pbs.spec_from_curriculum(self.data, target, band)
                actual = pbs.actual_summary(self.data, target, band)
                result = pbs.propose(spec, self.data, source, "blend")
                errors += [abs(u["chasi"] - actual[u["area"]]["chasi"])
                           for u in result["textbook"]["units"]]
        self.assertLess(statistics.mean(errors), 4)

    def test_project_hours_come_out_of_area_hours(self):
        spec = pbs.spec_from_curriculum(self.data, "2022", "5-6")
        spec["project_chasi"] = 6
        units = pbs.propose(spec, self.data, ["2022"])["textbook"]["units"]
        self.assertEqual(units[-1]["area"], "프로젝트")
        self.assertEqual(sum(u["chasi"] for u in units), 102)


if __name__ == "__main__":
    unittest.main()
