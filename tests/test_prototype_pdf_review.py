import base64
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from urllib.error import HTTPError, URLError


def make_test_pdf_bytes(pages_text):
    import pymupdf

    doc = pymupdf.open()
    for text in pages_text:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


class FakeResponse:
    def __init__(self, payload):
        self._body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self._body


def make_http_error(code, message):
    body = json.dumps({"error": {"message": message}}).encode("utf-8")
    return HTTPError(url="https://example.test", code=code, msg="error", hdrs=None, fp=io.BytesIO(body))


class PrototypePdfReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["TEXTBOOK_STUDIO_DB"] = str(Path(cls.temp_dir.name) / "studio.db")
        import app

        cls.app = app

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        self._saved_key = os.environ.pop("OPENAI_API_KEY", None)

    def tearDown(self):
        if self._saved_key is not None:
            os.environ["OPENAI_API_KEY"] = self._saved_key
        else:
            os.environ.pop("OPENAI_API_KEY", None)

    # PyMuPDF's default base-14 font (used by page.insert_text without a CJK font
    # specified) can't render Korean glyphs, so these synthetic test PDFs use ASCII
    # text purely to verify extract_pdf_text's structural behavior (page markers,
    # concatenation, truncation) — real Korean PDFs already extract correctly via
    # this same PyMuPDF approach in scripts/preprocess_official_documents.py.
    def test_extract_pdf_text_single_page(self):
        pdf_bytes = make_test_pdf_bytes(["Hello test document"])
        text, truncated = self.app.extract_pdf_text(pdf_bytes)
        self.assertIn("Hello test document", text)
        self.assertIn("1쪽", text)
        self.assertFalse(truncated)

    def test_extract_pdf_text_multi_page(self):
        pdf_bytes = make_test_pdf_bytes(["First page content", "Second page content"])
        text, truncated = self.app.extract_pdf_text(pdf_bytes)
        self.assertIn("First page content", text)
        self.assertIn("Second page content", text)
        self.assertIn("2쪽", text)
        self.assertFalse(truncated)

    def test_extract_pdf_text_truncates_when_too_long(self):
        pdf_bytes = make_test_pdf_bytes(["abcdefghijklmnop"])
        text, truncated = self.app.extract_pdf_text(pdf_bytes, max_chars=5)
        self.assertEqual(len(text), 5)
        self.assertTrue(truncated)

    def test_call_openai_for_pdf_review_success(self):
        app = self.app
        os.environ["OPENAI_API_KEY"] = "sk-test"
        generated = {"items": [{"number": 1, "status": "pass", "evidence": "e"}], "review_note": "note"}
        fake_payload = {"output_text": json.dumps(generated, ensure_ascii=False)}

        def fake_urlopen(request, timeout=None):
            self.assertIn("api.openai.com", request.full_url)
            self.assertEqual(request.get_header("Authorization"), "Bearer sk-test")
            return FakeResponse(fake_payload)

        original = app.urlopen
        app.urlopen = fake_urlopen
        try:
            result = app.call_openai_for_pdf_review("테스트 원문")
        finally:
            app.urlopen = original
        self.assertEqual(result, generated)

    def test_call_openai_for_pdf_review_missing_key(self):
        app = self.app
        with self.assertRaises(ValueError) as ctx:
            app.call_openai_for_pdf_review("text")
        self.assertIn("OPENAI_API_KEY", str(ctx.exception))

    def test_call_openai_for_pdf_review_invalid_key(self):
        app = self.app
        os.environ["OPENAI_API_KEY"] = "sk-bad"

        def fake_urlopen(request, timeout=None):
            raise make_http_error(401, "invalid api key")

        original = app.urlopen
        app.urlopen = fake_urlopen
        try:
            with self.assertRaises(ValueError) as ctx:
                app.call_openai_for_pdf_review("text")
        finally:
            app.urlopen = original
        self.assertIn("유효하지 않습니다", str(ctx.exception))

    def test_call_openai_for_pdf_review_quota_exhausted(self):
        app = self.app
        os.environ["OPENAI_API_KEY"] = "sk-test"

        def fake_urlopen(request, timeout=None):
            raise make_http_error(429, "you exceeded your current quota, billing details")

        original = app.urlopen
        app.urlopen = fake_urlopen
        try:
            with self.assertRaises(ValueError) as ctx:
                app.call_openai_for_pdf_review("text")
        finally:
            app.urlopen = original
        self.assertIn("결제", str(ctx.exception))

    def test_call_openai_for_pdf_review_network_failure(self):
        app = self.app
        os.environ["OPENAI_API_KEY"] = "sk-test"

        def fake_urlopen(request, timeout=None):
            raise URLError("no route to host")

        original = app.urlopen
        app.urlopen = fake_urlopen
        try:
            with self.assertRaises(ValueError) as ctx:
                app.call_openai_for_pdf_review("text")
        finally:
            app.urlopen = original
        self.assertIn("연결하지 못했습니다", str(ctx.exception))

    def test_call_prototype_pdf_review_end_to_end(self):
        app = self.app
        pdf_bytes = make_test_pdf_bytes(["교육과정 성격과 목표를 반영한 내용입니다."])
        pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")
        fake_items = [
            {"number": number, "status": "pass" if number % 2 == 0 else "fail", "evidence": "e"}
            for _area, _weight, number, _criterion in app.TEXTBOOK_REVIEW_CRITERIA
        ]
        original = app.call_openai_for_pdf_review
        app.call_openai_for_pdf_review = lambda pdf_text, criteria=None, standard_label="검정기준": {"items": fake_items, "review_note": "메모"}
        try:
            result = app.call_prototype_pdf_review({"pdfBase64": pdf_base64, "fileName": "test.pdf", "catalogId": "elementary-3-4"})
        finally:
            app.call_openai_for_pdf_review = original
        self.assertEqual(result["fileName"], "test.pdf")
        self.assertEqual(len(result["items"]), 22)
        self.assertFalse(result["truncated"])
        self.assertEqual(set(result["areaScores"].keys()), {area for area, *_ in app.TEXTBOOK_REVIEW_CRITERIA})
        self.assertIn(result["decision"], ("통과", "보완 후 통과", "미통과"))
        # 전부 pass였을 때 area_score가 그 영역 가중치와 같아지는지 확인 (교육과정의 준수 = 25점 만점)
        all_pass_items = [{"number": n, "status": "pass", "evidence": "e"} for _a, _w, n, _c in app.TEXTBOOK_REVIEW_CRITERIA]
        app.call_openai_for_pdf_review = lambda pdf_text, criteria=None, standard_label="검정기준": {"items": all_pass_items, "review_note": ""}
        try:
            perfect = app.call_prototype_pdf_review({"pdfBase64": pdf_base64, "fileName": "perfect.pdf", "catalogId": "elementary-3-4"})
        finally:
            app.call_openai_for_pdf_review = original
        self.assertEqual(perfect["overallScore"], 100)
        self.assertEqual(perfect["decision"], "통과")

    def test_sports_culture_uses_twenty_recognition_criteria(self):
        app = self.app
        pdf_bytes = make_test_pdf_bytes(["Sports culture textbook draft"])
        pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")
        all_pass_items = [
            {"number": number, "status": "pass", "evidence": "e"}
            for _area, _weight, number, _criterion in app.SPORTS_CULTURE_RECOGNITION_CRITERIA
        ]
        captured = {}
        original = app.call_openai_for_pdf_review

        def fake_review(pdf_text, criteria=None, standard_label="검정기준"):
            captured["criteria"] = criteria
            captured["label"] = standard_label
            return {"items": all_pass_items, "review_note": ""}

        app.call_openai_for_pdf_review = fake_review
        try:
            result = app.call_prototype_pdf_review({
                "pdfBase64": pdf_base64,
                "fileName": "sports-culture.pdf",
                "catalogId": "high-sports-culture",
            })
        finally:
            app.call_openai_for_pdf_review = original

        self.assertEqual(captured["label"], "인정기준")
        self.assertEqual(len(captured["criteria"]), 20)
        self.assertEqual(result["standard"]["label"], "인정기준")
        self.assertEqual(result["standard"]["count"], 20)
        self.assertEqual(result["overallScore"], 100)
        self.assertEqual(set(result["areaScores"].values()), {20.0, 30.0})

    def test_call_prototype_pdf_review_requires_pdf(self):
        app = self.app
        with self.assertRaises(ValueError):
            app.call_prototype_pdf_review({"fileName": "x.pdf"})

    def test_call_prototype_pdf_review_rejects_non_pdf_bytes(self):
        app = self.app
        garbage_base64 = base64.b64encode(b"this is not a pdf file at all").decode("ascii")
        with self.assertRaises(ValueError) as ctx:
            app.call_prototype_pdf_review({"pdfBase64": garbage_base64, "fileName": "x.pdf"})
        self.assertIn("열지 못했습니다", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
