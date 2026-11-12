import base64
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

import designcraft_export as dc
import mockup_typeset as mt

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_LAYOUT = ROOT / "design-references" / "시안 샘플1_배치.json"


def sample_spec(image="시안.png"):
    return {
        "image": image,
        "size": [1536, 1024],
        "background": "#F6F1FB",
        "items": [
            {"kind": "box", "box": [100, 100, 700, 400], "fill": "#FFFFFF", "stroke": "#D6C8EA", "strokeWidth": 2, "radius": 14},
            {"kind": "box", "box": [100, 100, 700, 150], "fill": "#E5F1DB", "radius": 14, "corners": "top"},
            {"kind": "box", "box": [120, 200, 150, 230], "fill": "#8862B3", "shape": "ellipse"},
            {"kind": "box", "box": [300, 300, 340, 340], "stroke": "#E3B5C3", "shape": "star"},
            {"kind": "line", "box": [110, 250, 690, 250], "stroke": "#E3E3E3", "dashed": True},
            {"kind": "art", "box": [500, 200, 600, 300], "label": "어린이"},
            {"kind": "qr", "box": [640, 105, 690, 150]},
            {"kind": "text", "box": [120, 160, 600, 200], "text": "농구 기본 기능 한눈에!", "role": "단원명", "size": 40, "weight": "heavy", "color": "#6B47A6", "font": "display", "spans": [{"match": "한눈에!", "size": 30}]},
            {"kind": "text", "box": [160, 260, 480, 320], "text": "공을 튀기며\n이동해요.", "role": "본문", "size": 14},
            {"kind": "text", "box": [800, 260, 1100, 320], "text": "다른 크기 본문", "role": "본문", "size": 16, "align": "center"},
        ],
    }


def build_lines(spec):
    layout = mt.MockupLayout("시험")
    text = layout.build([spec], [{5: "C:/x/art.png"}], ["C:/x/src.png"], 10, {"designcraft": "a.designcraft", "idml": "a.idml", "pdf": "a.pdf"})
    return layout, [(line.split(" ", 1)[0], json.loads(line.split(" ", 1)[1])) for line in text.strip().split("\n")]


class ScriptTests(unittest.TestCase):
    def test_pixels_map_to_spread_points(self):
        _, lines = build_lines(sample_spec())
        frames = [params for command, params in lines if command == "frame.create"]
        source = frames[0]
        self.assertAlmostEqual(source["rect"][2], dc.pt(dc.PAGE_WIDTH * 2), places=2)
        card = next(params for params in frames if params.get("content") == "graphic" and abs(params["rect"][0] - dc.pt(100 * 376 / 1536)) < 0.01)
        self.assertAlmostEqual(card["rect"][3], dc.pt(400 * 257 / 1024), places=2)

    def test_reference_layer_is_hidden_and_not_printed(self):
        _, lines = build_lines(sample_spec())
        layer_sets = [params for command, params in lines if command == "layer.set"]
        self.assertEqual(layer_sets, [{"id": "$1.id", "visible": False, "locked": True, "printable": False}])

    def test_shapes_corners_and_strokes(self):
        _, lines = build_lines(sample_spec())
        frames = [params for command, params in lines if command == "frame.create"]
        self.assertTrue(any(params.get("shape") == "ellipse" for params in frames))
        self.assertTrue(any(params.get("shape") == "polygon" and params.get("starInset") == 50 for params in frames))
        corners = [params for command, params in lines if command == "object.cornerOptions" and "corners" in params]
        self.assertEqual([corner["shape"] for corner in corners[0]["corners"]], ["rounded", "rounded", "none", "none"])
        dashed = [params for command, params in lines if command == "object.stroke" and params.get("type", {}).get("kind") == "dashed"]
        self.assertEqual(len(dashed), 1)

    def test_art_is_placed_and_qr_created(self):
        _, lines = build_lines(sample_spec())
        places = [params["path"] for command, params in lines if command == "file.place"]
        self.assertEqual(places, ["C:/x/src.png", "C:/x/art.png"])
        self.assertEqual(sum(1 for command, _ in lines if command == "object.qrCode"), 1)

    def test_roles_become_paragraph_styles_and_differences_stay_local(self):
        _, lines = build_lines(sample_spec())
        styles = [params["name"] for command, params in lines if command == "style.paragraph.create"]
        self.assertEqual(styles, ["단원명", "본문"])
        chars = [params["attrs"] for command, params in lines if command == "type.char"]
        self.assertIn({"size": round(30 * 257 / 1024 * dc.PT_PER_MM, 2)}, chars)
        self.assertTrue(any("size" in attrs and attrs["size"] == round(16 * 257 / 1024 * dc.PT_PER_MM, 2) for attrs in chars))
        self.assertIn({"attrs": {"align": "center"}}, [params for command, params in lines if command == "type.para"])

    def test_span_selection_uses_utf8_bytes(self):
        _, lines = build_lines(sample_spec())
        selects = [params for command, params in lines if command == "text.select"]
        title = "농구 기본 기능 한눈에!"
        start = len(title[: title.index("한눈에!")].encode("utf-8"))
        self.assertIn({"story": selects[0]["story"], "anchor": start, "focus": len(title.encode("utf-8"))}, selects)


class PageSplitTests(unittest.TestCase):
    def band(self):
        middle = 768
        inner = mt.INNER_MARGIN_MM * 1536 / 376
        return middle - inner, middle + inner

    def test_nothing_crosses_the_fold_after_split(self):
        spec = json.loads(SAMPLE_LAYOUT.read_text(encoding="utf-8"))
        items, adjusted = mt.split_into_pages(spec)
        left, right = self.band()
        crossing = [item for item in items if item["box"][0] < right - 0.01 and item["box"][2] > left + 0.01]
        self.assertEqual(crossing, [])
        self.assertGreater(adjusted, 0)
        self.assertGreater(len(items), len(spec["items"]))

    def test_wide_background_is_split_and_children_follow_their_side(self):
        spec = {"size": [1536, 1024], "items": [
            {"kind": "box", "box": [50, 100, 1480, 300], "fill": "#FFFFFF", "radius": 10},
            {"kind": "text", "box": [100, 150, 400, 180], "text": "왼쪽", "size": 14},
            {"kind": "text", "box": [1000, 150, 1300, 180], "text": "오른쪽", "size": 14},
            {"kind": "box", "box": [700, 120, 900, 280], "fill": "#EEEEEE"},
            {"kind": "text", "box": [710, 130, 890, 160], "text": "카드 글", "size": 14},
        ]}
        items, _ = mt.split_into_pages(spec)
        left, right = self.band()
        backgrounds = [item for item in items if item.get("fill") == "#FFFFFF"]
        self.assertEqual([round(item["box"][2], 1) for item in backgrounds][:1], [round(left, 1)])
        self.assertEqual(round(backgrounds[1]["box"][0], 1), round(right, 1))
        self.assertEqual(next(item for item in items if item.get("text") == "왼쪽")["box"], [100, 150, 400, 180])
        card = next(item for item in items if item.get("fill") == "#EEEEEE")
        card_text = next(item for item in items if item.get("text") == "카드 글")
        # 오른쪽으로 더 많이 걸친 카드는 글과 함께 오른쪽 쪽으로 옮겨진다.
        self.assertGreaterEqual(card["box"][0], right - 0.01)
        self.assertGreaterEqual(card_text["box"][0], card["box"][0])

    def test_large_art_may_cross_the_fold_but_text_and_small_art_may_not(self):
        spec = {"size": [1536, 1024], "items": [
            {"kind": "box", "box": [40, 380, 1500, 800], "fill": "#FFFFFF"},
            {"kind": "art", "box": [300, 400, 1200, 760], "label": "운동장 장면"},
            {"kind": "art", "box": [720, 420, 820, 500], "label": "작은 공"},
            {"kind": "text", "box": [700, 700, 900, 730], "text": "가운데 글", "size": 14},
        ]}
        items, _ = mt.split_into_pages(spec)
        left, right = self.band()
        scene = next(item for item in items if item.get("label") == "운동장 장면")
        self.assertEqual(scene["box"], [300, 400, 1200, 760])
        for label in ("작은 공", "가운데 글"):
            item = next(item for item in items if label in (item.get("label"), item.get("text")))
            self.assertFalse(item["box"][0] < right - 0.01 and item["box"][2] > left + 0.01, label)

    def test_items_within_one_page_are_untouched(self):
        spec = {"size": [1536, 1024], "items": [{"kind": "text", "box": [100, 100, 600, 140], "text": "가", "size": 14}]}
        items, adjusted = mt.split_into_pages(spec)
        self.assertEqual(items[0]["box"], [100, 100, 600, 140])
        self.assertEqual(adjusted, 0)


class CutOutTests(unittest.TestCase):
    def test_background_connected_to_edges_becomes_transparent(self):
        image = Image.new("RGB", (40, 40), (246, 241, 251))
        for x in range(10, 30):
            for y in range(10, 30):
                image.putpixel((x, y), (30, 120, 200))
        # 그림 안쪽의 바탕색(흰 옷 같은)은 가장자리와 이어지지 않으므로 남아야 한다.
        image.putpixel((20, 20), (246, 241, 251))
        piece = mt.cut_out(image, [0, 0, 40, 40], scale=1)
        self.assertEqual(piece.getpixel((2, 2))[3], 0)
        self.assertEqual(piece.getpixel((15, 15))[3], 255)
        self.assertEqual(piece.getpixel((20, 20))[3], 255)

    def test_keep_leaves_crop_opaque(self):
        image = Image.new("RGB", (20, 20), (255, 255, 255))
        piece = mt.cut_out(image, [0, 0, 20, 20], keep=True, scale=1)
        self.assertEqual(piece.getpixel((0, 0))[3], 255)


class LayoutSanitizeTests(unittest.TestCase):
    def test_bad_items_are_dropped_and_values_clamped(self):
        raw = {
            "background": "lavender",
            "items": [
                {"kind": "box", "box": [700, 400, 100, 100], "fill": "#FFFFFF", "stroke": None},
                {"kind": "text", "box": [0, 0, 10, 10], "text": "  "},
                {"kind": "text", "box": [0, 0, 100, 30], "text": "제목", "size": 400, "color": "purple"},
                {"kind": "art", "box": [5, 5, 6, 6]},
                {"kind": "video", "box": [0, 0, 10, 10]},
                {"kind": "box", "box": [-50, -50, 2000, 1100]},
            ],
        }
        layout = mt.sanitize_layout(raw)
        self.assertEqual(layout["background"], "#FFFFFF")
        self.assertEqual([item["kind"] for item in layout["items"]], ["box", "text", "box"])
        self.assertEqual(layout["items"][0]["box"], [100.0, 100.0, 700.0, 400.0])
        self.assertNotIn("stroke", layout["items"][0])
        self.assertEqual(layout["items"][1]["size"], 120.0)
        self.assertNotIn("color", layout["items"][1])
        self.assertEqual(layout["items"][2]["box"], [-10.0, -10.0, 1546.0, 1034.0])

    def test_sample_layout_file_is_valid(self):
        spec = json.loads(SAMPLE_LAYOUT.read_text(encoding="utf-8"))
        cleaned = mt.sanitize_layout(spec)
        self.assertEqual(len(cleaned["items"]), len(spec["items"]))


def spread_payload():
    return {
        "subjectLabel": "체육 3",
        "runningHead": "3학년 · 스포츠 · 농구형 게임",
        "lessonLabel": "1~2차시",
        "headline": "농구 기본 기능 3가지",
        "learningGoal": "드리블·패스·슛을 익힌다.",
        "leftPage": 64,
        "rightPage": 65,
        "leftSections": [{"label": "활동 1", "title": "드리블", "paragraphs": ["공을 바닥에 튀기며 이동해요."]}],
        "rightSections": [{"boxType": "안전", "title": "안전", "paragraphs": ["주변을 살펴요."]}],
        "leftVisuals": [{"description": "드리블하는 어린이"}],
    }


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class AiRequestTests(unittest.TestCase):
    def test_prompt_carries_manuscript_pages_and_instruction(self):
        prompt = mt.mockup_prompt(spread_payload(), "캐릭터를 더 크게")
        for text in ("왼쪽 64쪽", "오른쪽 65쪽", "농구 기본 기능 3가지", "■ 활동 1 드리블", "공을 바닥에 튀기며 이동해요.", "(삽화: 드리블하는 어린이)", "추가 요청: 캐릭터를 더 크게"):
            self.assertIn(text, prompt)

    def test_mockup_with_references_uses_edits_multipart(self):
        with tempfile.TemporaryDirectory() as folder:
            reference = Path(folder) / "ref.png"
            Image.new("RGB", (4, 4)).save(reference)
            captured = {}

            def fake_urlopen(request, timeout):
                captured["url"] = request.full_url
                captured["body"] = request.data
                captured["type"] = request.headers["Content-type"]
                return FakeResponse({"data": [{"b64_json": "QUJD"}]})

            with mock.patch.object(mt, "urlopen", fake_urlopen):
                result = mt.request_mockup_image("test-key", spread_payload(), [reference])
        self.assertEqual(result, "QUJD")
        self.assertEqual(captured["url"], "https://api.openai.com/v1/images/edits")
        self.assertTrue(captured["type"].startswith("multipart/form-data; boundary="))
        self.assertIn(b'name="image[]"; filename="reference1.png"', captured["body"])
        self.assertIn(b'name="size"\r\n\r\n1536x1024', captured["body"])
        self.assertIn("농구 기본 기능 3가지".encode("utf-8"), captured["body"])

    def test_layout_request_sends_two_images_and_sanitizes(self):
        buffer = io.BytesIO()
        Image.new("RGB", (768, 512), (255, 255, 255)).save(buffer, format="PNG")
        image_base64 = base64.b64encode(buffer.getvalue()).decode("ascii")
        captured = {}
        answer = {"background": "#F6F1FB", "items": [{"kind": "text", "box": [10, 10, 200, 40], "text": "제목", "size": 20, "fill": None}]}

        def fake_urlopen(request, timeout):
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse({"output": [{"content": [{"type": "output_text", "text": json.dumps(answer, ensure_ascii=False)}]}]})

        with mock.patch.object(mt, "urlopen", fake_urlopen):
            layout = mt.request_layout("test-key", "gpt-test", image_base64, spread_payload())
        content = captured["body"]["input"][0]["content"]
        self.assertEqual([part["type"] for part in content], ["input_text", "input_image", "input_image"])
        self.assertTrue(captured["body"]["text"]["format"]["strict"])
        self.assertEqual(layout["items"], [{"kind": "text", "box": [10.0, 10.0, 200.0, 40.0], "text": "제목", "size": 20.0}])

    def test_structure_examples_come_from_different_publishers_then_book_standards(self):
        # 지면 종류별 예시는 출판사가 겹치지 않게 2장, 그다음 이 책의 디자인 기준 시안, 참고 시안은 기준이 없을 때만.
        with tempfile.TemporaryDirectory() as folder:
            closing = Path(folder) / "구성" / "마무리"
            closing.mkdir(parents=True)
            for name in ("가사_3학년.jpg", "가사_5학년.jpg", "나사_3학년.jpg"):
                Image.new("RGB", (4, 4)).save(closing / name)
            Image.new("RGB", (4, 4)).save(Path(folder) / "style.png")
            standard = Path(folder) / "standard.png"
            Image.new("RGB", (4, 4)).save(standard)
            with mock.patch.dict(os.environ, {"MOCKUP_STYLE_DIR": folder}):
                for _ in range(5):
                    picks = mt.structure_references(Path("."), "unit-closing")
                    self.assertEqual(len(picks), 2)
                    self.assertEqual({path.stem.split("_")[0] for path in picks}, {"가사", "나사"})
                self.assertEqual(mt.structure_references(Path("."), "unit-intro"), [])
                references = mt.reference_images(Path("."))
            bodies = []

            def fake_urlopen(request, timeout):
                bodies.append(request.data)
                return FakeResponse({"data": [{"b64_json": "QUJD"}]})

            payload = {**spread_payload(), "pageRole": "unit-closing"}
            with mock.patch.object(mt, "urlopen", fake_urlopen):
                mt.request_mockup_image("test-key", payload, references, structure=picks)
                mt.request_mockup_image("test-key", payload, references, structure=picks, standards=[standard])
        without_standard, with_standard = bodies
        self.assertIn(b'filename="reference3.png"', without_standard)
        self.assertIn("서로 다른 출판사".encode("utf-8"), without_standard)
        self.assertIn("단원 마무리 지면".encode("utf-8"), without_standard)
        self.assertIn(b'filename="reference3.png"', with_standard)
        self.assertNotIn(b'filename="reference4', with_standard)
        self.assertIn("디자인 기준".encode("utf-8"), with_standard)

    def test_references_come_from_configured_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            for name in ("b.png", "a.jpg", "note.json", "c.webp"):
                (Path(folder) / name).write_bytes(b"x")
            with mock.patch.dict(os.environ, {"MOCKUP_STYLE_DIR": folder}):
                names = [path.name for path in mt.reference_images(Path("."))]
        self.assertEqual(names, ["a.jpg", "b.png", "c.webp"])


@unittest.skipUnless(dc.find_designcraft(), "DesignCraft가 설치된 컴퓨터에서만 실행")
class RealBuildTests(unittest.TestCase):
    def test_sample_mockup_builds_two_separate_pages(self):
        spec = json.loads(SAMPLE_LAYOUT.read_text(encoding="utf-8"))
        spec["image"] = str(SAMPLE_LAYOUT.parent / spec["image"])
        with tempfile.TemporaryDirectory() as folder:
            with mock.patch.dict(os.environ, {"DESIGNCRAFT_OUTPUT_DIR": folder}):
                result = mt.build_mockup_book([spec], Path("."), title="샘플", start_page=64)
            self.assertEqual(result["errors"], [])
            # 샘플1은 두 쪽에 걸친 디자인이라 쪽에 맞추며 좁아진 글상자 한두 곳이 넘칠 수 있다.
            self.assertLessEqual(len(result["overset"]), 2)
            self.assertGreater(result["adjusted"], 0)
            self.assertEqual(result["pages"], 2)
            self.assertGreater(result["images"], 30)
            for path in result["files"].values():
                self.assertTrue(Path(path).is_file(), path)


if __name__ == "__main__":
    unittest.main()
