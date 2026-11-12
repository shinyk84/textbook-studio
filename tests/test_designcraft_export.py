import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import designcraft_export as dc


def sample_spread(**overrides):
    spread = {
        "domain": "스포츠",
        "runningHead": "3학년 · 스포츠 · 이동 움직임",
        "subjectLabel": "체육 3",
        "lessonLabel": "1~3차시",
        "headline": "방향을 바꾸며 달려요",
        "learningGoal": "방향 전환 달리기의 기본 동작을 익힌다.",
        "openingQuestion": "친구를 피하려면 어떻게 움직일까요?",
        "roleLabel": "기능 익히기",
        "leftSections": [{"number": 1, "label": "활동 1", "title": "지그재그 달리기", "kind": "activity", "paragraphs": ["① 콘을 놓아요.", "② 달려요."]}],
        "rightSections": [
            {"number": 2, "kind": "box", "title": "안전", "boxType": "안전", "paragraphs": ["주변을 살펴요."]},
            {"number": 3, "kind": "check", "title": "확인해요", "boxType": "스스로 평가", "paragraphs": ["바르게 했나요? ☐ 예 ☐ 아니요"]},
        ],
        "leftVisuals": [{"size": "half", "placement": "top", "description": "달리는 어린이들"}],
        "rightVisuals": [{"size": "small", "placement": "bottom", "description": "동작 순서 그림"}],
    }
    spread.update(overrides)
    return spread


class ScriptGenerationTests(unittest.TestCase):
    def build_lines(self, spreads, image_paths=None):
        layout = dc.BookLayout({"title": "시안"}, image_paths or {}, Path("."))
        for index, spread in enumerate(spreads):
            spread.setdefault("leftPage", 10 + index * 2)
            spread.setdefault("rightPage", 11 + index * 2)
        text = layout.build(spreads, 10, {"designcraft": "a.designcraft", "idml": "a.idml", "pdf": "a.pdf"})
        return layout, text.strip().split("\n")

    def test_script_starts_with_document_in_points_and_ends_with_exports(self):
        _, lines = self.build_lines([sample_spread()])
        command, params = lines[0].split(" ", 1)
        params = json.loads(params)
        self.assertEqual(command, "file.new")
        self.assertAlmostEqual(params["width"], 188 * 72 / 25.4, places=2)
        self.assertEqual(params["startPage"], 10)
        self.assertTrue(params["facingPages"])
        self.assertEqual([line.split(" ", 1)[0] for line in lines[-3:]], ["file.save", "file.exportIdml", "file.exportPdf"])
        self.assertFalse(json.loads(lines[-2].split(" ", 1)[1])["embedImages"])

    def test_references_point_to_earlier_frame_steps(self):
        _, lines = self.build_lines([sample_spread()])
        for index, line in enumerate(lines):
            for ref in __import__("re").findall(r"\$(\d+)\.", line):
                self.assertLess(int(ref), index)
                self.assertTrue(lines[int(ref)].startswith(("frame.create", "layer.new")), lines[int(ref)])

    def test_text_select_ranges_are_utf8_byte_offsets_within_story(self):
        _, lines = self.build_lines([sample_spread()])
        stories = {}
        for index, line in enumerate(lines):
            command, params = line.split(" ", 1)
            params = json.loads(params)
            if command == "frame.create" and params.get("content") == "text":
                stories[index] = len(params["text"].encode("utf-8"))
            if command == "text.select":
                step = int(params["story"][1:].split(".")[0])
                self.assertIn(step, stories)
                self.assertLessEqual(params["focus"], stories[step])
                self.assertLessEqual(params["anchor"], params["focus"])

    def test_box_and_check_sections_use_shaded_styles_and_safe_symbols(self):
        rows = dc.section_paragraphs({"kind": "check", "title": "확인해요", "paragraphs": ["했나요? ☐ 예"]})
        self.assertEqual(rows[0], ("확인제목", "확인해요"))
        self.assertEqual(rows[1], ("확인본문", "했나요? □ 예"))
        rows = dc.section_paragraphs({"boxType": "안전", "title": "안전", "paragraphs": ["살펴요."]})
        self.assertEqual(rows, [("상자제목", "안전"), ("상자본문", "살펴요.")])
        rows = dc.section_paragraphs({"label": "활동 1", "title": "달리기", "paragraphs": ["달려요."]})
        self.assertEqual(rows, [("절제목", "활동 1  달리기"), ("본문", "달려요.")])

    def test_domain_styles_are_created_once_and_applied(self):
        _, lines = self.build_lines([sample_spread(), sample_spread()])
        created = [json.loads(line.split(" ", 1)[1])["name"] for line in lines if line.startswith("style.paragraph.create")]
        self.assertEqual(created.count("단원명·스포츠"), 1)
        self.assertIn('style.paragraph.apply {"name": "단원명·스포츠"}', lines)

    def test_images_are_placed_and_missing_ones_get_instruction_frames(self):
        spread = sample_spread()
        spread["leftVisuals"][0]["key"] = "s001l1"
        _, lines = self.build_lines([spread], {"s001l1": "C:/x/img.png"})
        places = [json.loads(line.split(" ", 1)[1]) for line in lines if line.startswith("file.place")]
        self.assertEqual(len(places), 1)
        self.assertEqual(places[0]["path"], "C:/x/img.png")
        self.assertTrue(any("그림: 동작 순서 그림" in line for line in lines))

    def test_long_text_shrinks_visuals_before_overflowing(self):
        long_text = "가" * 1400
        spread = sample_spread(rightSections=[{"title": "긴 글", "paragraphs": [long_text]}], rightVisuals=[{"size": "half", "placement": "bottom", "description": "그림"}])
        _, lines = self.build_lines([spread])
        graphic_heights = []
        for line in lines:
            command, params = line.split(" ", 1)
            params = json.loads(params)
            if command == "frame.create" and params.get("content") == "graphic" and params["rect"][0] > dc.pt(188):
                graphic_heights.append(params["rect"][3] - params["rect"][1])
        self.assertTrue(any(abs(height - dc.pt(26)) < 0.5 for height in graphic_heights), graphic_heights)


class GuardTests(unittest.TestCase):
    def test_is_inside(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            inner = root / "a" / "b.pdf"
            inner.parent.mkdir()
            inner.write_text("x")
            self.assertTrue(dc.is_inside(root, str(inner)))
            self.assertFalse(dc.is_inside(root, str(root.parent / "other.pdf")))
            self.assertFalse(dc.is_inside(root, str(root / ".." / "escape.pdf")))

    def test_build_requires_installation(self):
        with mock.patch.object(dc, "find_designcraft", return_value=None):
            with self.assertRaisesRegex(ValueError, "DesignCraft를 찾지 못했습니다"):
                dc.build_designcraft_book({"spreads": [sample_spread()]}, Path("."), lambda _: None)

    def test_build_requires_spreads(self):
        with mock.patch.object(dc, "find_designcraft", return_value={"cli": "x", "app": "", "dir": "."}):
            with self.assertRaisesRegex(ValueError, "펼침면이 없습니다"):
                dc.build_designcraft_book({"spreads": []}, Path("."), lambda _: None)


@unittest.skipUnless(dc.find_designcraft(), "DesignCraft가 설치된 컴퓨터에서만 실행")
class RealBuildTests(unittest.TestCase):
    def test_builds_designcraft_idml_and_pdf(self):
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.dict(os.environ, {"DESIGNCRAFT_OUTPUT_DIR": folder}):
                result = dc.build_designcraft_book({"title": "테스트 시안", "startPage": 5, "spreads": [sample_spread(), sample_spread()]}, Path("."), lambda _: None)
            self.assertEqual(result["startPage"], 6)
            self.assertEqual(result["pages"], 4)
            self.assertEqual(result["errors"], [])
            for path in result["files"].values():
                self.assertTrue(Path(path).is_file(), path)
            self.assertTrue(Path(result["files"]["pdf"]).read_bytes().startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
