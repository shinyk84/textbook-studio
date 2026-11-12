"""2015·2009 개정 분석 화면용 자료(static/revision-reference-data.js)를 만든다.

- 2015·2022 초등 체육: docs/structure-analysis/book_structure_baselines.json(전처리 자료에서 실측한 출판사별
  단원 쪽수·차시)을 그대로 옮긴다. units 항목은 [영역, 차시, 쪽수] 순서다.
- 2009: 초등은 교육과정만 있다(00_curricula_2009_2015_2022.md 1-2절·2절). 고등 스포츠 문화는 YBM 교과서
  차례(official-data/processed/09개정_ybm_textbook, 6쪽)와 지도서 연간 교수·학습 계획(09개정_ybm_teacher_guide,
  총론 29~30쪽, 6단위 예시)에서 옮겼다. 쪽 수는 차례의 시작 쪽 차이라 대단원 도입 쪽이 섞인 근사값이다.

실행: python scripts/build_revision_reference.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASELINES = ROOT / "docs" / "structure-analysis" / "book_structure_baselines.json"
OUTPUT = ROOT / "static" / "revision-reference-data.js"

# 2009 개정 고등 스포츠 문화(YBM): (대단원, 소단원, 차례 시작 쪽, 지도서 연간 계획 차시)
SPORTS_CULTURE_2009 = [
    ("Ⅰ. 스포츠 정신 문화", "1. 스포츠 역사와 스포츠 정신 문화의 이해", 11, 4),
    ("Ⅰ. 스포츠 정신 문화", "2. 스포츠 윤리", 36, 2),
    ("Ⅰ. 스포츠 정신 문화", "3. 스포츠에서의 예술성 탐색과 감상", 46, 4),
    ("Ⅱ. 스포츠 경기 문화", "1. 영역형 경쟁 스포츠 - 축구", 69, 12),
    ("Ⅱ. 스포츠 경기 문화", "2. 영역형 경쟁 스포츠 - 농구", 87, 12),
    ("Ⅱ. 스포츠 경기 문화", "3. 필드형 경쟁 스포츠 - 야구", 101, 12),
    ("Ⅱ. 스포츠 경기 문화", "4. 네트형 경쟁 스포츠 - 배구", 115, 12),
    ("Ⅱ. 스포츠 경기 문화", "5. 네트형 경쟁 스포츠 - 배드민턴", 129, 12),
    ("Ⅱ. 스포츠 경기 문화", "6. 표적 도전 스포츠 - 골프", 143, 10),
    ("Ⅱ. 스포츠 경기 문화", "7. 기록 도전 스포츠 경기", 154, 10),
    ("Ⅱ. 스포츠 경기 문화", "특집: 전통 스포츠 경기 - 씨름", 174, 2),
    ("Ⅲ. 스포츠 축제 문화", "1. 스포츠 축제의 이해", 185, 4),
    ("Ⅲ. 스포츠 축제 문화", "2. 스포츠 축제의 참여", 206, 3),
    ("Ⅲ. 스포츠 축제 문화", "3. 스포츠 미디어와 스포츠 산업", 224, 3),
]
SPORTS_CULTURE_2009_APPENDIX_START = 245
SPORTS_CULTURE_2009_LAST_PAGE = 255


def sports_culture_2009() -> dict:
    starts = [row[2] for row in SPORTS_CULTURE_2009] + [SPORTS_CULTURE_2009_APPENDIX_START]
    units = [
        {"large": large, "title": title, "startPage": start, "pages": starts[index + 1] - start, "hours": hours}
        for index, (large, title, start, hours) in enumerate(SPORTS_CULTURE_2009)
    ]
    return {
        "title": "고등학교 스포츠 문화 (YBM)",
        "source": "교과서 차례(6~7쪽) · 지도서 연간 교수·학습 계획(총론 29~30쪽, 6단위 예시)",
        "textbookPages": 256,
        "guidePages": 368,
        "appendixPages": SPORTS_CULTURE_2009_LAST_PAGE - SPORTS_CULTURE_2009_APPENDIX_START + 1,
        "minimumHours": 85,
        "units": units,
        "note": "쪽 수는 차례 시작 쪽의 차이라 대단원 도입 쪽이 섞인 근사값입니다. 차시는 지도서의 6단위(102차시) 예시이며 최소 이수는 5단위 85차시입니다.",
    }


PROCESSED = ROOT / "official-data" / "processed"
PUBLISHER_NAMES = {"chunjae": "천재교과서", "donga": "동아출판", "jihaksa": "지학사", "miraen": "미래엔", "ssimas": "씨마스", "ybm": "YBM"}


def sports_culture_documents() -> dict:
    """고등 스포츠 문화 교과서·지도서 목록과 PDF 쪽수(전처리 manifest·pages.jsonl 기준)."""
    rows: dict[str, list] = {}
    for manifest_path in sorted(PROCESSED.glob("*/manifest.json")):
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        title = str(manifest.get("title") or "")
        if not ("스포츠" in title and "문화" in title) or manifest.get("document_type") not in ("교과서", "지도서"):
            continue
        revision = str(manifest.get("curriculum_revision") or "")[:4]
        key = manifest["document_id"].split("_")[1]
        pages_path = manifest_path.parent / "pages.jsonl"
        pages = sum(1 for _ in pages_path.open(encoding="utf-8")) if pages_path.is_file() else None
        rows.setdefault(revision, []).append({
            "publisher": PUBLISHER_NAMES.get(key, manifest.get("publisher") or key),
            "kind": manifest["document_type"],
            "pdfPages": pages,
            "title": title,
        })
    return rows


def main() -> None:
    baselines = json.loads(BASELINES.read_text(encoding="utf-8"))
    books = [
        {**book, "units": [{"area": area, "hours": hours, "pages": pages} for area, hours, pages in book["units"]]}
        for book in baselines["books"]
    ]
    sports_docs = sports_culture_documents()
    data = {
        "updated": baselines.get("updated", ""),
        "source": "docs/structure-analysis(전처리 자료 실측)",
        "revisions": {
            "2015": {
                "label": "2015 개정",
                "elementary": {
                    "hoursPerGrade": baselines["curricula"]["2015"]["hours_per_grade"],
                    "hoursPerBand": 204,
                    "areas": baselines["curricula"]["2015"]["areas"],
                    "note": "학년군 204시간(2015 총론 원문은 미확보, 2009·2022와 같은 값으로 표시).",
                },
                "books": [book for book in books if book["rev"] == "2015"],
                "sportsCultureDocuments": sports_docs.get("2015", []),
            },
            "2009": {
                "label": "2009 개정",
                "elementary": {
                    "hoursPerGrade": 102,
                    "hoursPerBand": 204,
                    "areas": [
                        {"key": "건강 활동", "middle": {"3-4": ["건강과 생활 습관", "건강과 체력 향상"], "5-6": ["건강과 신체 발달", "건강과 재해 안전"]}},
                        {"key": "도전 활동", "middle": {"3-4": ["속도 도전", "동작 도전"], "5-6": ["거리 도전", "표적/투기 도전"]}},
                        {"key": "경쟁 활동", "middle": {"3-4": ["피하기형 경쟁", "영역형 경쟁"], "5-6": ["필드형 경쟁", "네트형 경쟁"]}},
                        {"key": "표현 활동", "middle": {"3-4": ["움직임 표현", "리듬 표현"], "5-6": ["민속 표현", "주제 표현"]}},
                        {"key": "여가 활동", "middle": {"3-4": ["가족과 여가", "전통 놀이와 여가"], "5-6": ["생활 환경과 여가", "자연 환경과 여가"]}},
                    ],
                    "standardsPerBand": 40,
                    "note": "중영역마다 성취기준 4개(학년군 40개). 초등 교과서·지도서는 전처리 자료에 없습니다.",
                },
                "highSportsCulture": sports_culture_2009(),
                "books": [],
                "sportsCultureDocuments": sports_docs.get("2009", []),
            },
            "2022": {
                "label": "2022 개정",
                "elementary": {
                    "hoursPerGrade": baselines["curricula"]["2022"]["hours_per_grade"],
                    "hoursPerBand": 204,
                    "areas": baselines["curricula"]["2022"]["areas"],
                    "note": "",
                },
                "books": [book for book in books if book["rev"] == "2022"],
                "sportsCultureDocuments": sports_docs.get("2022", []),
            },
        },
    }
    OUTPUT.write_text(
        "// scripts/build_revision_reference.py가 만든 파일입니다. 직접 고치지 말고 스크립트를 다시 실행하세요.\n"
        f"window.REVISION_REFERENCE = {json.dumps(data, ensure_ascii=False, indent=1)};\n",
        encoding="utf-8",
    )
    print(f"wrote {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
