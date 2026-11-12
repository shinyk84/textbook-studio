import os
import tempfile
import unittest
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

    def test_data_folder_moves_work_then_reopens_from_another_location(self):
        # 작업 데이터 폴더: 빈 폴더를 고르면 지금 DB·조판 결과를 옮기고, 다른 위치로 복사한 폴더를 고르면 그대로 연다.
        import shutil
        from unittest import mock

        original_db = self.app.DB_PATH
        original_output = os.environ.get("DESIGNCRAFT_OUTPUT_DIR")
        settings = {}
        with tempfile.TemporaryDirectory() as folder:
            builds = Path(folder) / "old_builds" / "책_20261112-1350"
            builds.mkdir(parents=True)
            (builds / "책.designcraft").write_bytes(b"x")
            os.environ["DESIGNCRAFT_OUTPUT_DIR"] = str(builds.parent)
            image_id = self.app.store_prototype_image("QUJD")
            try:
                with mock.patch.object(self.app, "write_local_setting", lambda name, value: settings.__setitem__(name, value)):
                    first = Path(folder) / "테스트 연결폴더"
                    first.mkdir()
                    moved = self.app.switch_data_folder(first)
                    self.assertEqual(moved["mode"], "moved")
                    data_dir = first / "_도구데이터"
                    self.assertEqual(self.app.DB_PATH, (data_dir / "studio.db").resolve())
                    self.assertEqual(self.app.fetch_prototype_image(image_id), "QUJD")
                    self.assertTrue((data_dir / "조판결과" / "책_20261112-1350" / "책.designcraft").is_file())
                    self.assertEqual(settings["TEXTBOOK_STUDIO_DATA_DIR"], str(data_dir.resolve()))
                    old_path = str(builds / "책.designcraft")
                    self.assertEqual(self.app.designcraft_build_path(old_path), data_dir / "조판결과" / "책_20261112-1350" / "책.designcraft")
                    # 다른 컴퓨터: 폴더를 다른 위치로 복사해 고른다.
                    copied = Path(folder) / "다른컴" / "복사한 폴더"
                    shutil.copytree(first, copied)
                    self.app.DB_PATH = original_db
                    opened = self.app.switch_data_folder(copied)
                    self.assertEqual(opened["mode"], "opened")
                    self.assertEqual(self.app.fetch_prototype_image(image_id), "QUJD")
                    self.assertTrue(self.app.designcraft_build_path(old_path).is_file())
                    self.assertEqual(self.app.switch_data_folder(copied)["mode"], "same")
            finally:
                self.app.DB_PATH = original_db
                if original_output is None:
                    os.environ.pop("DESIGNCRAFT_OUTPUT_DIR", None)
                else:
                    os.environ["DESIGNCRAFT_OUTPUT_DIR"] = original_output

    def test_work_folder_files_stay_inside_folder(self):
        # 원고 PDF·이력 같은 결과 파일도 서버가 작업 폴더에 쓴다. 폴더 밖이나 _도구데이터에는 쓰지 못한다.
        from unittest import mock

        with tempfile.TemporaryDirectory() as folder:
            data_dir = Path(folder) / "테스트 연결폴더" / "_도구데이터"
            data_dir.mkdir(parents=True)
            with mock.patch.object(self.app, "configured_data_dir", lambda: data_dir):
                self.app.work_folder_write("초등 체육/3학년/초안/원고.txt", "가나다".encode("utf-8"))
                self.assertEqual((data_dir.parent / "초등 체육/3학년/초안/원고.txt").read_text(encoding="utf-8"), "가나다")
                self.assertEqual(self.app.work_folder_list("초등 체육/3학년/초안", "file"), ["원고.txt"])
                self.assertEqual(self.app.work_folder_list("", "directory"), ["_도구데이터", "초등 체육"])
                for bad in ("../밖.txt", "_도구데이터/studio.db", ""):
                    with self.assertRaises(ValueError):
                        self.app.work_folder_write(bad, b"x")
            with mock.patch.object(self.app, "configured_data_dir", lambda: None):
                with self.assertRaisesRegex(ValueError, "작업 폴더를 먼저"):
                    self.app.work_folder_list("")

    def test_uses_bundled_processed_data_by_default(self):
        self.assertEqual(
            self.app.PROCESSED_DIR,
            self.app.APP_DIR / "official-data" / "processed",
        )
        self.assertTrue(self.app.PROCESSED_DIR.is_dir())

    def test_extracts_elementary_pe_standards(self):
        document_path = self.app.curriculum_document_path()
        self.assertIsNotNone(document_path)
        standards = self.app.extract_curriculum_standards(document_path)
        self.assertEqual(len(standards), 49)
        bands = [item["grade_band"] for item in standards]
        domains = [item["domain"] for item in standards]
        self.assertEqual(bands.count("3~4학년군"), 23)
        self.assertEqual(bands.count("5~6학년군"), 26)
        self.assertEqual(domains.count("운동"), 12)
        self.assertEqual(domains.count("스포츠"), 22)
        self.assertEqual(domains.count("표현"), 15)
        self.assertEqual(sum(bool(item["explanation"]) for item in standards), 49)
        self.assertTrue(all(item["explanation_source_page"] > 0 for item in standards))

    def test_prototype_image_round_trips_and_rejects_unknown_id(self):
        image_id = self.app.store_prototype_image("QQ==")
        self.assertEqual(self.app.fetch_prototype_image(image_id), "QQ==")
        self.assertEqual(self.app.call_prototype_image_get(image_id), {"imageBase64": "QQ=="})
        self.assertIsNone(self.app.fetch_prototype_image("no-such-id"))
        with self.assertRaises(ValueError):
            self.app.call_prototype_image_get("no-such-id")

    def test_sports_culture_image_endpoint_stores_and_returns_image_id(self):
        original = self.app.call_openai_for_sports_culture_image
        self.app.call_openai_for_sports_culture_image = lambda description, size, audience="": {"imageBase64": "QQ=="}
        try:
            result = self.app.call_prototype_sports_culture_image({"description": "테스트", "size": "small"})
        finally:
            self.app.call_openai_for_sports_culture_image = original
        self.assertEqual(result["imageBase64"], "QQ==")
        self.assertEqual(self.app.fetch_prototype_image(result["imageId"]), "QQ==")

    def test_mockup_build_mode_objects_cuts_art_from_plate_and_plate_mode_lays_plate(self):
        # 개체 조판(기본)은 바탕판을 깔지 않고 삽화를 바탕판에서 오리게 하고, 시안 그림 그대로는 바탕판을 깐다.
        import base64
        import io

        import mockup_typeset
        from PIL import Image

        def png():
            buffer = io.BytesIO()
            Image.new("RGB", (8, 8), (255, 255, 255)).save(buffer, format="PNG")
            return base64.b64encode(buffer.getvalue()).decode("ascii")

        image_id = self.app.store_prototype_image(png())
        plate_id = self.app.store_prototype_image(png())
        self.app.store_mockup_layout(image_id, {"size": [8, 8], "background": "#FFFFFF", "items": [], "plateId": plate_id})
        captured = []
        original = mockup_typeset.build_mockup_book
        mockup_typeset.build_mockup_book = lambda specs, app_dir, title, start_page: captured.append([dict(spec) for spec in specs]) or {}
        try:
            self.app.call_designcraft_mockup_build({"spreads": [{"imageId": image_id}]})
            self.app.call_designcraft_mockup_build({"spreads": [{"imageId": image_id}], "mode": "plate"})
        finally:
            mockup_typeset.build_mockup_book = original
        objects, plate = captured[0][0], captured[1][0]
        self.assertIn("artSource", objects)
        self.assertNotIn("plate", objects)
        self.assertIn("plate", plate)
        self.assertNotIn("artSource", plate)

    def test_design_mockup_endpoints_store_image_and_layout_then_build(self):
        import mockup_typeset

        spread = {"headline": "농구 기본 기능", "leftPage": 64, "rightPage": 65}
        with self.assertRaises(ValueError):
            self.app.call_designcraft_mockup({"spread": {}})
        originals = (self.app.secret_environment_value, mockup_typeset.request_mockup_image, mockup_typeset.request_layout, mockup_typeset.build_mockup_book)
        captured = {}
        self.app.secret_environment_value = lambda name: "test-key"
        mockup_typeset.request_mockup_image = lambda key, payload, references, instruction="", **_: captured.setdefault("instruction", instruction) and "QQ=="
        mockup_typeset.request_layout = lambda key, model, image, payload: {"size": [1536, 1024], "background": "#FFFFFF", "items": [{"kind": "text", "box": [0, 0, 10, 10], "text": "가"}]}

        def fake_build(specs, app_dir, title, start_page):
            captured["specs"] = specs
            captured["image_exists"] = Path(specs[0]["image"]).is_file()
            return {"spreads": len(specs), "title": title, "startPage": start_page}

        mockup_typeset.build_mockup_book = fake_build
        try:
            created = self.app.call_designcraft_mockup({"spread": spread, "instruction": "더 밝게"})
            self.assertEqual(captured["instruction"], "더 밝게")
            self.assertEqual(self.app.fetch_prototype_image(created["imageId"]), "QQ==")
            with self.assertRaisesRegex(ValueError, "배치 명세가 없습니다"):
                self.app.call_designcraft_mockup_build({"spreads": [{"imageId": created["imageId"]}]})
            read = self.app.call_designcraft_mockup_layout({"imageId": created["imageId"], "spread": spread})
            self.assertEqual(read["items"], 1)
            built = self.app.call_designcraft_mockup_build({"title": "시안", "startPage": 64, "spreads": [{"imageId": created["imageId"]}]})
        finally:
            self.app.secret_environment_value, mockup_typeset.request_mockup_image, mockup_typeset.request_layout, mockup_typeset.build_mockup_book = originals
        self.assertEqual(built, {"spreads": 1, "title": "시안", "startPage": 64})
        self.assertTrue(captured["image_exists"])
        self.assertEqual(captured["specs"][0]["items"][0]["text"], "가")
        with self.assertRaisesRegex(ValueError, "시안 이미지를 찾지 못했습니다"):
            self.app.call_designcraft_mockup_layout({"imageId": "no-such-id"})

    def test_state_save_archives_previous_version_before_overwrite(self):
        marker = f"history-marker-{id(self)}"
        first = self.app.store_prototype_state({"projects": [f"{marker}-v1"]}, None)
        self.app.store_prototype_state({"projects": [f"{marker}-v2"]}, first["version"])
        with self.app.connect_db() as db:
            archived = db.execute(
                "SELECT payload FROM prototype_state_history WHERE version = ?", (first["version"],)
            ).fetchone()
            not_yet_archived = db.execute(
                "SELECT payload FROM prototype_state_history WHERE payload LIKE ?", (f"%{marker}-v2%",)
            ).fetchone()
        self.assertIsNotNone(archived, "이전 버전(v1)은 저장 전에 이력에 남아 있어야 한다")
        self.assertIn(f"{marker}-v1", archived["payload"])
        self.assertIsNone(not_yet_archived, "방금 저장한 v2는 다음 저장 전까지 이력에 들어가면 안 된다")

    def test_restore_prototype_state_history_brings_back_old_payload_as_new_version(self):
        marker = f"restore-marker-{id(self)}"
        good = self.app.store_prototype_state({"projects": [f"{marker}-good"]}, None)
        bad = self.app.store_prototype_state({"projects": [f"{marker}-bad-emptied"]}, good["version"])
        with self.app.connect_db() as db:
            row = db.execute(
                "SELECT id FROM prototype_state_history WHERE payload LIKE ?", (f"%{marker}-good%",)
            ).fetchone()
        restored = self.app.restore_prototype_state_history(row["id"])
        self.assertEqual(restored["payload"], {"projects": [f"{marker}-good"]})
        self.assertGreater(restored["version"], bad["version"])

    def test_restore_prototype_state_history_rejects_unknown_id(self):
        with self.assertRaises(ValueError):
            self.app.restore_prototype_state_history(999_999_999)


if __name__ == "__main__":
    unittest.main()
