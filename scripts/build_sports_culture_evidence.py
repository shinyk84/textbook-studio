from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "official-data" / "processed"
OUTPUT = ROOT / "static" / "sports-culture-evidence.js"

SOURCES = [
    f"22개정_{publisher}_{kind}"
    for publisher in ("chunjae", "jihaksa", "donga", "miraen")
    for kind in ("textbook", "teacher_guide")
]

UNIT_QUERIES = {
    "스포츠 문화의 의미와 형성": ["스포츠 문화", "문화의 의미", "문화 형성", "신체 활동 문화"],
    "스포츠 인문 문화의 개념과 특성": ["스포츠 인문 문화", "인문 문화의 개념", "인문적 특성"],
    "종목 참여로 인문 문화 읽기": ["인문학적 관점", "스포츠 참여", "직접 참여", "문화 분석"],
    "시대와 사회에 따른 스포츠의 변화": ["스포츠의 역사", "근대 스포츠", "시대", "사회 변화"],
    "스포츠에 담긴 철학과 윤리": ["스포츠 철학", "스포츠 윤리", "공정", "스포츠맨십"],
    "스포츠 문화 현상 비판하기": ["문화 비평", "비판적", "상업화", "미디어"],
    "문학 속 스포츠 경험과 삶": ["스포츠 문학", "문학 작품", "스포츠 경험", "삶"],
    "영화·음악·미술 속 스포츠 표현": ["스포츠 예술", "영화", "음악", "미술"],
    "문학과 예술 비교·창작 및 진로 탐색": ["문학과 예술", "문화 콘텐츠", "창작", "진로"],
    "시설·장비와 스포츠 물질문화": ["스포츠 물질문화", "시설", "장비", "용구"],
    "규칙·제도와 스포츠 제도문화": ["스포츠 제도문화", "규칙", "제도", "조직"],
    "가치·전략과 경기 참여자의 역할": ["스포츠 관념문화", "경기 전략", "참여자", "역할"],
    "우리 반 스포츠 대회 기획하기": ["대회 기획", "대회 계획", "경기 방식", "대진"],
    "선수·심판·운영·미디어 역할로 참여하기": ["선수", "심판", "운영", "미디어 역할"],
    "대회 운영 결과 평가와 진로 탐색": ["대회 운영", "대회 평가", "운영 결과", "진로"],
    "스포츠와 인문·사회 분야의 만남": ["스포츠와 인문", "스포츠와 사회", "융합", "문화 가치"],
    "스포츠와 과학·디지털 미디어의 만남": ["스포츠 과학", "디지털 미디어", "데이터", "기술"],
    "지속 가능한 스포츠 문화 창작하기": ["지속 가능", "환경", "포용", "스포츠 문화 창작"],
}


def sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    candidates = re.split(r"(?<=[.!?다요함됨])\s+|[•●▪■]\s*", text)
    result = []
    for candidate in candidates:
        value = candidate.strip(" -–—|·")
        if not 45 <= len(value) <= 280:
            continue
        if len(re.findall(r"[가-힣]", value)) / max(1, len(value)) < 0.38:
            continue
        if value.count("(") != value.count(")") or "차 례" in value or "……" in value:
            continue
        if not re.search(r"(?:다|이다|한다|된다|있다|없다|이다)[.!?]?\s*$", value):
            continue
        if len(re.findall(r"\d+", value)) > 8 or value.count(":") > 3:
            continue
        result.append(value)
    return result


def score(text: str, queries: list[str]) -> int:
    compact = re.sub(r"\s+", "", text)
    value = 0
    for rank, query in enumerate(queries):
        q = re.sub(r"\s+", "", query)
        if q in compact:
            value += 18 - rank * 2
        value += sum(2 for token in re.findall(r"[가-힣]{2,}", query) if token in text)
    return value


def build() -> dict:
    records = []
    for source_id in SOURCES:
        path = PROCESSED / source_id / "chunks.jsonl"
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            records.append({**row, "documentId": source_id})

    units = {}
    for title, queries in UNIT_QUERIES.items():
        anchors = []
        for item in records:
            text = str(item.get("text", ""))
            relevance = score(text, queries)
            page = int(item.get("physical_page", 0) or 0)
            if page < 8 or "차 례" in text or "구성의 특징" in text:
                relevance -= 20
            if title in text:
                relevance += 35
            if 800 <= len(text) <= 6000:
                relevance += 5
            if relevance > 8:
                anchors.append((relevance, item))
        anchors.sort(key=lambda pair: (-pair[0], pair[1]["documentId"], pair[1].get("physical_page", 0)))
        selected_anchors = []
        anchor_counts = {}
        for relevance, item in anchors:
            source_id = item["documentId"]
            if anchor_counts.get(source_id, 0) >= 3:
                continue
            selected_anchors.append((relevance, item))
            anchor_counts[source_id] = anchor_counts.get(source_id, 0) + 1
        ranked = []
        query_tokens = set(token for query in queries for token in re.findall(r"[가-힣]{2,}", query))
        for anchor_score, item in selected_anchors:
            for sentence in sentences(str(item.get("text", ""))):
                token_hits = sum(token in sentence for token in query_tokens)
                if token_hits == 0 and anchor_score < 35:
                    continue
                noise = 0
                noise += 18 if re.search(r"교과서\s*\d|학습 목표|지도 계획|평가 방법|디지털 체육|생각을 키우는", sentence) else 0
                noise += max(0, sentence.count(",") - 5) * 3
                noise += 12 if re.search(r"[≐⇨]|\.{4,}", sentence) else 0
                prose_bonus = 8 if 70 <= len(sentence) <= 220 else 0
                ranked.append((anchor_score + token_hits * 4 + prose_bonus - noise, {
                    "text": sentence,
                    "documentId": item["documentId"],
                    "publisher": item.get("publisher", ""),
                    "documentType": item.get("document_type", ""),
                    "physicalPage": item.get("physical_page", 0),
                    "sourcePdfPage": item.get("source_pdf_page", 0),
                }))
        ranked.sort(key=lambda pair: (-pair[0], pair[1]["documentId"], pair[1]["physicalPage"]))
        picked = []
        normalized_seen = set()
        source_counts = {}
        for relevance, item in ranked:
            normalized = re.sub(r"[^가-힣A-Za-z0-9]", "", item["text"])
            if normalized in normalized_seen:
                continue
            source_key = item["documentId"]
            if source_counts.get(source_key, 0) >= 7:
                continue
            normalized_seen.add(normalized)
            source_counts[source_key] = source_counts.get(source_key, 0) + 1
            picked.append({**item, "score": relevance})
            if len(picked) >= 36:
                break
        units[title] = {"queries": queries, "evidence": picked}
    return {"schemaVersion": "1.0", "sourceIds": SOURCES, "units": units}


if __name__ == "__main__":
    payload = json.dumps(build(), ensure_ascii=False, separators=(",", ":"))
    OUTPUT.write_text(
        "globalThis.SPORTS_CULTURE_EVIDENCE = " + payload + ";\n",
        encoding="utf-8",
    )
    print(OUTPUT)
