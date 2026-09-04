"""Detect documents whose extracted text layer is degenerate (e.g. an e-book
viewer watermark repeated on every page) rather than real page content.

Heuristic: strip digits/whitespace from each page's text and compare across
pages. If most pages collapse to the same short signature, the "text" field
is almost certainly a repeating stamp (timestamp / title / URL / page number),
not the book's actual content - regardless of char_count, which can look
perfectly normal (a watermark line is not near-empty).

Usage: python scripts/detect_degenerate_text.py <document_id> [<document_id> ...]
       python scripts/detect_degenerate_text.py --all
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "official-data" / "processed"


def signature(text: str) -> str:
    text = re.sub(r"\d+", "#", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def check(document_id: str) -> dict:
    pages_path = PROCESSED / document_id / "pages.jsonl"
    if not pages_path.exists():
        return {"document_id": document_id, "status": "no_pages_jsonl"}
    pages = [json.loads(line) for line in pages_path.open(encoding="utf-8")]
    if not pages:
        return {"document_id": document_id, "status": "empty"}
    sigs = Counter(signature(p["text"]) for p in pages)
    top_sig, top_count = sigs.most_common(1)[0]
    ratio = top_count / len(pages)
    degenerate = ratio >= 0.8 and len(top_sig) < 400
    return {
        "document_id": document_id,
        "status": "degenerate_suspected" if degenerate else "ok",
        "page_count": len(pages),
        "dominant_signature_ratio": round(ratio, 3),
        "dominant_signature_sample": top_sig[:200],
    }


def main() -> None:
    args = sys.argv[1:]
    if args == ["--all"]:
        ids = sorted(p.name for p in PROCESSED.iterdir() if p.is_dir())
    elif args:
        ids = args
    else:
        print(__doc__)
        return
    results = [check(doc_id) for doc_id in ids]
    flagged = [r for r in results if r.get("status") == "degenerate_suspected"]
    for r in results:
        if r.get("status") == "degenerate_suspected":
            print(f"[의심] {r['document_id']}  (동일 패턴 비율 {r['dominant_signature_ratio']*100:.0f}%)  샘플: {r['dominant_signature_sample']!r}")
    print(f"\n총 {len(results)}개 중 {len(flagged)}개 의심됨")


if __name__ == "__main__":
    main()
