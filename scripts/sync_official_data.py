"""Copy portable preprocessed official data into the repository.

The original PDFs remain outside Git by default. Absolute source paths embedded
by the preprocessing job are rewritten as portable ``criteria/<filename>``
references while source hashes and all extracted content are preserved.
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


REQUIRED_OUTPUTS = (
    "document.md",
    "chunks.jsonl",
    "manifest.json",
    "review.csv",
    "report.md",
)


def portable_source(value: str) -> str:
    return f"criteria/{Path(value).name}"


def copy_document(source_dir: Path, destination_dir: Path) -> tuple[int, int]:
    manifest_path = source_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    missing = [name for name in REQUIRED_OUTPUTS if not (source_dir / name).is_file()]
    if missing:
        raise FileNotFoundError(
            f"{source_dir.name}: 필수 산출물이 없습니다: {', '.join(missing)}"
        )

    destination_dir.mkdir(parents=True, exist_ok=True)
    for name in ("review.csv", "report.md"):
        shutil.copy2(source_dir / name, destination_dir / name)

    original_source = str(manifest.get("source_file", ""))
    manifest["source_file"] = portable_source(original_source)
    document = (source_dir / "document.md").read_text(encoding="utf-8")
    document = document.replace(original_source, manifest["source_file"])
    (destination_dir / "document.md").write_text(document, encoding="utf-8")
    (destination_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    chunk_count = 0
    with (source_dir / "chunks.jsonl").open("r", encoding="utf-8") as source:
        with (destination_dir / "chunks.jsonl").open("w", encoding="utf-8") as target:
            for line in source:
                if not line.strip():
                    continue
                chunk = json.loads(line)
                chunk["source_file"] = portable_source(
                    str(chunk.get("source_file", manifest["source_file"]))
                )
                target.write(json.dumps(chunk, ensure_ascii=False) + "\n")
                chunk_count += 1

    return int(manifest.get("page_count", 0)), chunk_count


def main() -> None:
    repository = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(
        description="전처리 자료를 저장소 내부 official-data로 복사합니다."
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=repository.parent,
        help="processed 폴더가 있는 기존 작업 루트",
    )
    args = parser.parse_args()

    source_processed = args.source_root.resolve() / "processed"
    destination = repository / "official-data" / "processed"
    if not source_processed.is_dir():
        raise SystemExit(f"전처리 폴더를 찾을 수 없습니다: {source_processed}")

    documents = 0
    pages = 0
    chunks = 0
    for source_dir in sorted(path for path in source_processed.iterdir() if path.is_dir()):
        if not (source_dir / "manifest.json").is_file():
            continue
        document_pages, document_chunks = copy_document(
            source_dir,
            destination / source_dir.name,
        )
        documents += 1
        pages += document_pages
        chunks += document_chunks

    if documents == 0:
        raise SystemExit("복사할 전처리 자료를 찾지 못했습니다.")

    print(f"동기화 완료: {documents}종, {pages}쪽, {chunks}청크")
    print(f"저장 위치: {destination}")


if __name__ == "__main__":
    main()
