"""Re-extract text for a document whose native PDF text layer is degenerate
(see detect_degenerate_text.py) by OCR-ing each page at high resolution.

The original preview page images (images/pages/p*.jpg, rendered at ~96dpi for
web display) are kept as-is. For OCR we re-render each page directly from the
source PDF at 300dpi into a temp file, run Tesseract (kor+eng), then discard
the temp render. Progress is checkpointed to <output>/ocr_progress.json so an
interrupted run resumes instead of re-OCRing already-done pages.

Requires: pytesseract, a Tesseract binary, and kor.traineddata (this project's
copy lives outside Program Files since installing there needs admin rights -
set TESSDATA_PREFIX below to wherever kor.traineddata was placed).

Usage: python scripts/ocr_fallback_reprocess.py <document_id>
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path

import pymupdf
import pytesseract
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "official-data" / "processed"

TESSERACT_EXE = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
TESSDATA_PREFIX = r"C:\Users\YBM\AppData\Local\Temp\claude\c--Users-YBM-Desktop-textbook-studio\eff0a547-7b2b-438d-b7b0-4c26eb646e54\scratchpad\tessdata"
OCR_DPI = 300
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 250

pytesseract.pytesseract.tesseract_cmd = TESSERACT_EXE
os.environ["TESSDATA_PREFIX"] = TESSDATA_PREFIX


def compact_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + CHUNK_SIZE)
        if end < len(text):
            boundary = max(text.rfind("\n", start + CHUNK_SIZE // 2, end), text.rfind(" ", start + CHUNK_SIZE // 2, end))
            if boundary > start:
                end = boundary
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return [chunk for chunk in chunks if chunk]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def ocr_page(document: pymupdf.Document, page_index: int, tmp_path: Path) -> str:
    page = document[page_index]
    zoom = OCR_DPI / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
    pixmap.save(tmp_path)
    img = Image.open(tmp_path)
    text = pytesseract.image_to_string(img, lang="kor+eng", config="--psm 3")
    img.close()
    tmp_path.unlink(missing_ok=True)
    return compact_text(text)


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        return
    document_id = sys.argv[1]
    output = PROCESSED / document_id
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    source = ROOT / "official-data" / manifest["source_file"]
    if not source.exists():
        raise FileNotFoundError(source)

    pages_path = output / "pages.jsonl"
    original_pages = [json.loads(line) for line in pages_path.open(encoding="utf-8")]

    progress_path = output / "ocr_progress.json"
    progress: dict[str, str] = {}
    if progress_path.exists():
        progress = json.loads(progress_path.read_text(encoding="utf-8"))
        print(f"[{document_id}] 이어서 진행: {len(progress)}/{len(original_pages)}쪽 완료됨", flush=True)

    tmp_render = output / "_ocr_tmp_render.png"
    document = pymupdf.open(source)
    for page in original_pages:
        page_id = page["page_id"]
        if page_id in progress:
            continue
        idx = page["physical_page"] - 1
        text = ocr_page(document, idx, tmp_render)
        progress[page_id] = text
        progress_path.write_text(json.dumps(progress, ensure_ascii=False), encoding="utf-8")
        if page["physical_page"] % 10 == 0 or page["physical_page"] == len(original_pages):
            print(f"[{document_id}] OCR {page['physical_page']}/{len(original_pages)}", flush=True)
    document.close()

    # Rebuild pages with OCR text, keep native (watermark) text for reference.
    new_pages = []
    for page in original_pages:
        native_text = page["text"]
        ocr_text = progress[page["page_id"]]
        merged = dict(page)
        merged["native_text"] = native_text
        merged["text"] = ocr_text
        merged["char_count"] = len(ocr_text)
        merged["text_source"] = "ocr_fallback"
        new_pages.append(merged)

    warnings = []
    for page in new_pages:
        if page["char_count"] < 20:
            warnings.append({"physical_page": page["physical_page"], "source_pdf_page": page["source_pdf_page"], "char_count": page["char_count"], "reason": "OCR 결과도 텍스트가 거의 없음"})

    # Spreads: recombine using OCR'd page text, keep existing image files as-is.
    spreads_path = output / "spreads.jsonl"
    old_spreads = [json.loads(line) for line in spreads_path.open(encoding="utf-8")]
    page_text_by_id = {p["page_id"]: p["text"] for p in new_pages}
    new_spreads = []
    for spread in old_spreads:
        left_id, right_id = spread["page_ids"]
        merged = dict(spread)
        merged["text"] = f"{page_text_by_id[left_id]}\n\n--- PAGE BOUNDARY ---\n\n{page_text_by_id[right_id]}"
        merged["text_source"] = "ocr_fallback"
        new_spreads.append(merged)

    common = {"document_id": document_id, "publisher": manifest["publisher"], "document_type": manifest["document_type"]}
    page_chunks = []
    for page in new_pages:
        for chunk_no, chunk in enumerate(split_text(page["text"]), start=1):
            page_chunks.append({
                "chunk_id": f"{document_id}_{page['page_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "page", "page_id": page["page_id"], "physical_page": page["physical_page"],
                "source_pdf_page": page["source_pdf_page"], "text": chunk,
                "curriculum_revision": "2022 개정", "source_file": manifest["source_file"],
                "text_source": "ocr_fallback",
            })
    spread_chunks = []
    for spread in new_spreads:
        for chunk_no, chunk in enumerate(split_text(spread["text"]), start=1):
            spread_chunks.append({
                "chunk_id": f"{document_id}_{spread['spread_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "spread", "spread_id": spread["spread_id"], "page_ids": spread["page_ids"],
                "classification": spread["classification"], "confidence": spread["confidence"], "text": chunk,
                "curriculum_revision": "2022 개정", "source_file": manifest["source_file"],
                "text_source": "ocr_fallback",
            })

    write_jsonl(pages_path, new_pages)
    write_jsonl(spreads_path, new_spreads)
    write_jsonl(output / "chunks.jsonl", page_chunks)
    write_jsonl(output / "spread_chunks.jsonl", spread_chunks)
    with (output / "review.csv").open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["physical_page", "source_pdf_page", "char_count", "reason"])
        writer.writeheader()
        writer.writerows(warnings)

    title = manifest["title"]
    with (output / "document.md").open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"# {title}\n\n> 원본: `{manifest['source_file']}`\n> 텍스트 출처: OCR 폴백 (원본 텍스트 레이어는 워터마크만 포함)\n\n")
        for page in new_pages:
            target.write(f"## PDF {page['source_pdf_page']}쪽\n\n{page['text']}\n\n")

    manifest["page_chunks"] = len(page_chunks)
    manifest["spread_chunks"] = len(spread_chunks)
    manifest["chunk_count"] = len(page_chunks)
    manifest["warning_page_count"] = len(warnings)
    manifest["text_source"] = "ocr_fallback"
    manifest["notes"].append(
        "원본 PDF의 텍스트 레이어는 전자책 뷰어 워터마크(시각/과목명/URL/쪽수)만 담고 있어 실제 본문이 없었습니다. "
        "Tesseract OCR(kor+eng, 300dpi 재렌더링)로 재추출했습니다. 원본 워터마크 텍스트는 pages.jsonl의 native_text 필드에 보존했습니다."
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    progress_path.unlink(missing_ok=True)
    print(f"[{document_id}] OCR 폴백 완료: {len(page_chunks)} page chunks, {len(spread_chunks)} spread chunks, {len(warnings)} warnings", flush=True)


if __name__ == "__main__":
    main()
