"""2022 개정 초등 체육 교과서·지도서 전처리 원문에서 신체활동 예시별 근거 발췌를 뽑는다.

스포츠 문화의 `build_sports_culture_evidence.py`와 같은 역할이다. 초등은 소단원 제목이 편집자마다
바뀌므로 소단원명이 아니라 교육과정 '신체활동 예시'(source_activity)를 열쇠로 삼는다.
결과는 `static/elementary-pe-evidence.js`(브라우저 전역 `ELEMENTARY_PE_EVIDENCE`)로 저장한다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "official-data" / "processed"
CURRICULUM = ROOT / "static" / "prototype-curriculum-data.js"
OUTPUT = ROOT / "static" / "elementary-pe-evidence.js"

PUBLISHER_LABELS = {
    "chunjae": "천재",
    "donga": "동아",
    "geumseong": "금성",
    "iscream": "아이스크림",
    "jihaksa": "지학사",
    "miraen": "미래엔",
    "visang": "비상",
    "ybm": "YBM",
}
DOC_PATTERN = re.compile(r"^22개정_([a-z]+)_elementary_pe([3-6])(?:_\d)?_(textbook|teacher_guide)$")
PER_DOCUMENT_TYPE = 4
PER_PUBLISHER = 2
INVISIBLE = re.compile("[\u0000-\u001f​-‏⁠﻿]")
LINE_BREAK = re.compile(r"\n")


def load_curriculum() -> dict:
    text = CURRICULUM.read_text(encoding="utf-8")
    start = text.index("{")
    end = text.rindex("}") + 1
    return json.loads(text[start:end])


def keywords_for(activity: str) -> list[str]:
    base = activity.strip()
    if len(base) == 1:
        # 3~4 도구 표현의 '줄·공·천'처럼 한 글자 예시는 조사와 붙여야 다른 낱말과 구분된다.
        return [f"{base}을", f"{base}를", f"{base} 표현", f"{base}로 표현"]
    words = [base]
    for suffix in ("형 게임", "형 활동", " 활동", "활동", "하기"):
        if base.endswith(suffix) and len(base) - len(suffix) >= 2:
            words.append(base[: -len(suffix)].strip())
    if "의 " in base:
        words.append(base.split("의 ", 1)[1])
    if "나 " in base:
        words.extend(part.strip() for part in base.split("나 "))
    return [word for word in dict.fromkeys(words) if len(word) >= 2]


def load_documents() -> list[dict]:
    documents = []
    for folder in sorted(PROCESSED.iterdir()):
        match = DOC_PATTERN.match(folder.name)
        pages_path = folder / "pages.jsonl"
        if not match or not pages_path.is_file():
            continue
        publisher, grade, kind = match.groups()
        pages = []
        for line in pages_path.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            pages.append({"page": row.get("physical_page"), "text": row.get("text", "")})
        documents.append({
            "id": folder.name,
            "publisher": PUBLISHER_LABELS.get(publisher, publisher),
            "grade": int(grade),
            "documentType": "교과서" if kind == "textbook" else "지도서",
            "pages": pages,
        })
    return documents


def clean_lines(text: str) -> list[str]:
    lines = []
    for raw in LINE_BREAK.split(text):
        value = INVISIBLE.sub(" ", raw)
        value = re.sub(r"\s+", " ", value).strip(" -–—|·•●▪■▶")
        if len(value) < 12:
            continue
        if len(re.findall(r"[가-힣]", value)) / max(1, len(value)) < 0.5:
            continue
        lines.append(value)
    return lines


def excerpt_for(text: str, keywords: list[str]) -> str | None:
    lines = clean_lines(text)
    for index, line in enumerate(lines):
        if not any(keyword in line for keyword in keywords):
            continue
        chunk = line
        cursor = index + 1
        while len(chunk) < 140 and cursor < len(lines):
            chunk = f"{chunk} {lines[cursor]}"
            cursor += 1
        return chunk[:240]
    return None


def build() -> dict:
    curriculum = load_curriculum()
    documents = load_documents()
    activities: dict[str, dict] = {}
    for candidate in curriculum.get("content_candidates", []):
        band = candidate["grade_band"]
        band_grades = {3, 4} if band.startswith("3") else {5, 6}
        for group in candidate.get("activity_groups", []):
            for small in group.get("small_units", []):
                activity = small["source_activity"]
                key = f"{band}|{activity}"
                if key in activities:
                    continue
                keywords = keywords_for(activity)
                evidence = []
                for document_type in ("교과서", "지도서"):
                    scored = []
                    for document in documents:
                        if document["documentType"] != document_type or document["grade"] not in band_grades:
                            continue
                        for page in document["pages"]:
                            hits = sum(page["text"].count(keyword) for keyword in keywords)
                            if hits:
                                scored.append((hits, document, page))
                    scored.sort(key=lambda item: (-item[0], item[1]["id"], item[2]["page"] or 0))
                    per_publisher: dict[str, int] = {}
                    picked = 0
                    for _hits, document, page in scored:
                        if picked >= PER_DOCUMENT_TYPE:
                            break
                        if per_publisher.get(document["publisher"], 0) >= PER_PUBLISHER:
                            continue
                        text = excerpt_for(page["text"], keywords)
                        if not text:
                            continue
                        evidence.append({
                            "documentId": document["id"],
                            "publisher": document["publisher"],
                            "grade": document["grade"],
                            "documentType": document_type,
                            "physicalPage": page["page"],
                            "text": text,
                        })
                        per_publisher[document["publisher"]] = per_publisher.get(document["publisher"], 0) + 1
                        picked += 1
                activities[key] = {
                    "band": band,
                    "domain": candidate["domain"],
                    "subdomain": candidate["subdomain"],
                    "middleUnit": group["middle_unit_title"],
                    "activity": activity,
                    "keywords": keywords,
                    "evidence": evidence,
                }
    return {
        "schema": "elementary-pe-evidence/1",
        "sourceCount": len(documents),
        "activities": activities,
    }


def main() -> None:
    data = build()
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(f"globalThis.ELEMENTARY_PE_EVIDENCE = {payload};\n", encoding="utf-8")
    matched = sum(1 for item in data["activities"].values() if item["evidence"])
    print(f"{OUTPUT.name}: 문서 {data['sourceCount']}종, 활동 {len(data['activities'])}개 중 근거 있음 {matched}개")


if __name__ == "__main__":
    main()
