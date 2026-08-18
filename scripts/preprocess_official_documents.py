"""Preprocess PDF, HWP, and HWPX official documents into portable text artifacts.

PDF pages retain exact page numbers. HWP/HWPX files retain section and paragraph
order; their binary/layout formats do not expose reliable automatic page numbers,
so the generated reports state that original-page comparison is still required.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import struct
import sys
import zlib
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile


def optional_imports():
    try:
        import pymupdf  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "PyMuPDF가 필요합니다. python -m pip install pymupdf 명령으로 설치하세요."
        ) from exc
    return pymupdf


FITZ = optional_imports()
EXTENDED_HWP_CONTROLS = (
    set(range(1, 10)) | set(range(11, 13)) | set(range(14, 24))
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def document_id(path: Path) -> str:
    stem = re.sub(r"^[0-9]+_", "", path.stem.strip())
    stem = re.sub(r"[\[\](){}]", "", stem)
    stem = re.sub(r"[^0-9A-Za-z가-힣Ⅰ-Ⅻ]+", "_", stem).strip("_")
    return stem[:140]


def classify(path: Path) -> str:
    name = path.stem
    if "질의" in name or "답변" in name:
        return "recognition_qa"
    if "접수" in name or "수수료" in name:
        return "recognition_procedure"
    if "인정기준" in name or "편찬상의 유의점" in name:
        return "recognition_criteria"
    if "편수자료" in name:
        return "editorial_reference"
    if "교육과정" in name:
        return "curriculum"
    return "official_reference"


def curriculum_revision(path: Path) -> str:
    location = " ".join([path.name, *[parent.name for parent in path.parents[:3]]])
    if "09개정" in location or "2009" in location:
        return "2009 개정"
    if "22개정" in location or "2022" in location:
        return "2022 개정"
    return "미분류"


def portable_source_file(path: Path) -> str:
    resolved = path.resolve()
    for parent in resolved.parents:
        if parent.name == "official-data":
            return resolved.relative_to(parent).as_posix()
    return f"criteria/{path.name}"


def clean_text(text: str) -> str:
    text = text.replace("\u0000", " ").replace("\ufeff", "")
    text = re.sub(r"[\ud800-\udfff]", "", text)
    text = re.sub(r"[ \t\u00a0]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def hwp_record_payloads(data: bytes):
    position = 0
    while position + 4 <= len(data):
        header = struct.unpack_from("<I", data, position)[0]
        position += 4
        tag_id = header & 0x3FF
        size = (header >> 20) & 0xFFF
        if size == 0xFFF:
            if position + 4 > len(data):
                break
            size = struct.unpack_from("<I", data, position)[0]
            position += 4
        if position + size > len(data):
            break
        yield tag_id, data[position : position + size]
        position += size


def decode_hwp_paragraph(payload: bytes) -> str:
    usable = payload[: len(payload) // 2 * 2]
    values = struct.unpack("<" + "H" * (len(usable) // 2), usable)
    output: list[str] = []
    index = 0
    while index < len(values):
        value = values[index]
        if value in EXTENDED_HWP_CONTROLS:
            index += 8
            continue
        if value < 32:
            output.append(" ")
        else:
            output.append(chr(value))
        index += 1
    return clean_text("".join(output))


def extract_hwp(path: Path) -> list[dict]:
    try:
        import olefile  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            "HWP 전처리에는 olefile이 필요합니다. python -m pip install olefile 명령으로 설치하세요."
        ) from exc
    ole = olefile.OleFileIO(str(path))
    try:
        header = ole.openstream("FileHeader").read()
        compressed = bool(struct.unpack_from("<I", header, 36)[0] & 1)
        streams = sorted(
            item
            for item in ole.listdir()
            if len(item) == 2
            and item[0] == "BodyText"
            and item[1].startswith("Section")
        )
        sections = []
        for section_number, stream_name in enumerate(streams, start=1):
            data = ole.openstream(stream_name).read()
            if compressed:
                data = zlib.decompress(data, -15)
            paragraphs = [
                decode_hwp_paragraph(payload)
                for tag_id, payload in hwp_record_payloads(data)
                if tag_id == 67
            ]
            paragraphs = [paragraph for paragraph in paragraphs if paragraph]
            sections.append(
                {
                    "index": section_number,
                    "label": f"HWP 본문 구역 {section_number}",
                    "paragraphs": paragraphs,
                    "page": None,
                    "method": "hwp_binary_text",
                }
            )
        return sections
    finally:
        ole.close()


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def extract_hwpx(path: Path) -> list[dict]:
    sections = []
    with ZipFile(path) as archive:
        names = sorted(
            name
            for name in archive.namelist()
            if name.startswith("Contents/section") and name.endswith(".xml")
        )
        for section_number, name in enumerate(names, start=1):
            root = ElementTree.fromstring(archive.read(name))
            paragraphs = []
            for paragraph in root.iter():
                if local_name(paragraph.tag) != "p":
                    continue
                fragments = [
                    node.text or ""
                    for node in paragraph.iter()
                    if local_name(node.tag) == "t"
                ]
                text = clean_text("".join(fragments))
                if text:
                    paragraphs.append(text)
            sections.append(
                {
                    "index": section_number,
                    "label": f"HWPX 본문 구역 {section_number}",
                    "paragraphs": paragraphs,
                    "page": None,
                    "method": "hwpx_xml_text",
                }
            )
    return sections


def extract_pdf(path: Path) -> list[dict]:
    document = FITZ.open(path)
    try:
        return [
            {
                "index": page.number + 1,
                "label": f"PDF 원본 페이지 {page.number + 1}",
                "paragraphs": [
                    part.strip()
                    for part in re.split(r"\n\s*\n", clean_text(page.get_text("text")))
                    if part.strip()
                ],
                "page": page.number + 1,
                "method": "native_text",
            }
            for page in document
        ]
    finally:
        document.close()


def extract(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix == ".hwp":
        return extract_hwp(path)
    if suffix == ".hwpx":
        return extract_hwpx(path)
    raise SystemExit(f"지원하지 않는 파일 형식입니다: {path}")


def chunk_paragraphs(paragraphs: list[str], limit: int = 1800) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    length = 0
    for paragraph in paragraphs:
        if current and length + len(paragraph) + 2 > limit:
            chunks.append("\n\n".join(current))
            current, length = [], 0
        current.append(paragraph)
        length += len(paragraph) + 2
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def write_outputs(path: Path, output_root: Path) -> Path:
    doc_id = document_id(path)
    destination = output_root / doc_id
    destination.mkdir(parents=True, exist_ok=True)
    sections = extract(path)
    title = re.sub(r"^[0-9]+_", "", path.stem).strip()
    source_file = portable_source_file(path)
    revision = curriculum_revision(path)
    exact_pages = path.suffix.lower() == ".pdf"
    now = datetime.now(timezone.utc).isoformat()

    markdown = [
        f"# {title}",
        "",
        f"> 원본: `{source_file}`",
        f"> 추출 방식: {'PDF 페이지별 텍스트' if exact_pages else '문서 구조별 텍스트(원본 페이지 대조 필요)' }",
        "",
    ]
    chunks = []
    review_rows = []
    chunk_number = 0
    paragraph_count = 0
    for section in sections:
        paragraph_count += len(section["paragraphs"])
        if exact_pages:
            markdown.extend(
                [
                    f"<!-- source_page: {section['page']} -->",
                    f"## {section['label']}",
                    "",
                ]
            )
        else:
            markdown.extend(
                [
                    f"<!-- source_section: {section['index']} -->",
                    f"## {section['label']}",
                    "",
                ]
            )
        markdown.extend(section["paragraphs"] or ["_추출된 텍스트 없음_"])
        markdown.append("")
        if not section["paragraphs"]:
            review_rows.append(
                {
                    "source_location": section["page"] or section["index"],
                    "code": "NO_TEXT",
                    "severity": "warning",
                    "message": "추출된 본문이 없습니다.",
                    "extraction_method": section["method"],
                }
            )
        for content in chunk_paragraphs(section["paragraphs"]):
            chunk_number += 1
            chunks.append(
                {
                    "chunk_id": f"{doc_id}-{chunk_number:04d}",
                    "document_id": doc_id,
                    "document_title": title,
                    "document_type": classify(path),
                    "curriculum_revision": revision,
                    "source_file": source_file,
                    "source_page_start": section["page"],
                    "source_page_end": section["page"],
                    "source_section": None if exact_pages else section["index"],
                    "printed_page": None,
                    "subject": "체육" if "체육" in title else "공통",
                    "school_level": ["고등학교"] if "고등학교" in title else ["미분류"],
                    "heading_path": [],
                    "content_kind": "text",
                    "content": content,
                    "extraction_method": section["method"],
                    "review_required": not exact_pages,
                    "review_flags": [] if exact_pages else ["PAGE_INDEX_UNAVAILABLE"],
                }
            )

    (destination / "document.md").write_text("\n".join(markdown), encoding="utf-8")
    with (destination / "chunks.jsonl").open("w", encoding="utf-8", newline="\n") as stream:
        for item in chunks:
            stream.write(json.dumps(item, ensure_ascii=False) + "\n")
    with (destination / "review.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=[
                "source_location",
                "code",
                "severity",
                "message",
                "extraction_method",
            ],
        )
        writer.writeheader()
        writer.writerows(review_rows)

    manifest = {
        "schema_version": 1,
        "document_id": doc_id,
        "document_type": classify(path),
        "curriculum_revision": revision,
        "source_file": source_file,
        "source_sha256": sha256(path),
        "source_size_bytes": path.stat().st_size,
        "processed_at": now,
        "page_count": len(sections) if exact_pages else 0,
        "section_count": 0 if exact_pages else len(sections),
        "paragraph_count": paragraph_count,
        "chunk_count": len(chunks),
        "table_count": 0,
        "warning_page_count": len(review_rows),
        "page_index_status": "exact" if exact_pages else "unavailable",
        "outputs": ["document.md", "chunks.jsonl", "review.csv", "report.md"],
    }
    (destination / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    report = [
        f"# 전처리 보고서: {title}",
        "",
        f"- 원본 형식: {path.suffix.lower()}",
        f"- {'전체 PDF 페이지' if exact_pages else '본문 구역'}: {len(sections)}",
        f"- 추출 문단: {paragraph_count}",
        f"- 생성 청크: {len(chunks)}",
        f"- 검토 항목: {len(review_rows)}",
        "",
    ]
    if not exact_pages:
        report.extend(
            [
                "## 원본 대조 주의",
                "",
                "HWP/HWPX 원문 순서는 보존했지만 자동 페이지 번호는 제공하지 않습니다.",
                "인용과 최종 심사 근거에는 한글 원본의 실제 쪽수를 별도로 확인해야 합니다.",
                "",
            ]
        )
    (destination / "report.md").write_text("\n".join(report), encoding="utf-8")
    return destination


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument(
        "--output-root", type=Path, default=Path("official-data/processed")
    )
    args = parser.parse_args()
    for source in args.sources:
        if not source.is_file():
            raise SystemExit(f"파일을 찾을 수 없습니다: {source}")
        destination = write_outputs(source.resolve(), args.output_root.resolve())
        print(f"{source.name} -> {destination}")


if __name__ == "__main__":
    main()
