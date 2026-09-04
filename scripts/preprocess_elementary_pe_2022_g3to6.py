"""Preprocess 22개정 초등 3~6학년 체육 교과서/지도서 PDFs (금성/동아/미래엔) into page/spread search assets.

This mirrors preprocess_textbook_guides.py but generalizes the grade/curriculum_band
fields (that script hardcodes grade 5 / 5~6학년군) and reads sources from the nested
"official-data/textbook/22개정 초등교과서, 지도서/<publisher>/<grade>학년/" folders
instead of the flat textbook/teacher_guide roots.

Already-processed duplicates (identical source_sha256 already present under
official-data/processed/*) are skipped automatically.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pymupdf

PREVIEW_HEIGHT = 1100
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 250
MIN_FREE_BYTES = 700 * 1024 * 1024  # stop if free space would drop below this


def compact_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


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


def render_page(page: pymupdf.Page, output: Path) -> None:
    zoom = PREVIEW_HEIGHT / page.rect.height
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
    pixmap.save(output, jpg_quality=72)


def make_spread(source: pymupdf.Document, left_no: int, right_no: int, output: Path) -> None:
    left = source[left_no - 1]
    right = source[right_no - 1]
    height = max(left.rect.height, right.rect.height)
    left_width = left.rect.width * height / left.rect.height
    right_width = right.rect.width * height / right.rect.height
    canvas = pymupdf.open()
    page = canvas.new_page(width=left_width + right_width, height=height)
    page.show_pdf_page(pymupdf.Rect(0, 0, left_width, height), source, left_no - 1)
    page.show_pdf_page(pymupdf.Rect(left_width, 0, left_width + right_width, height), source, right_no - 1)
    zoom = PREVIEW_HEIGHT / height
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
    pixmap.save(output, jpg_quality=72)
    canvas.close()


def make_contact_sheet(spread_paths: list[Path], output: Path) -> None:
    thumb_width = 300
    margin = 12
    columns = 4
    if not spread_paths:
        return
    tile_height = 220
    rows = (len(spread_paths) + columns - 1) // columns
    sheet_width = columns * thumb_width + (columns + 1) * margin
    sheet_height = rows * tile_height + (rows + 1) * margin
    sheet = pymupdf.open()
    page = sheet.new_page(width=sheet_width, height=sheet_height)
    for index, path in enumerate(spread_paths):
        x = margin + (index % columns) * (thumb_width + margin)
        y = margin + (index // columns) * (tile_height + margin)
        page.insert_text((x + 4, y + 10), path.stem, fontsize=7)
        page.insert_image(pymupdf.Rect(x, y + 14, x + thumb_width, y + tile_height), filename=path)
    page.get_pixmap(alpha=False, colorspace=pymupdf.csRGB).save(output, jpg_quality=70)
    sheet.close()


def preprocess(
    source: Path,
    output: Path,
    document_id: str,
    publisher: str,
    document_type: str,
    grade: str,
    curriculum_band: str,
    source_file: str,
) -> None:
    if output.exists():
        raise FileExistsError(f"output already exists: {output}")
    pages_dir = output / "images" / "pages"
    spreads_dir = output / "images" / "spreads"
    pages_dir.mkdir(parents=True)
    spreads_dir.mkdir(parents=True)

    title = source.stem
    pages: list[dict] = []
    warnings: list[dict] = []
    document = pymupdf.open(source)
    print(f"[{document_id}] {len(document)} pages", flush=True)
    for index, page in enumerate(document, start=1):
        raw = page.get_text("dict", sort=True)
        blocks = []
        texts = []
        for block_no, block in enumerate(raw.get("blocks", [])):
            if block.get("type") != 0:
                continue
            lines = []
            for line in block.get("lines", []):
                line_text = "".join(span.get("text", "") for span in line.get("spans", []))
                if line_text.strip():
                    lines.append(line_text.strip())
            block_text = "\n".join(lines).strip()
            if not block_text:
                continue
            texts.append(block_text)
            blocks.append({"block_no": block_no, "block_type": 0, "bbox": [round(value, 2) for value in block.get("bbox", ())], "text": block_text})
        text = compact_text("\n\n".join(texts))
        image_path = pages_dir / f"p{index:04d}.jpg"
        render_page(page, image_path)
        pages.append({
            "page_id": f"p{index:04d}", "physical_page": index, "source_pdf_page": index,
            "source_side": "full", "width_pt": round(page.rect.width, 2), "height_pt": round(page.rect.height, 2),
            "image": f"images/pages/{image_path.name}", "text": text, "char_count": len(text), "blocks": blocks,
        })
        if len(text) < 20:
            warnings.append({"physical_page": index, "source_pdf_page": index, "char_count": len(text), "reason": "텍스트가 없거나 매우 적음"})
        if index % 25 == 0 or index == len(document):
            print(f"[{document_id}] pages {index}/{len(document)}", flush=True)
    spreads: list[dict] = []
    spread_paths: list[Path] = []
    for left_no in range(2, len(pages), 2):
        right_no = left_no + 1
        if right_no > len(pages):
            break
        spread_id = f"s{left_no:04d}_{right_no:04d}"
        spread_path = spreads_dir / f"{spread_id}.jpg"
        make_spread(document, left_no, right_no, spread_path)
        spread_paths.append(spread_path)
        spreads.append({
            "spread_id": spread_id, "page_ids": [f"p{left_no:04d}", f"p{right_no:04d}"],
            "classification": "uncertain", "confidence": 0.5, "origin": "paired_facing_pages",
            "signals": ["sequential_pair"], "metrics": {}, "image": f"images/spreads/{spread_path.name}",
            "text": f"{pages[left_no - 1]['text']}\n\n--- PAGE BOUNDARY ---\n\n{pages[right_no - 1]['text']}",
        })
    make_contact_sheet(spread_paths, output / "spread_contact_sheet.jpg")
    document.close()

    common = {"document_id": document_id, "publisher": publisher, "document_type": document_type}
    page_chunks = []
    for page in pages:
        for chunk_no, chunk in enumerate(split_text(page["text"]), start=1):
            page_chunks.append({
                "chunk_id": f"{document_id}_{page['page_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "page", "page_id": page["page_id"], "physical_page": page["physical_page"],
                "source_pdf_page": page["source_pdf_page"], "text": chunk,
                "curriculum_revision": "2022 개정", "source_file": source_file,
            })
    spread_chunks = []
    for spread in spreads:
        for chunk_no, chunk in enumerate(split_text(spread["text"]), start=1):
            spread_chunks.append({
                "chunk_id": f"{document_id}_{spread['spread_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "spread", "spread_id": spread["spread_id"], "page_ids": spread["page_ids"],
                "classification": spread["classification"], "confidence": spread["confidence"], "text": chunk,
                "curriculum_revision": "2022 개정", "source_file": source_file,
            })

    write_jsonl(output / "pages.jsonl", pages)
    write_jsonl(output / "spreads.jsonl", spreads)
    write_jsonl(output / "chunks.jsonl", page_chunks)
    write_jsonl(output / "spread_chunks.jsonl", spread_chunks)
    with (output / "review.csv").open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["physical_page", "source_pdf_page", "char_count", "reason"])
        writer.writeheader()
        writer.writerows(warnings)

    with (output / "document.md").open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"# {title}\n\n> 원본: `{source_file}`\n\n")
        for page in pages:
            target.write(f"## PDF {page['source_pdf_page']}쪽\n\n{page['text']}\n\n")

    counts = Counter(spread["classification"] for spread in spreads)
    manifest = {
        "schema_version": "1.0", "processor_version": "1.0.0", "document_id": document_id,
        "title": title, "publisher": publisher, "document_type": document_type, "source": source_file,
        "source_sha256": sha256(source), "processed_at": datetime.now(timezone.utc).isoformat(),
        "source_pdf_pages": len(pages), "physical_pages": len(pages), "native_spread_document": False,
        "spread_pairs": len(spreads), "spread_classification_counts": dict(counts),
        "page_chunks": len(page_chunks), "spread_chunks": len(spread_chunks), "preview_height_px": PREVIEW_HEIGHT,
        "notes": ["원본 PDF는 변경하지 않았습니다.", "chunks.jsonl은 중복을 줄인 기본 페이지 검색용입니다.",
                  "spread_chunks.jsonl은 펼침면 문맥이 필요한 보조 검색용입니다.",
                  "모든 순차 마주보기 쌍을 이미지와 spreads.jsonl에 보존하고 자동 판정은 uncertain으로 두었습니다."],
        "curriculum_revision": "2022 개정", "education_level": "초등학교", "grade": grade,
        "curriculum_band": curriculum_band, "review_framework": "검정",
        "source_file": source_file, "source_size_bytes": source.stat().st_size, "page_count": len(pages),
        "chunk_count": len(page_chunks), "table_count": 0, "warning_page_count": len(warnings),
        "page_index_status": "exact", "outputs": ["document.md", "pages.jsonl", "spreads.jsonl", "chunks.jsonl", "spread_chunks.jsonl", "review.csv", "report.md"],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = f"""# 전처리 보고서: {title}

- curriculum_revision: 2022 개정
- education_level: 초등학교
- grade: {grade} (교육과정 적용 범위: {curriculum_band})
- review_framework: 검정
- source_file: `{source_file}`
- 출판사: {publisher}
- 자료 유형: {document_type}
- 원본 PDF 페이지: {len(pages)}
- 복원한 단일 페이지: {len(pages)}
- 원본 펼침면 PDF: 아니요
- 펼침면/페이지 쌍: {len(spreads)}
- 자동 판정: {dict(counts)}
- 기본 페이지 청크: {len(page_chunks)}
- 펼침면 청크: {len(spread_chunks)}
- 텍스트 검토 대상: {len(warnings)}쪽

## 사용 안내

일반 검색에는 `chunks.jsonl`을 사용하고, 두 페이지에 걸친 활동과 편집 체제를 분석할 때는 `spread_chunks.jsonl`과 펼침면 이미지를 함께 사용합니다. 펼침면은 오판을 피하기 위해 모두 `uncertain`으로 보존했습니다.
"""
    (output / "report.md").write_text(report, encoding="utf-8")
    print(f"[{document_id}] complete: {len(page_chunks)} page chunks, {len(spread_chunks)} spread chunks, {len(warnings)} warnings", flush=True)


# (relative_path_under_official_data, document_id, publisher, document_type, grade, curriculum_band)
BASE = "textbook/22개정 초등교과서, 지도서"
SPECS = [
    # 금성출판사
    (f"{BASE}/금성/3학년/3체육_교과서 금성.pdf", "22개정_geumseong_elementary_pe3_textbook", "금성출판사", "교과서", "3학년", "3~4학년군"),
    (f"{BASE}/금성/3학년/3체육_지도서 금성.pdf", "22개정_geumseong_elementary_pe3_teacher_guide", "금성출판사", "지도서", "3학년", "3~4학년군"),
    (f"{BASE}/금성/4학년/4체육_교과서 금성.pdf", "22개정_geumseong_elementary_pe4_textbook", "금성출판사", "교과서", "4학년", "3~4학년군"),
    (f"{BASE}/금성/4학년/4체육_지도서 금성.pdf", "22개정_geumseong_elementary_pe4_teacher_guide", "금성출판사", "지도서", "4학년", "3~4학년군"),
    (f"{BASE}/금성/5학년/[금성] 초등 체육 5-1.pdf", "22개정_geumseong_elementary_pe5_1_textbook", "금성출판사", "교과서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/5학년/[금성] 초등 체육 5-2.pdf", "22개정_geumseong_elementary_pe5_2_textbook", "금성출판사", "교과서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/5학년/[금성]초등 체육 5-3.pdf", "22개정_geumseong_elementary_pe5_3_textbook", "금성출판사", "교과서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/5학년/[금성]체육 지도서 5-1.pdf", "22개정_geumseong_elementary_pe5_1_teacher_guide", "금성출판사", "지도서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/5학년/[금성]체육 지도서 5-2.pdf", "22개정_geumseong_elementary_pe5_2_teacher_guide", "금성출판사", "지도서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/5학년/[금성]체육 지도서 5-3.pdf", "22개정_geumseong_elementary_pe5_3_teacher_guide", "금성출판사", "지도서", "5학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성] 초등 체육 6-1.pdf", "22개정_geumseong_elementary_pe6_1_textbook", "금성출판사", "교과서", "6학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성] 초등 체육 6-2.pdf", "22개정_geumseong_elementary_pe6_2_textbook", "금성출판사", "교과서", "6학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성]초등 체육 6-3.pdf", "22개정_geumseong_elementary_pe6_3_textbook", "금성출판사", "교과서", "6학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성] 체육 지도서 6-1.pdf", "22개정_geumseong_elementary_pe6_1_teacher_guide", "금성출판사", "지도서", "6학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성] 체육 지도서 6-2.pdf", "22개정_geumseong_elementary_pe6_2_teacher_guide", "금성출판사", "지도서", "6학년", "5~6학년군"),
    (f"{BASE}/금성/6학년/[금성] 체육 지도서 6-3.pdf", "22개정_geumseong_elementary_pe6_3_teacher_guide", "금성출판사", "지도서", "6학년", "5~6학년군"),
    # 동아출판 (5학년은 이미 처리된 파일과 동일한 원본이라 제외)
    (f"{BASE}/동아/3학년/[동아출판] 22개정_초등_체육3_교과서.pdf", "22개정_donga_elementary_pe3_textbook", "동아출판", "교과서", "3학년", "3~4학년군"),
    (f"{BASE}/동아/3학년/[동아출판] 22개정_초등_체육3_지도서.pdf", "22개정_donga_elementary_pe3_teacher_guide", "동아출판", "지도서", "3학년", "3~4학년군"),
    (f"{BASE}/동아/4학년/[동아출판] 22개정_초등_체육4_교과서.pdf", "22개정_donga_elementary_pe4_textbook", "동아출판", "교과서", "4학년", "3~4학년군"),
    (f"{BASE}/동아/4학년/[동아출판] 22개정_초등_체육4_지도서.pdf", "22개정_donga_elementary_pe4_teacher_guide", "동아출판", "지도서", "4학년", "3~4학년군"),
    (f"{BASE}/동아/6학년/(동아출판) 초등_체육6_교과서.pdf", "22개정_donga_elementary_pe6_textbook", "동아출판", "교과서", "6학년", "5~6학년군"),
    (f"{BASE}/동아/6학년/(동아출판) 22개정_초등_체육6_지도서.pdf", "22개정_donga_elementary_pe6_teacher_guide", "동아출판", "지도서", "6학년", "5~6학년군"),
    # 미래엔
    (f"{BASE}/미래엔/3학년/미래엔_체육_3학년_교과서.pdf", "22개정_miraen_elementary_pe3_textbook", "미래엔", "교과서", "3학년", "3~4학년군"),
    (f"{BASE}/미래엔/3학년/미래엔_체육3_지도서.pdf", "22개정_miraen_elementary_pe3_teacher_guide", "미래엔", "지도서", "3학년", "3~4학년군"),
    (f"{BASE}/미래엔/4학년/미래엔_체육_4학년_교과서.pdf", "22개정_miraen_elementary_pe4_textbook", "미래엔", "교과서", "4학년", "3~4학년군"),
    (f"{BASE}/미래엔/4학년/미래엔_체육_4지도서.pdf", "22개정_miraen_elementary_pe4_teacher_guide", "미래엔", "지도서", "4학년", "3~4학년군"),
]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--only", type=str, default=None, help="처리할 document_id를 쉼표로 지정 (없으면 전체)")
    args = parser.parse_args()
    root = args.root.resolve()
    only = set(args.only.split(",")) if args.only else None

    # Disk space is tight; process smallest sources first so more documents
    # finish successfully before any safety stop.
    ordered = sorted(SPECS, key=lambda spec: (root / "official-data" / spec[0]).stat().st_size)

    for rel_path, document_id, publisher, document_type, grade, curriculum_band in ordered:
        if only is not None and document_id not in only:
            continue
        source = root / "official-data" / rel_path
        output = root / "official-data" / "processed" / document_id
        if not source.exists():
            print(f"[{document_id}] 건너뜀: 원본 없음 ({source})", flush=True)
            continue
        if output.exists():
            print(f"[{document_id}] 건너뜀: 이미 처리됨", flush=True)
            continue
        free_bytes = shutil.disk_usage(root).free
        if free_bytes < MIN_FREE_BYTES:
            print(f"[{document_id}] 중단: 디스크 여유 공간 부족 ({free_bytes / 1024 / 1024:.0f} MB) - 처리를 멈춥니다.", flush=True)
            break
        preprocess(source, output, document_id, publisher, document_type, grade, curriculum_band, rel_path)


if __name__ == "__main__":
    main()
