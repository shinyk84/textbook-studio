"""Build the static curriculum dataset used by prototype.html."""

from __future__ import annotations

import json
import re
from pathlib import Path

import app


OUTPUT_PATH = Path(__file__).resolve().parents[1] / "static" / "prototype-curriculum-data.js"
PAGE_PATTERN = re.compile(r"<!-- source_page:\s*(\d+)\s*-->")
STANDARD_PATTERN = re.compile(r"^\[(?P<level>[46])체(?P<domain>0[123])-(?P<number>\d{2})\]\s+(?P<text>.+)$")
DOMAIN_LABELS = {"01": "운동", "02": "스포츠", "03": "표현"}
SPORTS_CULTURE_PATTERN = re.compile(
    r"^\[(?P<code>12스문0[12]-\d{2})\]\s+(?P<text>.+)$"
)
SPORTS_CULTURE_DOMAINS = {"01": "스포츠 인문 문화", "02": "스포츠 경기 문화"}
SECONDARY_STANDARD_PATTERN = re.compile(r"^\[(?P<code>(?:9체|12)[^\]]+)\]\s*(?P<text>.+)$")
HIGH_COURSES = {
    "체육1": {"catalog_id": "high-pe-1", "category": "일반 선택", "credits": 3, "minimum_credits": 2, "maximum_credits": 4},
    "체육2": {"catalog_id": "high-pe-2", "category": "일반 선택", "credits": 3, "minimum_credits": 2, "maximum_credits": 4},
    "운동과 건강": {"catalog_id": "high-exercise-health", "category": "진로 선택", "credits": 3, "minimum_credits": 2, "maximum_credits": 4},
    "스포츠 문화": {"catalog_id": "high-sports-culture", "category": "진로 선택", "credits": 2, "minimum_credits": 1, "maximum_credits": 2},
    "스포츠 과학": {"catalog_id": "high-sports-science", "category": "진로 선택", "credits": 2, "minimum_credits": 1, "maximum_credits": 2},
    "스포츠 생활1": {"catalog_id": "high-sports-life-1", "category": "융합 선택", "credits": 3, "minimum_credits": 2, "maximum_credits": 4},
    "스포츠 생활2": {"catalog_id": "high-sports-life-2", "category": "융합 선택", "credits": 3, "minimum_credits": 2, "maximum_credits": 4},
}


def processed_document_containing(text: str) -> tuple[Path, str]:
    for path in app.PROCESSED_DIR.glob("*/document.md"):
        content = path.read_text(encoding="utf-8")
        if text in content:
            return path, content
    raise SystemExit(f"공식 전처리 문서에서 근거를 찾을 수 없습니다: {text}")


def processed_paginated_document_containing(text: str) -> tuple[Path, str]:
    for path in app.PROCESSED_DIR.glob("*/document.md"):
        content = path.read_text(encoding="utf-8")
        if text in content and PAGE_PATTERN.search(content):
            return path, content
    raise SystemExit(f"페이지 색인이 있는 공식 전처리 문서에서 근거를 찾을 수 없습니다: {text}")


def source_page_at(content: str, offset: int) -> int | None:
    pages = list(PAGE_PATTERN.finditer(content, 0, offset))
    return int(pages[-1].group(1)) if pages else None


def page_policies() -> dict[str, dict]:
    elementary_excerpt = "교과서 분량은 부록을 포함하여 책별 120쪽이며, 10% 범위 내에서 증감할 수 있다."
    elementary_path, elementary_content = processed_document_containing(
        "교과서 분량은 부록을 포함하여 책별 120쪽"
    )
    elementary_offset = elementary_content.index("교과서 분량은 부록을 포함하여 책별 120쪽")

    sports_excerpt = "교과서 분량은 부록을 포함하여 180쪽이며, 10% 범위 내에서 증감할 수 있다."
    sports_path, sports_content = processed_document_containing("스포츠 문화\n교과서")
    sports_start = sports_content.index("스포츠 문화\n교과서")
    sports_offset = sports_content.index(sports_excerpt, sports_start)

    guideline_path, guideline_content = processed_document_containing("10쪽을넘지않도록구성")
    guideline_offset = guideline_content.index("10쪽을넘지않도록구성")
    elementary_curriculum_path, elementary_curriculum_content = processed_document_containing(
        "|  | 체육 |  | 204 | 204 |"
    )
    elementary_hours_offset = elementary_curriculum_content.index("|  | 체육 |  | 204 | 204 |")
    high_curriculum_path, _ = processed_document_containing(
        "* 표시한 과목의 기본 학점은 2학점"
    )
    return {
        "elementary_pe": {
            "status": "connected",
            "baseline_pages": 120,
            "minimum_pages": 108,
            "maximum_pages": 132,
            "supplementary_maximum_pages": 10,
            "excerpt": elementary_excerpt,
            "source_document_id": elementary_path.parent.name,
            "source_page": source_page_at(elementary_content, elementary_offset),
            "source_printed_page": 45,
            "supplementary_source_document_id": guideline_path.parent.name,
            "supplementary_source_page": source_page_at(guideline_content, guideline_offset),
            "group_hours": 204,
            "default_book_hours": 102,
            "hours_source_document_id": elementary_curriculum_path.parent.name,
            "hours_source_page": source_page_at(elementary_curriculum_content, elementary_hours_offset),
            "hours_source_printed_page": 17,
        },
        "sports_culture": {
            "status": "connected",
            "baseline_pages": 180,
            "minimum_pages": 162,
            "maximum_pages": 198,
            "supplementary_maximum_pages": 0,
            "supplementary_status": "unverified",
            "excerpt": sports_excerpt,
            "source_document_id": sports_path.parent.name,
            "source_page": source_page_at(sports_content, sports_offset),
            "source_location": "스포츠 문화 4. 기타 (8)",
            "default_credits": 2,
            "minimum_credits": 1,
            "lessons_per_credit": 16,
            "default_hours": 32,
            "minimum_hours": 16,
            "maximum_hours": 32,
            "hours_source_document_id": high_curriculum_path.parent.name,
            "hours_source_location": "보통 교과 학점 배당과 별표 과목 감축 규정",
        },
    }


def complete_statements(lines: list[str]) -> dict[str, str]:
    statements: dict[str, list[str]] = {}
    active_code: str | None = None
    for line in lines:
        stripped = line.strip()
        match = STANDARD_PATTERN.match(stripped)
        if match:
            active_code = (
                f"[{match.group('level')}체{match.group('domain')}-{match.group('number')}]"
            )
            statements[active_code] = [match.group("text")]
            continue
        if active_code and (
            stripped.startswith("#####")
            or stripped.startswith("<!--")
            or stripped.startswith("## PDF")
            or stripped.startswith("> 문서")
        ):
            if stripped.startswith("#####"):
                active_code = None
            continue
        if active_code and stripped:
            if stripped.startswith("["):
                active_code = None
            else:
                statements[active_code].append(stripped)
    return {code: " ".join(parts) for code, parts in statements.items()}


def consideration_rows(lines: list[str]) -> list[dict]:
    results: list[dict] = []
    source_page = 0
    grade_band = ""
    domain = ""
    collecting = False
    start_page = 0
    last_content_page = 0
    content: list[str] = []

    def finish() -> None:
        nonlocal collecting, content, last_content_page
        if collecting and grade_band and domain and content:
            results.append(
                {
                    "grade_band": grade_band,
                    "domain": domain,
                    "text": "\n\n".join(content),
                    "source_page": start_page,
                    "source_page_end": last_content_page or start_page,
                }
            )
        collecting = False
        content = []
        last_content_page = 0

    for line in lines:
        page_match = PAGE_PATTERN.search(line)
        if page_match:
            source_page = int(page_match.group(1))
            continue
        stripped = line.strip()
        if stripped.startswith("[중학교"):
            finish()
            break
        standard_match = STANDARD_PATTERN.match(stripped)
        if standard_match:
            grade_band = "3~4학년군" if standard_match.group("level") == "4" else "5~6학년군"
            domain = DOMAIN_LABELS[standard_match.group("domain")]
        if stripped == "###### (나) 성취기준 적용 시 고려 사항":
            finish()
            collecting = True
            start_page = source_page
            continue
        if collecting and (
            stripped.startswith("##### (")
            or stripped.startswith("### 2.")
            or stripped.startswith("###### (가)")
            or stripped.startswith("<표 ")
        ):
            finish()
        if collecting and stripped and not (
            stripped.startswith("<!--")
            or stripped.startswith("## PDF 원본 페이지")
            or stripped.startswith("> 문서 인쇄면")
            or stripped.startswith("2022 개정 교육과정에 따른")
            or stripped.startswith("Ⅰ. 초등학교")
        ):
            if stripped.startswith("• "):
                content.append(stripped)
                last_content_page = source_page
            elif content:
                content[-1] += f" {stripped}"
                last_content_page = source_page
    finish()
    return results


def sports_culture_rows(lines: list[str]) -> list[dict]:
    source_page = 0
    statements: dict[str, dict] = {}
    explanations: dict[str, dict] = {}
    active_statement: str | None = None
    active_explanation: str | None = None
    in_explanations = False

    for line in lines:
        page_match = PAGE_PATTERN.search(line)
        if page_match:
            source_page = int(page_match.group(1))
            continue
        stripped = line.strip()
        match = SPORTS_CULTURE_PATTERN.match(stripped)
        if match:
            code = f"[{match.group('code')}]"
            if in_explanations and stripped.startswith("•"):
                active_explanation = code
                explanations[code] = {"parts": [match.group("text")], "source_page": source_page}
            elif not in_explanations:
                active_statement = code
                statements[code] = {"parts": [match.group("text")], "source_page": source_page}
            continue
        bullet_match = re.match(r"^•\s+(\[12스문0[12]-\d{2}\])\s*(.*)$", stripped)
        if in_explanations and bullet_match:
            active_explanation = bullet_match.group(1)
            explanations[active_explanation] = {
                "parts": [bullet_match.group(2)],
                "source_page": source_page,
            }
            continue
        if stripped == "###### (가) 성취기준 해설":
            in_explanations = True
            active_statement = None
            active_explanation = None
            continue
        if in_explanations and stripped.startswith("###### (나)"):
            in_explanations = False
            active_explanation = None
            continue
        if not stripped or stripped.startswith(("<!--", "## PDF", "> 문서", "#####")):
            continue
        if in_explanations and active_explanation:
            explanations[active_explanation]["parts"].append(stripped)
        elif active_statement and not stripped.startswith("["):
            statements[active_statement]["parts"].append(stripped)

    results = []
    for code, value in statements.items():
        domain_code = code[5:7]
        explanation = explanations.get(code, {"parts": [], "source_page": 0})
        results.append(
            {
                "code": code,
                "grade_band": "고등학교",
                "domain": SPORTS_CULTURE_DOMAINS[domain_code],
                "statement": " ".join(value["parts"]),
                "source_page": value["source_page"],
                "source_document_id": "체육과_교육과정",
                "explanation": " ".join(explanation["parts"]),
                "explanation_source_page": explanation["source_page"],
            }
        )
    return results


def secondary_course_rows(lines: list[str], course_name: str | None = None) -> list[dict]:
    """Extract middle-school or one high-school course without inventing missing metadata."""
    start = 0
    end = len(lines)
    if course_name:
        heading = f"### {course_name}"
        start = next(i for i, line in enumerate(lines) if line.strip() == heading)
        later_courses = [
            i for i, line in enumerate(lines[start + 1 :], start + 1)
            if line.strip() in {f"### {name}" for name in HIGH_COURSES}
        ]
        end = min(later_courses) if later_courses else len(lines)

    source_page = 0
    domain = ""
    in_standards = False
    in_explanations = False
    active_code: str | None = None
    statements: dict[str, dict] = {}
    explanations: dict[str, dict] = {}
    for line in lines[start:end]:
        page_match = PAGE_PATTERN.search(line)
        if page_match:
            source_page = int(page_match.group(1))
            continue
        stripped = line.strip()
        if stripped == "#### 나. 성취기준":
            in_standards = True
            continue
        domain_match = re.match(r"^##### \(\d+\)\s+(.+)$", stripped)
        if in_standards and domain_match:
            domain = domain_match.group(1).strip()
            in_explanations = False
            active_code = None
            continue
        if stripped == "###### (가) 성취기준 해설":
            in_explanations = True
            active_code = None
            continue
        if stripped.startswith("###### (나)"):
            in_explanations = False
            active_code = None
            continue
        if not in_standards:
            continue
        match = SECONDARY_STANDARD_PATTERN.match(stripped.lstrip("• "))
        if match:
            code = f"[{match.group('code')}]"
            if course_name is None and not code.startswith("[9체"):
                continue
            if course_name is not None and code.startswith("[9체"):
                continue
            target = explanations if in_explanations or stripped.startswith("•") else statements
            target[code] = {
                "parts": [match.group("text")],
                "source_page": source_page,
                "domain": domain,
            }
            active_code = code
            continue
        if active_code and stripped and not stripped.startswith(("<!--", "## PDF", "> 문서", "#####", "####")):
            target = explanations if in_explanations else statements
            if active_code in target:
                target[active_code]["parts"].append(stripped)

    rows = []
    for code, value in statements.items():
        explanation = explanations.get(code, {"parts": [], "source_page": 0})
        rows.append({
            "code": code,
            "grade_band": "고등학교" if course_name else "중학교 1~3학년",
            "domain": value["domain"] or {"01": "운동", "02": "스포츠", "03": "표현"}.get(code[3:5], "체육"),
            "statement": " ".join(value["parts"]),
            "source_page": value["source_page"],
            "source_printed_page": value["source_page"] - 6 if value["source_page"] else None,
            "source_document_id": "체육과_교육과정",
            "explanation": " ".join(explanation["parts"]),
            "explanation_source_page": explanation["source_page"],
            "explanation_source_printed_page": explanation["source_page"] - 6 if explanation["source_page"] else None,
        })
    return rows


def secondary_courses(lines: list[str]) -> dict[str, dict]:
    criteria_path, criteria_content = processed_document_containing("「체육1」, 「체육2」각 180쪽")
    hours_path, hours_content = processed_paginated_document_containing("* 표시한 과목의 기본 학점은 2학점")
    hours_offset = hours_content.index("* 표시한 과목의 기본 학점은 2학점")
    middle_hours_path, middle_hours_content = processed_paginated_document_containing("|  | 체육 | 272 |")
    middle_hours_offset = middle_hours_content.index("|  | 체육 | 272 |")
    excerpt = "교과서 분량은 부록을 포함하여 180쪽이며, 10% 범위 내에서 증감할 수 있다."
    courses: dict[str, dict] = {
        "중등 체육": {
            "catalog_id": "middle-pe",
            "school_level": "중학교",
            "subject": "체육",
            "status": "partial",
            "hours": 272,
            "hours_source_document_id": middle_hours_path.parent.name,
            "hours_source_page": source_page_at(middle_hours_content, middle_hours_offset),
            "hours_source_printed_page": 20,
            "hours_source_location": "중학교 시간 배당 기준 <표 2>",
            "hours_excerpt": "| 교과(군) | 체육 | 272 |\n\n② 교과(군)별 시간 배당은 연간 34주를 기준으로 3년간의 기준 수업 시수를 나타낸 것이다.",
            "standards": secondary_course_rows(lines),
        }
    }
    for name, config in HIGH_COURSES.items():
        search = "「체육1」, 「체육2」각 180쪽" if name in {"체육1", "체육2"} else excerpt
        start_hint = criteria_content.index("체육1, 체육2\n교과서") if name in {"체육1", "체육2"} else criteria_content.index(f"{name}\n교과서")
        offset = criteria_content.index(search, start_hint)
        credits = config["credits"]
        courses[name] = {
            **config,
            "school_level": "고등학교",
            "subject": name,
            "status": "connected",
            "lessons_per_credit": 16,
            "default_hours": credits * 16,
            "minimum_hours": config["minimum_credits"] * 16,
            "maximum_hours": config["maximum_credits"] * 16,
            "page_policy": {
                "baseline_pages": 180,
                "minimum_pages": 162,
                "maximum_pages": 198,
                "supplementary_maximum_pages": 0,
                "supplementary_status": "unverified",
                "excerpt": criteria_content[offset:criteria_content.find("\n", offset)].strip(),
                "source_document_id": criteria_path.parent.name,
                "source_location": f"고등학교 체육 · {name} · 4. 기타",
                "source_printed_pages": "20~45",
                "source_page_note": "원본 목차의 고등학교 체육 전체 범위이며, 범위 안에서 과목별 소제목을 확인",
            },
            "hours_source_document_id": hours_path.parent.name,
            "hours_source_page": source_page_at(hours_content, hours_offset),
            "hours_source_printed_page": 27,
            "hours_source_location": "보통 교과 선택 과목 학점 규정",
            "hours_excerpt": (
                "③ * 표시한 과목의 기본 학점은 2학점이며, 1학점 범위 내에서 감하여 편성·운영할 수 있다."
                if credits == 2
                else "① 선택 과목의 기본 학점은 4학점이다. 단, 체육 교과(군)의 기본 학점은 3학점이다.\n\n② 선택 과목은 1학점 범위 내에서 증감하여 편성·운영할 수 있다."
            ),
            "standards": secondary_course_rows(lines, name),
        }
    return courses


def main() -> None:
    document_path = app.curriculum_document_path()
    if document_path is None:
        raise SystemExit("체육과 교육과정 전처리 문서를 찾을 수 없습니다.")
    lines = document_path.read_text(encoding="utf-8").splitlines()
    statements = complete_statements(lines)
    standards = app.extract_curriculum_standards(document_path)
    for standard in standards:
        standard["statement"] = statements.get(standard["code"], standard["statement"])
        standard["explanation"] = re.sub(
            r"\s*####\s*다\.\s*", " ", standard["explanation"]
        ).strip()

    content_candidates = app.official_activity_candidates()

    payload = {
        "source_document_id": "체육과_교육과정",
        "standards": standards,
        "considerations": consideration_rows(lines),
        "content_candidates": content_candidates,
        "sports_culture_standards": sports_culture_rows(lines),
        "secondary_courses": secondary_courses(lines),
        "page_policies": page_policies(),
    }
    content = (
        "window.PROTOTYPE_CURRICULUM_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    OUTPUT_PATH.write_text(content, encoding="utf-8")
    print(
        f"{OUTPUT_PATH}: 성취기준 {len(standards)}개, "
        f"적용 시 고려 사항 {len(payload['considerations'])}개, "
        f"내용·종목 후보 {len(content_candidates)}개, "
        f"스포츠 문화 성취기준 {len(payload['sports_culture_standards'])}개"
    )


if __name__ == "__main__":
    main()
