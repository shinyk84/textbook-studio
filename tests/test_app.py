import json
import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path


class StudioDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["TEXTBOOK_STUDIO_DB"] = str(Path(cls.temp_dir.name) / "studio.db")
        import app

        cls.app = app
        cls.app.DB_PATH = Path(os.environ["TEXTBOOK_STUDIO_DB"])
        cls.app.initialize_database()

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_discovers_all_processed_documents(self):
        payload = self.app.bootstrap_payload()
        self.assertEqual(payload["readiness"]["total"], 29)
        self.assertEqual(payload["readiness"]["integrity_verified"], 29)

    def test_uses_bundled_processed_data_by_default(self):
        self.assertEqual(
            self.app.PROCESSED_DIR,
            self.app.APP_DIR / "official-data" / "processed",
        )
        self.assertTrue(self.app.PROCESSED_DIR.is_dir())

    def test_processed_data_remains_usable_without_original_pdf(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            folder = Path(temp_dir)
            (folder / "document.md").write_text("공식 전처리 내용", encoding="utf-8")
            manifest = {
                "outputs": ["document.md"],
                "pages": [{"source_page": 1}],
                "page_count": 1,
                "source_file": "criteria/not-present-anywhere.pdf",
                "source_sha256": "a" * 64,
            }
            self.assertEqual(
                self.app.determine_integrity(manifest, folder),
                "processed_only",
            )
        ready = self.app.readiness(
            [
                {
                    "integrity_status": "processed_only",
                    "review_status": "approved",
                }
            ]
        )
        self.assertTrue(ready["is_ready"])
        self.assertEqual(ready["processed_only"], 1)
        self.assertEqual(ready["source_verified"], 0)

    def test_default_project_constraints(self):
        project = self.app.project_payload()
        self.assertEqual(project["page_baseline"], 120)
        self.assertEqual(project["page_min"], 108)
        self.assertEqual(project["page_max"], 132)
        self.assertEqual(project["supplement_max"], 10)
        self.assertEqual(project["band_hours_34"], 204)
        self.assertEqual(project["default_grade_hours"], 102)

    def test_rejects_invalid_page_range(self):
        payload = dict(self.app.DEFAULT_PROJECT)
        payload["page_baseline"] = 150
        with self.assertRaises(ValueError):
            self.app.validate_project(payload)

    def test_source_approval_updates_readiness(self):
        sources = self.app.source_rows()
        first = sources[0]
        updated = self.app.update_source(
            first["document_id"],
            {"review_status": "approved", "review_note": "원본 대조 완료"},
        )
        self.assertEqual(updated["review_status"], "approved")
        self.assertEqual(updated["review_note"], "원본 대조 완료")

    def test_extracts_elementary_pe_standards(self):
        standards = self.app.curriculum_standard_rows()
        self.assertEqual(len(standards), 49)
        counts = self.app.analysis_statistics(standards)
        self.assertEqual(counts["grade_bands"]["3~4학년군"], 23)
        self.assertEqual(counts["grade_bands"]["5~6학년군"], 26)
        self.assertEqual(counts["domains"]["운동"], 12)
        self.assertEqual(counts["domains"]["스포츠"], 22)
        self.assertEqual(counts["domains"]["표현"], 15)
        self.assertEqual(sum(bool(item["explanation"]) for item in standards), 49)
        self.assertTrue(all(item["explanation_source_page"] > 0 for item in standards))

    def test_analysis_save_creates_version(self):
        current = self.app.analysis_record()
        payload = {
            key: current[key]
            for key in (
                "title",
                "overview",
                "grade_bands",
                "domains",
                "editorial_implications",
            )
        }
        payload["overview"] += " 테스트 저장."
        updated = self.app.store_analysis(payload, "단위 테스트")
        self.assertGreater(updated["version"], current["version"])
        self.assertTrue(updated["overview"].endswith("테스트 저장."))

    def test_analysis_rejects_stale_editor_version(self):
        current = self.app.analysis_record()
        payload = {
            key: deepcopy(current[key])
            for key in (
                "title",
                "overview",
                "grade_bands",
                "domains",
                "editorial_implications",
            )
        }
        payload["expected_version"] = current["version"]
        self.app.update_analysis(deepcopy(payload))
        with self.assertRaises(self.app.VersionConflictError):
            self.app.update_analysis(deepcopy(payload))

    def test_analysis_hwpx_export_is_valid_zip_package(self):
        content, filename = self.app.export_hwpx("analysis")
        self.assertTrue(content.startswith(b"PK"))
        self.assertTrue(filename.endswith(".hwpx"))
        self.assertGreater(len(content), 5000)

    def test_hwpx_export_rejects_unknown_scope(self):
        with self.assertRaises(ValueError):
            self.app.export_hwpx("unknown")

    def test_direction_has_three_editable_options(self):
        direction = self.app.direction_record()
        self.assertEqual(
            {option["id"] for option in direction["options"]},
            {"balanced", "field", "engaging"},
        )
        self.assertEqual(direction["selected_option_id"], "balanced")
        self.assertEqual(len(direction["policies"]), 5)

    def test_direction_save_creates_version(self):
        current = self.app.direction_record()
        payload = {
            key: current[key]
            for key in (
                "title",
                "purpose",
                "target_learner",
                "selected_option_id",
                "options",
                "common_principles",
                "policies",
                "success_criteria",
            )
        }
        payload["purpose"] += " 테스트 저장."
        updated = self.app.store_direction(payload, "단위 테스트")
        self.assertGreater(updated["version"], current["version"])
        self.assertTrue(updated["purpose"].endswith("테스트 저장."))

    def test_direction_approval_requires_analysis_approval(self):
        with self.assertRaises(ValueError):
            self.app.approve_direction()

    def test_allocation_covers_49_standards_and_408_hours(self):
        allocation = self.app.allocation_record()
        self.assertEqual(len(allocation["assignments"]), 49)
        self.assertEqual(
            len({assignment["code"] for assignment in allocation["assignments"]}),
            49,
        )
        summary = self.app.allocation_summary(allocation)
        self.assertTrue(summary["all_balanced"])
        self.assertEqual(summary["total_allocated"], 408)
        self.assertEqual(summary["zero_hour_codes"], [])
        for grade in ("3", "4", "5", "6"):
            self.assertEqual(summary["grades"][grade]["allocated"], 102)

    def test_allocation_respects_grade_bands(self):
        standards = {
            standard["code"]: standard for standard in self.app.curriculum_standard_rows()
        }
        for assignment in self.app.allocation_record()["assignments"]:
            allowed = (
                {3, 4}
                if standards[assignment["code"]]["grade_band"] == "3~4학년군"
                else {5, 6}
            )
            self.assertIn(assignment["grade"], allowed)

    def test_allocation_save_creates_version(self):
        current = self.app.allocation_record()
        payload = {
            key: current[key]
            for key in ("title", "planning_note", "target_hours", "assignments")
        }
        payload["planning_note"] += " 테스트 저장."
        updated = self.app.store_allocation(payload, "단위 테스트")
        self.assertGreater(updated["version"], current["version"])
        self.assertTrue(updated["planning_note"].endswith("테스트 저장."))

    def test_allocation_approval_requires_direction_approval(self):
        with self.assertRaises(ValueError):
            self.app.approve_allocation()

    def test_content_candidates_cover_all_standards_and_domains(self):
        content = self.app.content_record()
        self.assertEqual(len(content["candidates"]), 14)
        summary = self.app.content_summary(content)
        self.assertEqual(summary["covered_standard_count"], 49)
        self.assertEqual(summary["uncovered_codes"], [])
        self.assertTrue(summary["all_domains_selected"])
        for grade in ("3", "4", "5", "6"):
            self.assertTrue(summary["grades"][grade]["all_domains_selected"])

    def test_content_official_candidates_have_sources_and_safety_notes(self):
        for candidate in self.app.content_record()["candidates"]:
            self.assertEqual(candidate["source_type"], "official")
            self.assertGreater(candidate["source_page"], 0)
            self.assertTrue(candidate["safety_note"])
            self.assertLessEqual(len(candidate["selected_grades"]), 1)
            self.assertTrue(candidate["activity_groups"])
            for group in candidate["activity_groups"]:
                self.assertTrue(group["official_title"])
                self.assertTrue(group["middle_unit_title"])
                self.assertTrue(group["small_units"])

    def test_content_rejects_common_grade_selection(self):
        current = self.app.content_record()
        payload = {
            key: current[key] for key in ("title", "selection_note", "candidates")
        }
        payload["candidates"] = [
            dict(candidate) for candidate in payload["candidates"]
        ]
        payload["candidates"][0]["selected_grades"] = [3, 4]
        with self.assertRaisesRegex(ValueError, "한 학년에만"):
            self.app.validate_content_payload(payload)

    def test_content_allows_duplicate_middle_and_small_units(self):
        current = self.app.content_record()
        payload = {
            key: current[key] for key in ("title", "selection_note", "candidates")
        }
        payload["candidates"] = json.loads(json.dumps(payload["candidates"]))
        grade_three = next(
            candidate
            for candidate in payload["candidates"]
            if candidate["selected_grades"] == [3]
        )
        duplicated_group = json.loads(
            json.dumps(grade_three["activity_groups"][0])
        )
        duplicated_group["small_units"].append(
            dict(duplicated_group["small_units"][0])
        )
        grade_three["activity_groups"].append(duplicated_group)
        clean = self.app.validate_content_payload(payload)
        clean_grade_three = next(
            candidate
            for candidate in clean["candidates"]
            if candidate["id"] == grade_three["id"]
        )
        self.assertEqual(
            clean_grade_three["activity_groups"][0]["middle_unit_title"],
            clean_grade_three["activity_groups"][-1]["middle_unit_title"],
        )
        self.assertEqual(
            clean_grade_three["activity_groups"][-1]["small_units"][0][
                "draft_title"
            ],
            clean_grade_three["activity_groups"][-1]["small_units"][-1][
                "draft_title"
            ],
        )

    def test_content_save_creates_version(self):
        current = self.app.content_record()
        payload = {
            key: current[key] for key in ("title", "selection_note", "candidates")
        }
        payload["selection_note"] += " 테스트 저장."
        updated = self.app.store_content(payload, "단위 테스트")
        self.assertGreater(updated["version"], current["version"])
        self.assertTrue(updated["selection_note"].endswith("테스트 저장."))

    def test_content_approval_requires_allocation_approval(self):
        with self.assertRaises(ValueError):
            self.app.approve_content()

    def test_outline_combines_valid_grade_hours_and_pages(self):
        outline = self.app.workflow_stage_record("outline")
        summary = self.app.workflow_stage_summary("outline", outline)
        self.assertTrue(summary["valid"])
        for grade in ("3", "4", "5", "6"):
            self.assertEqual(summary["grades"][grade]["hours"], 102)
            self.assertEqual(summary["grades"][grade]["pages"], 120)

    def test_design_and_manuscript_follow_upstream_units(self):
        outline = self.app.workflow_stage_record("outline")
        design = self.app.workflow_stage_record("design")
        manuscript = self.app.workflow_stage_record("manuscript")
        outline_units = sum(
            len(grade["units"]) for grade in outline["grades"].values()
        )
        self.assertEqual(len(design["units"]), outline_units)
        self.assertEqual(len(manuscript["chapters"]), len(design["units"]))
        self.assertTrue(self.app.workflow_stage_summary("design", design)["valid"])
        self.assertTrue(
            self.app.workflow_stage_summary("manuscript", manuscript)["valid"]
        )

    def test_manuscript_catalog_does_not_send_all_page_drafts(self):
        payload = self.app.manuscript_catalog_record()
        self.assertNotIn("chapters", payload["stage"])
        self.assertTrue(payload["catalog"])
        first_small_unit = payload["catalog"][0]["sections"][0]["small_units"][0]
        self.assertIn("title", first_small_unit)
        self.assertIn("spread_count", first_small_unit)
        self.assertNotIn("spreads", first_small_unit)

    def test_manuscript_loads_only_selected_small_unit(self):
        catalog = self.app.manuscript_catalog_record()["catalog"]
        chapter = catalog[0]
        selected = self.app.manuscript_small_unit_payload(
            chapter["id"],
            chapter["sections"][0]["index"],
            chapter["sections"][0]["small_units"][0]["index"],
        )
        self.assertEqual(selected["chapter"]["id"], chapter["id"])
        self.assertEqual(selected["section"]["index"], 0)
        self.assertTrue(selected["small_unit"]["spreads"])
        self.assertNotIn("sections", selected["chapter"])

    def test_small_unit_hwpx_export_is_valid_zip_package(self):
        catalog = self.app.manuscript_catalog_record()["catalog"]
        chapter = catalog[0]
        content, filename = self.app.export_manuscript_small_unit_hwpx(
            chapter["id"],
            chapter["sections"][0]["index"],
            chapter["sections"][0]["small_units"][0]["index"],
        )
        self.assertTrue(content.startswith(b"PK"))
        self.assertTrue(filename.endswith(".hwpx"))
        self.assertGreater(len(content), 3000)

    def test_selected_small_unit_can_be_saved_without_replacing_others(self):
        catalog = self.app.manuscript_catalog_record()["catalog"]
        chapter = catalog[0]
        before = self.app.manuscript_small_unit_payload(chapter["id"], 0, 0)
        sibling = self.app.manuscript_small_unit_payload(chapter["id"], 0, 1)
        edited = deepcopy(before["small_unit"])
        edited["instruction"] += " 선택 저장 테스트."
        updated = self.app.update_manuscript_small_unit(
            {
                "chapter_id": chapter["id"],
                "section_index": 0,
                "small_unit_index": 0,
                "expected_version": before["manuscript_version"],
                "small_unit": edited,
            }
        )
        self.assertTrue(
            updated["small_unit"]["instruction"].endswith("선택 저장 테스트.")
        )
        sibling_after = self.app.manuscript_small_unit_payload(chapter["id"], 0, 1)
        self.assertEqual(sibling["small_unit"], sibling_after["small_unit"])

    def test_review_is_independent_and_checks_current_outputs(self):
        review = self.app.workflow_stage_record("review")
        self.assertIn("앞 단계의 선택 근거와 선호 점수는 제외", review["review_note"])
        self.assertEqual(review["hard_checks"]["achievement_standards"], 49)
        self.assertTrue(review["hard_checks"]["grade_hours_valid"])
        self.assertTrue(review["hard_checks"]["grade_pages_valid"])
        self.assertIn("Ⅰ. 교육과정의 준수", review["scores"])
        self.assertEqual(len(review["criteria_results"]), 22)
        self.assertEqual(review["criteria_source"]["pdf_pages"], "20~21")

    def test_workflow_save_creates_version(self):
        current = self.app.workflow_stage_record("outline")
        payload = {
            key: value
            for key, value in current.items()
            if key not in {"status", "version", "updated_at", "approved_at"}
        }
        payload["planning_note"] += " 테스트 저장."
        updated = self.app.store_workflow_stage("outline", payload, "단위 테스트")
        self.assertGreater(updated["version"], current["version"])

    def test_outline_approval_requires_content_approval(self):
        with self.assertRaises(ValueError):
            self.app.approve_workflow_stage("outline")


if __name__ == "__main__":
    unittest.main()
