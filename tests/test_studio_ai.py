import base64
import io
import json
import unittest
from unittest import mock

import studio_ai


class FakeResponse:
    def __init__(self, payload: dict):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def ai_reply(data: dict) -> FakeResponse:
    return FakeResponse({"status": "completed", "output_text": json.dumps(data, ensure_ascii=False)})


class EvidenceSearchTests(unittest.TestCase):
    def test_finds_elementary_throwing_pages_for_the_right_grade(self):
        found = studio_ai.search_evidence("던지기 기본 동작 익히기 놀이", level="elementary", grade=3, limit=5)
        self.assertTrue(found)
        self.assertTrue(all("던지" in item["excerpt"] for item in found[:3]))
        catalog = {doc["id"]: doc for doc in studio_ai.document_catalog()}
        self.assertTrue(all(catalog[item["documentId"]]["grade"] in (None, 3) for item in found))

    def test_sports_culture_search_stays_in_sports_culture_books(self):
        found = studio_ai.search_evidence("스포츠 문화의 의미와 형성", level="sports-culture", limit=4)
        catalog = {doc["id"]: doc for doc in studio_ai.document_catalog()}
        self.assertTrue(found)
        self.assertTrue(all(catalog[item["documentId"]]["level"] == "sports-culture" for item in found))

    def test_empty_query_returns_nothing(self):
        self.assertEqual(studio_ai.search_evidence("   "), [])


class FeedbackTests(unittest.TestCase):
    def _xlsx(self) -> str:
        from openpyxl import Workbook

        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["학교", "단점"])
        sheet.append(["가초", "활동 설명이 너무 길어요"])
        buffer = io.BytesIO()
        workbook.save(buffer)
        return base64.b64encode(buffer.getvalue()).decode("ascii")

    def test_collects_excel_text_images_and_note(self):
        image = base64.b64encode(b"\x89PNG fake").decode("ascii")
        text, images, notes = studio_ai.collect_feedback_material(
            [{"name": "만족도.xlsx", "base64": self._xlsx()}, {"name": "설문.jpg", "base64": image}, {"name": "x.hwp", "base64": image}],
            "운동장이 좁은 학교용 대체 활동",
        )
        self.assertIn("활동 설명이 너무 길어요", text)
        self.assertIn("운동장이 좁은 학교용 대체 활동", text)
        self.assertEqual(images[0][0], "image/jpeg")
        self.assertTrue(any("지원하지 않는" in note for note in notes))

    def test_analyze_sends_images_and_numbers_items(self):
        reply = ai_reply({"summary": "요약", "opinion_count": 2, "items": [{
            "title": "활동 설명이 길다", "kind": "개선 요구", "priority": "상", "scope": "책 전반", "target": "책 전반",
            "count": 2, "evidence": ["너무 길어요"], "reflect": "단계 그림 위주", "recommend": True}]})
        with mock.patch.object(studio_ai, "urlopen", return_value=reply) as opened:
            result = studio_ai.analyze_feedback("key", "model", [{"name": "a.png", "base64": "AAAA"}], "메모", {"subject": "초등 체육"})
        body = json.loads(opened.call_args.args[0].data.decode("utf-8"))
        kinds = [part["type"] for part in body["input"][0]["content"]]
        self.assertEqual(kinds, ["input_text", "input_image"])
        self.assertEqual(body["text"]["format"]["strict"], True)
        self.assertEqual(result["items"][0]["id"], "f1")
        self.assertEqual(result["opinionCount"], 2)

    def test_analyze_rejects_empty_input(self):
        with self.assertRaises(ValueError):
            studio_ai.analyze_feedback("key", "model", [], "  ", {})


class RevisionTests(unittest.TestCase):
    PAGES = [
        {"page": "64~65", "label": "던지기", "text": "공을 멀리 던져 봐요. 던지기 활동 설명이 길게 이어집니다."},
        {"page": "66~67", "label": "표현", "text": "리듬에 맞춰 몸으로 표현해요."},
    ]

    def test_rank_pages_prefers_related_text(self):
        ranked = studio_ai.rank_pages({"title": "던지기 활동 설명이 길다", "evidence": []}, self.PAGES)
        self.assertEqual(ranked[0]["page"], "64~65")

    def test_propose_revisions_sends_candidate_pages_only(self):
        reply = ai_reply({"issues": [{"issue_id": "f1", "related_pages": [{"page": "64~65", "reason": "던지기"}], "recommended_scale": "미세",
                                      "scale_reason": "조판 후", "options": [{"scale": s, "summary": s, "layout_impact": "없음", "edits": []} for s in ("대폭", "중간", "미세")]}]})
        with mock.patch.object(studio_ai, "urlopen", return_value=reply) as opened:
            result = studio_ai.propose_revisions("key", "model", [{"id": "f1", "title": "던지기 설명이 길다", "evidence": ["길어요"]}], self.PAGES)
        sent = json.loads(opened.call_args.args[0].data.decode("utf-8"))["input"][0]["content"][0]["text"]
        self.assertIn("64~65쪽", sent)
        self.assertNotIn("리듬에 맞춰", sent)
        self.assertEqual(result["issues"][0]["recommended_scale"], "미세")

    def test_propose_revisions_requires_issues_and_pages(self):
        with self.assertRaises(ValueError):
            studio_ai.propose_revisions("key", "model", [], self.PAGES)
        with self.assertRaises(ValueError):
            studio_ai.propose_revisions("key", "model", [{"id": "f1"}], [])


class DerivedTests(unittest.TestCase):
    GUIDE = {"title": "던지기 지도서", "unit_overview": "개관", "standards": ["[4체02-02]"], "background_knowledge": ["팔꿈치"],
             "lessons": [{"lesson_label": "55차시", "goal": "던지기", "materials": ["공"], "questions": ["어떻게?"],
                          "flow": [{"stage": "도입", "minutes": 5, "teacher": "시범", "student": "관찰", "notes": ""}],
                          "differentiation": "쉬운 공", "alternative_activity": "앉아서 던지기", "safety": "간격", "assessment": "관찰"}]}

    def test_generate_requires_manuscript_and_known_kind(self):
        with self.assertRaises(ValueError):
            studio_ai.generate_derived("key", "model", "unknown", {"manuscript": "x"})
        with self.assertRaises(ValueError):
            studio_ai.generate_derived("key", "model", "guide", {"manuscript": ""})

    def test_generate_guide_uses_schema_and_manuscript(self):
        with mock.patch.object(studio_ai, "urlopen", return_value=ai_reply(self.GUIDE)) as opened:
            result = studio_ai.generate_derived("key", "model", "guide", {"manuscript": "던지기 원고", "unitLabel": "던지기", "gradeLabel": "3학년", "level": "elementary"})
        body = json.loads(opened.call_args.args[0].data.decode("utf-8"))
        self.assertEqual(body["text"]["format"]["name"], "derived_guide")
        self.assertIn("던지기 원고", body["input"][0]["content"][0]["text"])
        self.assertEqual(result["label"], "지도서")

    def test_every_schema_is_strict(self):
        def check(node):
            if isinstance(node, dict) and node.get("type") == "object":
                self.assertFalse(node["additionalProperties"])
                self.assertEqual(sorted(node["required"]), sorted(node["properties"]))
                for child in node["properties"].values():
                    check(child)
            elif isinstance(node, dict) and node.get("type") == "array":
                check(node["items"])
        for schema in [*studio_ai.DERIVED_SCHEMAS.values(), studio_ai.FEEDBACK_SCHEMA, studio_ai.REVISION_SCHEMA]:
            check(schema)

    def test_hwpx_download_for_each_kind(self):
        samples = {
            "guide": self.GUIDE,
            "worksheet": {"title": "활동지", "sheets": [{"title": "던지기", "lesson_label": "55차시", "directions": "써 봐요", "items": [{"prompt": "몇 번?", "response_type": "빈칸", "lines": 2}], "self_check": ["잘했나요"]}]},
            "assessment": {"title": "평가지", "standards": ["[4체02-02]"], "items": [{"number": 1, "item_type": "선택형", "question": "?", "choices": ["가", "나"], "answer": "가", "explanation": "이유"}], "performance_task": {"task": "던지기", "criteria": [{"criterion": "자세", "high": "상", "middle": "중", "low": "하"}]}},
            "lesson_plan": {"title": "과정안", "plans": [{"lesson_label": "55차시", "goal": "목표", "standards": [], "materials": ["공"], "steps": [{"stage": "도입", "minutes": 5, "activity": "인사", "teacher_notes": ""}], "evaluation": "관찰"}]},
        }
        for kind, data in samples.items():
            content, filename = studio_ai.build_derived_hwpx({"kind": kind, "data": data, "unitLabel": "던지기"})
            self.assertTrue(content.startswith(b"PK"), kind)
            self.assertTrue(filename.endswith(".hwpx"))


if __name__ == "__main__":
    unittest.main()


class RevisionReferenceDataTests(unittest.TestCase):
    def test_generated_reference_data_matches_the_build_script(self):
        import json
        import re
        import subprocess
        import sys
        from pathlib import Path

        root = Path(__file__).resolve().parents[1]
        before = (root / "static" / "revision-reference-data.js").read_text(encoding="utf-8")
        subprocess.run([sys.executable, str(root / "scripts" / "build_revision_reference.py")], check=True, capture_output=True)
        after = (root / "static" / "revision-reference-data.js").read_text(encoding="utf-8")
        self.assertEqual(before, after)
        data = json.loads(re.search(r"window\.REVISION_REFERENCE = (.*);\s*$", after, re.S).group(1))
        self.assertEqual(len(data["revisions"]["2015"]["books"]), 14)
        sports = data["revisions"]["2009"]["highSportsCulture"]
        self.assertEqual(sum(unit["hours"] for unit in sports["units"]), 102)
        self.assertTrue(all(unit["pages"] > 0 for unit in sports["units"]))


class MockupLayoutEditTests(unittest.TestCase):
    def test_saving_edited_text_updates_only_text_items(self):
        import tempfile
        from pathlib import Path

        import app

        with tempfile.TemporaryDirectory() as folder, mock.patch.object(app, "DB_PATH", Path(folder) / "t.db"):
            layout = {"size": [1536, 1024], "background": "#FFFFFF", "items": [
                {"kind": "box", "box": [0, 0, 10, 10]},
                {"kind": "text", "box": [0, 0, 100, 20], "text": "농구 기본 기능"},
            ]}
            app.store_mockup_layout("img1", layout)
            result = app.call_designcraft_mockup_layout_save({"imageId": "img1", "texts": {"0": "x", "1": "던지기 기본 기능"}})
            self.assertEqual(result["changed"], 1)
            saved = app.call_designcraft_mockup_layout_get({"imageId": "img1"})["layout"]["items"]
            self.assertEqual(saved[1]["text"], "던지기 기본 기능")
            self.assertNotIn("text", saved[0])
            with self.assertRaises(ValueError):
                app.call_designcraft_mockup_layout_get({"imageId": "missing"})


class MockupPlateTests(unittest.TestCase):
    def test_plate_erases_text_inside_colored_tags_and_keeps_the_tag(self):
        from PIL import Image, ImageDraw

        import mockup_typeset

        image = Image.new("RGB", (200, 100), "#F6F1FB")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle([20, 20, 120, 50], radius=12, fill="#7B5BB3")
        draw.rectangle([40, 30, 100, 40], fill="#FFFFFF")  # 꼬리표 안의 흰 글자 자리
        layout = {"size": [200, 100], "items": [
            {"kind": "box", "box": [20, 20, 120, 50], "fill": "#7B5BB3", "radius": 12},
            {"kind": "text", "box": [20, 20, 120, 50], "text": "영역형", "color": "#FFFFFF"},
        ]}
        plate, complex_boxes = mockup_typeset.erase_text_locally(image, layout)
        self.assertEqual(complex_boxes, [])
        self.assertEqual(plate.getpixel((70, 35)), (0x7B, 0x5B, 0xB3))
        self.assertEqual(plate.getpixel((5, 5)), (0xF6, 0xF1, 0xFB))
