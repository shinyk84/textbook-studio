from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse


APP_DIR = Path(__file__).resolve().parent
WORKSPACE_DIR = Path(os.environ.get("TEXTBOOK_DATA_ROOT", APP_DIR.parent)).resolve()
PROCESSED_DIR = WORKSPACE_DIR / "processed"
STATIC_DIR = APP_DIR / "static"
DB_PATH = Path(os.environ.get("TEXTBOOK_STUDIO_DB", APP_DIR / "data" / "studio.db")).resolve()

DEFAULT_PROJECT = {
    "name": "초등 체육 3~6학년 교과서 개발",
    "subject": "체육",
    "school_level": "초등학교",
    "curriculum_version": "2022 개정 교육과정",
    "grades": [3, 4, 5, 6],
    "page_baseline": 120,
    "page_min": 108,
    "page_max": 132,
    "supplement_max": 10,
    "band_hours_34": 204,
    "band_hours_56": 204,
    "default_grade_hours": 102,
}

DOCUMENT_TYPE_LABELS = {
    "curriculum": "교육과정",
    "editorial_criteria": "편찬·검정 기준",
    "development_guide": "개발 가이드라인",
    "editorial_reference": "편수·참고 자료",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
    finally:
        connection.close()


def initialize_database() -> None:
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS project (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sources (
                document_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                document_type TEXT NOT NULL,
                source_file TEXT NOT NULL,
                source_sha256 TEXT NOT NULL,
                source_size_bytes INTEGER NOT NULL,
                page_count INTEGER NOT NULL,
                chunk_count INTEGER NOT NULL,
                table_count INTEGER NOT NULL,
                warning_page_count INTEGER NOT NULL,
                processed_at TEXT,
                manifest_path TEXT NOT NULL,
                integrity_status TEXT NOT NULL,
                review_status TEXT NOT NULL DEFAULT 'pending',
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_at TEXT,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                action TEXT NOT NULL,
                details TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS curriculum_standards (
                code TEXT PRIMARY KEY,
                grade_band TEXT NOT NULL,
                domain TEXT NOT NULL,
                statement TEXT NOT NULL,
                source_page INTEGER NOT NULL,
                explanation TEXT NOT NULL DEFAULT '',
                explanation_source_page INTEGER NOT NULL DEFAULT 0,
                source_document_id TEXT NOT NULL,
                FOREIGN KEY (source_document_id) REFERENCES sources(document_id)
            );

            CREATE TABLE IF NOT EXISTS curriculum_analysis (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                approved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS curriculum_analysis_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                change_note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS development_direction (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                approved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS development_direction_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                change_note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS grade_allocation (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                approved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS grade_allocation_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                change_note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS content_selection (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                approved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS content_selection_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                change_note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workflow_stages (
                stage_key TEXT PRIMARY KEY,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL,
                approved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS workflow_stage_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stage_key TEXT NOT NULL,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL,
                change_note TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            """
        )
        standard_columns = {
            row["name"] for row in db.execute("PRAGMA table_info(curriculum_standards)")
        }
        if "explanation" not in standard_columns:
            db.execute(
                "ALTER TABLE curriculum_standards ADD COLUMN explanation TEXT NOT NULL DEFAULT ''"
            )
        if "explanation_source_page" not in standard_columns:
            db.execute(
                """
                ALTER TABLE curriculum_standards
                ADD COLUMN explanation_source_page INTEGER NOT NULL DEFAULT 0
                """
            )
        row = db.execute("SELECT id FROM project WHERE id = 1").fetchone()
        if row is None:
            db.execute(
                "INSERT INTO project (id, payload, updated_at) VALUES (1, ?, ?)",
                (json.dumps(DEFAULT_PROJECT, ensure_ascii=False), utc_now()),
            )
        db.commit()
    synchronize_sources()
    synchronize_curriculum_standards()
    initialize_curriculum_analysis()
    initialize_development_direction()
    initialize_grade_allocation()
    initialize_content_selection()
    initialize_workflow_stages()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_title(manifest: dict, folder: Path) -> str:
    source_name = Path(manifest.get("source_file", "")).stem
    return source_name or folder.name


def determine_integrity(manifest: dict, folder: Path) -> str:
    outputs = manifest.get("outputs", [])
    if any(not (folder / output).is_file() for output in outputs):
        return "outputs_missing"

    source_path = Path(manifest.get("source_file", ""))
    if not source_path.is_file():
        return "source_missing"

    expected_hash = manifest.get("source_sha256", "").lower()
    if not expected_hash or sha256_file(source_path) != expected_hash:
        return "hash_mismatch"

    if len(manifest.get("pages", [])) != int(manifest.get("page_count", 0)):
        return "page_mismatch"
    return "verified"


def synchronize_sources() -> None:
    if not PROCESSED_DIR.is_dir():
        return

    manifests = sorted(PROCESSED_DIR.glob("*/manifest.json"))
    with connect_db() as db:
        for manifest_path in manifests:
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue

            folder = manifest_path.parent
            document_id = str(manifest.get("document_id") or folder.name)
            integrity_status = determine_integrity(manifest, folder)
            now = utc_now()
            db.execute(
                """
                INSERT INTO sources (
                    document_id, title, document_type, source_file, source_sha256,
                    source_size_bytes, page_count, chunk_count, table_count,
                    warning_page_count, processed_at, manifest_path, integrity_status,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id) DO UPDATE SET
                    title = excluded.title,
                    document_type = excluded.document_type,
                    source_file = excluded.source_file,
                    source_sha256 = excluded.source_sha256,
                    source_size_bytes = excluded.source_size_bytes,
                    page_count = excluded.page_count,
                    chunk_count = excluded.chunk_count,
                    table_count = excluded.table_count,
                    warning_page_count = excluded.warning_page_count,
                    processed_at = excluded.processed_at,
                    manifest_path = excluded.manifest_path,
                    integrity_status = excluded.integrity_status,
                    updated_at = excluded.updated_at
                """,
                (
                    document_id,
                    source_title(manifest, folder),
                    str(manifest.get("document_type", "unknown")),
                    str(manifest.get("source_file", "")),
                    str(manifest.get("source_sha256", "")),
                    int(manifest.get("source_size_bytes", 0)),
                    int(manifest.get("page_count", 0)),
                    int(manifest.get("chunk_count", 0)),
                    int(manifest.get("table_count", 0)),
                    int(manifest.get("warning_page_count", 0)),
                    manifest.get("processed_at"),
                    str(manifest_path),
                    integrity_status,
                    now,
                ),
            )
        db.commit()


def curriculum_document_path() -> Path | None:
    preferred = PROCESSED_DIR / "체육과_교육과정" / "document.md"
    if preferred.is_file():
        return preferred
    for manifest_path in PROCESSED_DIR.glob("*/manifest.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            manifest.get("document_type") == "curriculum"
            and "체육과" in str(manifest.get("document_id", ""))
        ):
            document = manifest_path.parent / "document.md"
            if document.is_file():
                return document
    return None


def extract_curriculum_standards(document_path: Path) -> list[dict]:
    page_pattern = re.compile(r"<!-- source_page:\s*(\d+)\s*-->")
    standard_pattern = re.compile(
        r"^\[(?P<level>[46])체(?P<domain>0[123])-(?P<number>\d{2})\]\s+(?P<statement>.+?)\s*$"
    )
    domain_labels = {"01": "운동", "02": "스포츠", "03": "표현"}
    standards: dict[str, dict] = {}
    explanations: dict[str, dict] = {}
    source_page = 0
    in_explanations = False
    active_code: str | None = None
    active_lines: list[str] = []
    active_page = 0

    def finish_explanation() -> None:
        nonlocal active_code, active_lines, active_page
        if active_code and active_lines:
            explanations[active_code] = {
                "text": " ".join(active_lines).strip(),
                "source_page": active_page,
            }
        active_code = None
        active_lines = []
        active_page = 0

    for line in document_path.read_text(encoding="utf-8").splitlines():
        page_match = page_pattern.search(line)
        if page_match:
            source_page = int(page_match.group(1))
            continue
        stripped = line.strip()
        if stripped == "###### (가) 성취기준 해설":
            finish_explanation()
            in_explanations = True
            continue
        if in_explanations and (
            stripped.startswith("###### (나)")
            or (stripped.startswith("##### ") and "성취기준 해설" not in stripped)
        ):
            finish_explanation()
            in_explanations = False

        if in_explanations:
            explanation_match = re.match(
                r"^•\s+(\[[46]체0[123]-\d{2}\])\s*(.+)$", stripped
            )
            if explanation_match:
                finish_explanation()
                active_code = explanation_match.group(1)
                active_lines = [f"{active_code}{explanation_match.group(2)}"]
                active_page = source_page
                continue
            if stripped.startswith("• "):
                finish_explanation()
                continue
            if active_code and stripped and not (
                stripped.startswith("<!--")
                or stripped.startswith("## PDF 원본 페이지")
                or stripped.startswith("> 문서 인쇄면")
                or stripped.startswith("2022 개정 교육과정에 따른")
                or stripped.startswith("Ⅰ. 초등학교")
            ):
                active_lines.append(stripped)
            continue

        standard_match = standard_pattern.match(line.strip())
        if not standard_match:
            continue
        code = (
            f"[{standard_match.group('level')}체"
            f"{standard_match.group('domain')}-{standard_match.group('number')}]"
        )
        if code in standards:
            continue
        standards[code] = {
            "code": code,
            "grade_band": "3~4학년군"
            if standard_match.group("level") == "4"
            else "5~6학년군",
            "domain": domain_labels[standard_match.group("domain")],
            "statement": standard_match.group("statement"),
            "source_page": source_page,
            "source_document_id": "체육과_교육과정",
        }
    finish_explanation()
    for code, standard in standards.items():
        explanation = explanations.get(code, {"text": "", "source_page": 0})
        standard["explanation"] = explanation["text"]
        standard["explanation_source_page"] = explanation["source_page"]
    return list(standards.values())


def synchronize_curriculum_standards() -> None:
    document_path = curriculum_document_path()
    if document_path is None:
        return
    standards = extract_curriculum_standards(document_path)
    with connect_db() as db:
        source = db.execute(
            "SELECT document_id FROM sources WHERE document_id = '체육과_교육과정'"
        ).fetchone()
        if source is None:
            source = db.execute(
                """
                SELECT document_id FROM sources
                WHERE document_type = 'curriculum' AND title LIKE '%체육과%'
                LIMIT 1
                """
            ).fetchone()
        if source is None:
            return
        document_id = source["document_id"]
        for standard in standards:
            db.execute(
                """
                INSERT INTO curriculum_standards (
                    code, grade_band, domain, statement, source_page,
                    explanation, explanation_source_page, source_document_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    grade_band = excluded.grade_band,
                    domain = excluded.domain,
                    statement = excluded.statement,
                    source_page = excluded.source_page,
                    explanation = excluded.explanation,
                    explanation_source_page = excluded.explanation_source_page,
                    source_document_id = excluded.source_document_id
                """,
                (
                    standard["code"],
                    standard["grade_band"],
                    standard["domain"],
                    standard["statement"],
                    standard["source_page"],
                    standard["explanation"],
                    standard["explanation_source_page"],
                    document_id,
                ),
            )
        db.commit()


def generated_analysis_payload() -> dict:
    return {
        "title": "초등 체육 3~6학년 교육과정 분석",
        "overview": (
            "2022 개정 체육과 교육과정은 신체활동 역량을 기르기 위해 운동, 스포츠, 표현의 "
            "세 영역을 중심으로 구성된다. 3~4학년군은 기본 움직임과 입문 경험을 넓히고, "
            "5~6학년군은 이를 스포츠 유형별 기능과 전략, 자기 주도적 건강 관리, 창작과 "
            "감상으로 확장하는 계열성을 갖는다."
        ),
        "grade_bands": {
            "3~4학년군": {
                "summary": (
                    "기본 움직임 기술을 탐색하고 시도하면서 운동·스포츠·표현 활동의 의미와 "
                    "기초 방법을 이해하는 입문 단계다."
                ),
                "focus": (
                    "흥미와 성공 경험, 안전한 기본 움직임 습득, 건강한 생활 습관, 상호 존중을 "
                    "중심으로 활동을 구성한다."
                ),
                "assessment": (
                    "단순 수행 결과보다 시도와 변화 과정을 관찰하고 자기평가, 체크리스트, "
                    "수행일지 등 다양한 방법을 함께 활용한다."
                ),
            },
            "5~6학년군": {
                "summary": (
                    "기본 움직임을 실제 운동과 스포츠 상황에 응용하고, 체력 관리와 전략 수행, "
                    "표현 작품 구성으로 확장하는 단계다."
                ),
                "focus": (
                    "개인 수준에 맞는 운동 계획, 스포츠 유형별 기본 기능과 전략, 안전한 참여, "
                    "창작·감상 경험을 균형 있게 구성한다."
                ),
                "assessment": (
                    "계획·실행·성찰 과정과 실제 수행을 함께 평가하며 포트폴리오, 경기 분석, "
                    "동료평가와 자기평가를 활용한다."
                ),
            },
        },
        "domains": {
            "운동": (
                "체력과 건강의 관계를 이해하고 자신의 수준에 맞는 운동을 안전하게 실천하도록 "
                "내용을 계열화한다."
            ),
            "스포츠": (
                "기본 움직임 탐색에서 출발해 기술형·전략형·생태형 스포츠의 기능과 전략을 "
                "실제 활동에 적용하도록 확장한다."
            ),
            "표현": (
                "기본 움직임을 활용한 모방·추상·리듬·도구 표현에서 스포츠·전통 표현의 창작과 "
                "감상으로 발전시킨다."
            ),
        },
        "editorial_implications": [
            "3~4학년은 특정 종목 숙련보다 다양한 기본 움직임의 탐색과 성공 경험을 우선한다.",
            "5~6학년은 3~4학년에서 익힌 움직임을 실제 스포츠 기능과 전략에 연결한다.",
            "모든 영역에서 지식·이해, 과정·기능, 가치·태도를 분리하지 않고 활동 안에서 통합한다.",
            "활동 결과뿐 아니라 계획, 시도, 협력, 성찰의 과정을 평가할 수 있는 장치를 포함한다.",
            "학교 시설과 지역 여건이 달라도 대체 가능한 활동과 안전 지침을 함께 제시한다.",
        ],
    }


def initialize_curriculum_analysis() -> None:
    with connect_db() as db:
        row = db.execute("SELECT id FROM curriculum_analysis WHERE id = 1").fetchone()
        if row is not None:
            return
        payload = generated_analysis_payload()
        now = utc_now()
        encoded = json.dumps(payload, ensure_ascii=False)
        db.execute(
            """
            INSERT INTO curriculum_analysis (id, payload, status, version, updated_at)
            VALUES (1, ?, 'draft', 1, ?)
            """,
            (encoded, now),
        )
        db.execute(
            """
            INSERT INTO curriculum_analysis_versions
                (version, payload, status, change_note, created_at)
            VALUES (1, ?, 'draft', '교육과정 자료를 기반으로 최초 분석 초안 생성', ?)
            """,
            (encoded, now),
        )
        db.commit()


def generated_direction_payload() -> dict:
    return {
        "title": "초등 체육 3~6학년 교과서 개발 방향",
        "purpose": (
            "모든 학생이 움직임의 즐거움을 경험하고, 기본 움직임에서 실제 스포츠 참여와 "
            "자기 주도적 건강 관리로 성장하도록 돕는 교과서를 개발한다."
        ),
        "target_learner": (
            "신체활동 경험과 기능 수준, 학교 시설과 지역 환경이 서로 다른 초등학교 "
            "3~6학년 학생을 대상으로 한다."
        ),
        "selected_option_id": "balanced",
        "options": [
            {
                "id": "balanced",
                "name": "균형 성장형",
                "tagline": "교육과정 충실성과 활동의 즐거움을 고르게",
                "summary": (
                    "운동·스포츠·표현의 균형과 학년 간 계열성을 중심으로, 다양한 학생이 "
                    "성공 경험을 얻도록 설계한다."
                ),
                "priorities": [
                    "세 영역과 지식·기능·태도의 균형",
                    "3~4학년 기본 움직임에서 5~6학년 응용으로 이어지는 계열성",
                    "활동·성찰·평가가 연결되는 단원 구조",
                ],
                "metrics": {
                    "curriculum": 5,
                    "feasibility": 4,
                    "engagement": 4,
                    "novelty": 3,
                    "safety": 4,
                },
                "strength": "검정 기준 대응과 학교 현장 적용 사이의 균형이 안정적이다.",
                "risk": "차별화가 약해 보이지 않도록 단원별 대표 경험을 선명하게 설계해야 한다.",
            },
            {
                "id": "field",
                "name": "안전·현장형",
                "tagline": "어느 학교에서나 안전하게 실행 가능한 수업",
                "summary": (
                    "제한된 공간과 도구, 서로 다른 학생 수준을 고려해 대체 활동과 안전 "
                    "지침을 풍부하게 제공한다."
                ),
                "priorities": [
                    "시설·기구별 대체 활동과 난이도 조절",
                    "수업 전·중·후 안전 확인 체계",
                    "교사가 즉시 활용할 수 있는 명확한 활동 절차",
                ],
                "metrics": {
                    "curriculum": 4,
                    "feasibility": 5,
                    "engagement": 3,
                    "novelty": 2,
                    "safety": 5,
                },
                "strength": "학교 여건 차이와 안전 문제에 강하고 수업 실행 가능성이 높다.",
                "risk": "활동 안내가 지나치게 절차 중심이 되지 않도록 탐색과 선택의 여지를 확보해야 한다.",
            },
            {
                "id": "engaging",
                "name": "흥미·도전형",
                "tagline": "학생의 선택과 도전이 살아 있는 체육 경험",
                "summary": (
                    "게임화, 도전 과제, 학생 선택 활동을 활용해 적극적인 참여와 신체활동의 "
                    "지속적 실천 동기를 강화한다."
                ),
                "priorities": [
                    "선택 가능한 활동과 단계별 도전 과제",
                    "이야기·미션·협력 문제 해결을 활용한 몰입",
                    "디지털 기록과 자기 성장 확인",
                ],
                "metrics": {
                    "curriculum": 4,
                    "feasibility": 3,
                    "engagement": 5,
                    "novelty": 5,
                    "safety": 3,
                },
                "strength": "학생 참여와 출판사만의 차별화된 콘셉트를 선명하게 만들 수 있다.",
                "risk": "흥미 요소가 성취기준과 수업 시간을 압도하지 않도록 근거와 분량을 통제해야 한다.",
            },
        ],
        "common_principles": [
            "모든 활동은 성취기준과 교육과정 해설에 근거를 둔다.",
            "기능 수준과 신체 조건이 다른 학생이 각자 의미 있게 참여할 수 있도록 선택지를 제공한다.",
            "설명보다 실제 움직임 경험을 우선하고 활동 뒤 성찰과 평가를 연결한다.",
            "위험 요소, 공간, 도구, 인원에 따른 안전 지침과 대체 활동을 함께 제시한다.",
            "학년 간 동일 활동의 단순 반복을 피하고 이해·기능·전략의 깊이를 높인다.",
        ],
        "policies": {
            "lesson_experience": (
                "알기–탐색하기–도전하기–되돌아보기의 흐름을 기본으로 하되 단원 성격에 따라 "
                "유연하게 적용한다."
            ),
            "safety_inclusion": (
                "경쟁 결과보다 참여와 성장에 초점을 두고, 장애·성별·체력 수준에 따른 배제 없이 "
                "역할과 난이도를 선택할 수 있게 한다."
            ),
            "assessment": (
                "수행 결과뿐 아니라 계획, 시도, 협력, 변화, 성찰을 함께 평가하며 자기평가와 "
                "동료평가를 적절히 활용한다."
            ),
            "digital": (
                "디지털 자료는 필수 학습을 대체하지 않고 움직임 관찰, 기록, 피드백을 보조하는 "
                "범위에서 사용한다."
            ),
            "language_visual": (
                "학생이 바로 행동으로 옮길 수 있는 짧고 명확한 문장과 단계별 시각자료를 사용하며 "
                "신체 이미지의 다양성을 반영한다."
            ),
        },
        "success_criteria": [
            "49개 성취기준의 학년별 배분 근거를 설명할 수 있다.",
            "각 학년의 단원 구성에서 운동·스포츠·표현 영역의 균형을 확인할 수 있다.",
            "모든 주요 활동에 안전 지침과 여건별 대체 활동이 있다.",
            "3학년에서 6학년까지 움직임과 사고 수준의 발달이 드러난다.",
            "학생용 활동과 평가가 동일한 학습 목표를 향한다.",
        ],
    }


def initialize_development_direction() -> None:
    with connect_db() as db:
        row = db.execute("SELECT id FROM development_direction WHERE id = 1").fetchone()
        if row is not None:
            return
        payload = generated_direction_payload()
        encoded = json.dumps(payload, ensure_ascii=False)
        now = utc_now()
        db.execute(
            """
            INSERT INTO development_direction (id, payload, status, version, updated_at)
            VALUES (1, ?, 'draft', 1, ?)
            """,
            (encoded, now),
        )
        db.execute(
            """
            INSERT INTO development_direction_versions
                (version, payload, status, change_note, created_at)
            VALUES (1, ?, 'draft', '교육과정 분석을 기반으로 최초 개발 방향 3개 안 생성', ?)
            """,
            (encoded, now),
        )
        db.commit()


def generated_grade_allocation_payload() -> dict:
    standards = curriculum_standard_rows()
    project = project_payload()
    target_hours = int(project["default_grade_hours"])
    assignments: list[dict] = []

    for band, grades in (("3~4학년군", (3, 4)), ("5~6학년군", (5, 6))):
        band_standards = [item for item in standards if item["grade_band"] == band]
        grade_items: dict[int, list[dict]] = {grades[0]: [], grades[1]: []}
        for domain in ("운동", "스포츠", "표현"):
            domain_standards = [
                item for item in band_standards if item["domain"] == domain
            ]
            split_at = (len(domain_standards) + 1) // 2
            grade_items[grades[0]].extend(domain_standards[:split_at])
            grade_items[grades[1]].extend(domain_standards[split_at:])

        for grade, items in grade_items.items():
            base_hours, remainder = divmod(target_hours, len(items))
            for index, standard in enumerate(items):
                hours = base_hours + (1 if index < remainder else 0)
                treatment = (
                    "중점"
                    if standard["domain"] == "스포츠"
                    else "기본"
                )
                assignments.append(
                    {
                        "code": standard["code"],
                        "grade": grade,
                        "hours": hours,
                        "treatment": treatment,
                        "sequence": index + 1,
                        "rationale": (
                            f"{band}의 {standard['domain']} 영역 계열성을 고려하여 "
                            f"{grade}학년에 우선 배치한다."
                        ),
                    }
                )

    return {
        "title": "초등 체육 학년별 성취기준·차시 배분",
        "planning_note": (
            "학년군별 성취기준을 발달 단계와 영역 내 순서에 따라 두 학년으로 나누고, "
            "각 학년 102차시를 계획 비중으로 배분한다. 실제 단원에서는 여러 성취기준을 "
            "통합할 수 있으며 이후 단계에서 중복 차시를 조정한다."
        ),
        "target_hours": {"3": target_hours, "4": target_hours, "5": target_hours, "6": target_hours},
        "assignments": assignments,
    }


def initialize_grade_allocation() -> None:
    with connect_db() as db:
        row = db.execute("SELECT id FROM grade_allocation WHERE id = 1").fetchone()
        if row is not None:
            return
        payload = generated_grade_allocation_payload()
        encoded = json.dumps(payload, ensure_ascii=False)
        now = utc_now()
        db.execute(
            """
            INSERT INTO grade_allocation (id, payload, status, version, updated_at)
            VALUES (1, ?, 'draft', 1, ?)
            """,
            (encoded, now),
        )
        db.execute(
            """
            INSERT INTO grade_allocation_versions
                (version, payload, status, change_note, created_at)
            VALUES (
                1, ?, 'draft',
                '교육과정 계열성과 학년별 102차시를 기준으로 최초 배분안 생성', ?
            )
            """,
            (encoded, now),
        )
        db.commit()


def official_activity_candidates() -> list[dict]:
    specs = [
        ("34-fit", "3~4학년군", "운동", "기본 체력운동", 3, 22, [
            ("체력운동 관련 기본 움직임 기술", ["걷기", "달리기", "매달리기", "버티기나 굽히기", "밀기", "당기기"]),
            ("체력운동 기능", ["오래 달리거나 걷기", "팔굽혀펴기", "윗몸말아올리기", "왕복달리기"]),
        ]),
        ("34-health", "3~4학년군", "운동", "건강 운동 및 생활 습관", 4, 22, [
            ("건강 생활 습관", ["자세", "체중 및 체형 관리", "위생", "식습관", "정서 관리 활동"]),
            ("운동 생활 습관", ["맨손체조", "산책", "계단 오르기", "생활 주변 운동기구 활용하기"]),
        ]),
        ("34-basic", "3~4학년군", "스포츠", "기본 움직임의 기초 기술", 3, 22, [
            ("이동 움직임", ["방향 전환 달리기", "뛰기", "구르기", "물에서 이동하기"]),
            ("비이동 움직임", ["균형잡기", "구부리기", "회전하기", "물에 뜨기"]),
            ("조작 움직임", ["던지기", "굴리기", "차기", "잡기", "치기", "튀기기", "몰기", "타기"]),
        ]),
        ("34-sport-types", "3~4학년군", "스포츠", "스포츠 유형별 움직임 기술", 4, 22, [
            ("기술형 스포츠 유형별 움직임", ["앞뒤 구르기", "옆돌기", "전력 달리기", "헤엄치기", "발차기"]),
            ("전략형 스포츠 유형별 움직임", ["공던지기와 잡기", "공몰기", "공차기와 멈추기", "공치기와 받기", "라켓으로 치기"]),
            ("생태형 스포츠 유형별 움직임", ["균형 잡고 이동하기", "타고 버티기", "잡고 오르기"]),
        ]),
        ("34-expression-basic", "3~4학년군", "표현", "기본 움직임의 기초 표현", 3, 23, [
            ("이동 움직임 표현", ["워킹", "점핑", "호핑", "스키핑", "갤러핑", "리핑", "슬라이딩"]),
            ("비이동 움직임 표현", ["펴기", "접기", "비틀기", "제자리 돌기", "털기", "흔들기"]),
            ("조작 움직임 표현", ["들기", "돌리기"]),
        ]),
        ("34-expression-method", "3~4학년군", "표현", "기본 움직임의 표현 방법", 4, 23, [
            ("추상 표현", ["언어 표현", "느낌이나 생각 표현하기"]),
            ("모방 표현", ["사물 표현", "인물 표현", "자연 현상 표현하기"]),
            ("리듬 표현", ["박자", "강약", "빠르기", "패턴에 따라 표현하기"]),
            ("도구 표현", ["줄", "공", "천", "훌라후프 등을 활용하여 표현하기"]),
        ]),
        ("56-fitness", "5~6학년군", "운동", "건강 체력 및 운동 체력", 5, 31, [
            ("건강체력 관련 운동", ["근력", "근지구력", "심폐지구력", "유연성 운동"]),
            ("운동체력 관련 운동", ["순발력", "민첩성", "평형성", "협응성 운동"]),
        ]),
        ("56-growth-safety", "5~6학년군", "운동", "성장 및 안전 활동", 6, 31, [
            ("성장 관련 활동", ["신체 변화 및 제2차 성징 이해 활동", "감정 수용 및 조절 활동", "관계 형성 활동", "성 건강 활동"]),
            ("안전 활동", ["운동 관련 안전사고 예방 및 대처 활동", "생활 안전사고 예방 및 대처 활동", "자연환경 변화 대처 활동"]),
        ]),
        ("56-technical", "5~6학년군", "스포츠", "기술형 스포츠 유형별 활동", 5, 31, [
            ("기록형", ["육상 활동", "경영 활동", "빙상 활동", "표적 활동"]),
            ("동작형", ["매트 활동", "뜀틀 활동", "평균대 활동"]),
            ("투기형", ["태권도 활동", "씨름 활동"]),
        ]),
        ("56-strategy", "5~6학년군", "스포츠", "전략형 스포츠 유형별 활동", 6, 31, [
            ("영역형", ["축구형 게임", "농구형 게임", "핸드볼형 게임", "럭비형 게임", "하키형 게임"]),
            ("필드형", ["야구형 게임"]),
            ("네트형", ["배구형 게임", "배드민턴형 게임", "족구형 게임", "탁구형 게임", "테니스형 게임"]),
        ]),
        ("56-ecological", "5~6학년군", "스포츠", "생태형 스포츠 유형별 활동", 6, 31, [
            ("생활환경형", ["골프형 활동", "플라잉디스크형 활동", "자전거타기형 활동", "인라인스케이팅 활동", "스포츠클라이밍 활동", "민속놀이"]),
            ("자연환경형", ["오리엔티어링", "등산 활동", "캠핑 활동", "수상 활동", "설상 활동", "승마 활동"]),
        ]),
        ("56-sport-expression", "5~6학년군", "표현", "스포츠 표현 활동", 5, 32, [
            ("스포츠 표현", ["창작체조 활동", "음악줄넘기 활동"]),
        ]),
        ("56-traditional-expression", "5~6학년군", "표현", "전통 표현 활동", 5, 32, [
            ("전통 표현", ["우리나라의 민속무용 활동", "외국의 민속무용 활동"]),
        ]),
        ("56-modern-expression", "5~6학년군", "표현", "현대 표현 활동", 6, 32, [
            ("현대 표현", ["라인댄스 활동", "댄스스포츠 활동", "스트리트댄스 활동"]),
        ]),
    ]
    candidates = []
    for candidate_id, band, domain, subdomain, grade, page, groups in specs:
        examples = [item for _, items in groups for item in items]
        high_risk = any(
            keyword in " ".join(examples)
            for keyword in ("수상", "등산", "캠핑", "빙상", "자전거", "인라인", "뜀틀")
        )
        candidates.append(
            {
                "id": candidate_id,
                "grade_band": band,
                "domain": domain,
                "subdomain": subdomain,
                "name": subdomain,
                "examples": examples,
                "activity_groups": [
                    {
                        "official_title": title,
                        "middle_unit_title": title,
                        "small_units": [
                            {
                                "source_activity": item,
                                "draft_title": f"{item}에 도전해요",
                                "selected": True,
                            }
                            for item in items
                        ],
                    }
                    for title, items in groups
                ],
                "source_page": page,
                "source_type": "official",
                "selected_grades": [grade],
                "priority": "핵심",
                "feasibility": 4 if not high_risk else 2,
                "safety_risk": "높음" if high_risk else "보통",
                "facilities": "일반 체육 공간과 기본 교구"
                if not high_risk
                else "전용 시설 또는 안전이 확보된 대체 환경",
                "safety_note": (
                    "공간, 도구, 학생 간 거리를 확인하고 난이도별 대체 활동을 제공한다."
                    if not high_risk
                    else "전문 지도, 보호 장비, 시설 상태를 확인하고 교내 대체 활동을 반드시 함께 제시한다."
                ),
                "rationale": f"{grade}학년 {domain} 대단원의 부제와 중·소단원 구성에 반영한다.",
            }
        )
    return candidates


def generated_content_selection_payload() -> dict:
    return {
        "title": "초등 체육 학년별 내용·종목 선정",
        "selection_note": (
            "공식 신체활동 예시를 기반으로 학년별 발달 단계, 성취기준 배분, 학교 현장성, "
            "안전성과 활동의 다양성을 함께 고려하여 내용과 종목을 선정한다."
        ),
        "candidates": official_activity_candidates(),
    }


def initialize_content_selection() -> None:
    with connect_db() as db:
        row = db.execute(
            "SELECT payload, status, version FROM content_selection WHERE id = 1"
        ).fetchone()
        if row is not None:
            payload = json.loads(row["payload"])
            preferred_grades = {"34-fit": 3, "34-basic": 4, "56-net": 6}
            changed = False
            hierarchy_changed = any(
                "activity_groups" not in candidate
                for candidate in payload.get("candidates", [])
            )
            if hierarchy_changed:
                payload["candidates"] = official_activity_candidates()
                changed = True
            for candidate in payload.get("candidates", []):
                selected_grades = candidate.get("selected_grades", [])
                if len(selected_grades) > 1:
                    preferred = preferred_grades.get(candidate.get("id"))
                    candidate["selected_grades"] = [
                        preferred if preferred in selected_grades else selected_grades[0]
                    ]
                    changed = True
            if changed:
                now = utc_now()
                version = row["version"] + 1
                encoded = json.dumps(payload, ensure_ascii=False)
                db.execute(
                    """
                    UPDATE content_selection
                    SET payload = ?, status = 'draft', version = ?, updated_at = ?,
                        approved_at = NULL
                    WHERE id = 1
                    """,
                    (encoded, version, now),
                )
                db.execute(
                    """
                    INSERT INTO content_selection_versions
                    (version, payload, status, change_note, created_at)
                    VALUES (?, ?, 'draft', ?, ?)
                    """,
                    (
                        version,
                        encoded,
                        (
                            "공식 신체활동 예시를 대·중·소단원 기초 계층으로 전환"
                            if hierarchy_changed
                            else "공통 선정을 제거하고 후보별 단일 학년 배정으로 전환"
                        ),
                        now,
                    ),
                )
                db.commit()
            return
        payload = generated_content_selection_payload()
        encoded = json.dumps(payload, ensure_ascii=False)
        now = utc_now()
        db.execute(
            """
            INSERT INTO content_selection (id, payload, status, version, updated_at)
            VALUES (1, ?, 'draft', 1, ?)
            """,
            (encoded, now),
        )
        db.execute(
            """
            INSERT INTO content_selection_versions
                (version, payload, status, change_note, created_at)
            VALUES (
                1, ?, 'draft',
                '공식 신체활동 예시와 학년별 성취기준 배분을 기준으로 최초 후보안 생성', ?
            )
            """,
            (encoded, now),
        )
        db.commit()


def project_payload() -> dict:
    with connect_db() as db:
        row = db.execute("SELECT payload, updated_at FROM project WHERE id = 1").fetchone()
    payload = json.loads(row["payload"])
    payload["updated_at"] = row["updated_at"]
    return payload


def source_rows() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT * FROM sources
            ORDER BY
                CASE document_type
                    WHEN 'curriculum' THEN 1
                    WHEN 'editorial_criteria' THEN 2
                    WHEN 'development_guide' THEN 3
                    ELSE 4
                END,
                title
            """
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        item["document_type_label"] = DOCUMENT_TYPE_LABELS.get(
            item["document_type"], "공식 참고자료"
        )
        item["source_name"] = Path(item["source_file"]).name
        result.append(item)
    return result


def recent_audit_rows() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT 20"
        ).fetchall()
    return [dict(row) for row in rows]


def readiness(sources: list[dict]) -> dict:
    total = len(sources)
    integrity_verified = sum(s["integrity_status"] == "verified" for s in sources)
    approved = sum(s["review_status"] == "approved" for s in sources)
    rejected = sum(s["review_status"] == "rejected" for s in sources)
    is_ready = total > 0 and integrity_verified == total and approved == total
    return {
        "total": total,
        "integrity_verified": integrity_verified,
        "approved": approved,
        "rejected": rejected,
        "is_ready": is_ready,
        "next_stage": "교육과정 분석" if is_ready else "공식 자료 관리자 검수",
    }


def curriculum_standard_rows() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT code, grade_band, domain, statement, source_page,
                   explanation, explanation_source_page, source_document_id
            FROM curriculum_standards
            ORDER BY
                CASE grade_band WHEN '3~4학년군' THEN 1 ELSE 2 END,
                code
            """
        ).fetchall()
    return [dict(row) for row in rows]


def analysis_record() -> dict:
    with connect_db() as db:
        row = db.execute(
            """
            SELECT payload, status, version, updated_at, approved_at
            FROM curriculum_analysis WHERE id = 1
            """
        ).fetchone()
    result = json.loads(row["payload"])
    result.update(
        {
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "approved_at": row["approved_at"],
        }
    )
    return result


def analysis_versions() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, version, status, change_note, created_at
            FROM curriculum_analysis_versions
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()
    return [dict(row) for row in rows]


def analysis_statistics(standards: list[dict]) -> dict:
    bands: dict[str, int] = {"3~4학년군": 0, "5~6학년군": 0}
    domains: dict[str, int] = {"운동": 0, "스포츠": 0, "표현": 0}
    for standard in standards:
        bands[standard["grade_band"]] = bands.get(standard["grade_band"], 0) + 1
        domains[standard["domain"]] = domains.get(standard["domain"], 0) + 1
    return {"total": len(standards), "grade_bands": bands, "domains": domains}


def analysis_bootstrap_payload() -> dict:
    standards = curriculum_standard_rows()
    sources = source_rows()
    return {
        "analysis": analysis_record(),
        "standards": standards,
        "statistics": analysis_statistics(standards),
        "versions": analysis_versions(),
        "source_readiness": readiness(sources),
    }


def validate_analysis_payload(payload: dict) -> dict:
    title = payload.get("title")
    overview = payload.get("overview")
    grade_bands = payload.get("grade_bands")
    domains = payload.get("domains")
    implications = payload.get("editorial_implications")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("분석 제목이 필요합니다.")
    if not isinstance(overview, str) or not overview.strip():
        raise ValueError("교육과정 총괄 분석이 필요합니다.")
    if not isinstance(grade_bands, dict) or set(grade_bands) != {"3~4학년군", "5~6학년군"}:
        raise ValueError("두 학년군 분석이 모두 필요합니다.")
    for band, content in grade_bands.items():
        if not isinstance(content, dict):
            raise ValueError(f"{band} 분석 형식이 올바르지 않습니다.")
        for field in ("summary", "focus", "assessment"):
            if not isinstance(content.get(field), str) or not content[field].strip():
                raise ValueError(f"{band}의 {field} 분석이 필요합니다.")
    if not isinstance(domains, dict) or set(domains) != {"운동", "스포츠", "표현"}:
        raise ValueError("운동·스포츠·표현 영역 분석이 모두 필요합니다.")
    if any(not isinstance(value, str) or not value.strip() for value in domains.values()):
        raise ValueError("영역별 분석 내용을 입력해 주세요.")
    if (
        not isinstance(implications, list)
        or not implications
        or any(not isinstance(item, str) or not item.strip() for item in implications)
    ):
        raise ValueError("집필 시사점을 한 개 이상 입력해 주세요.")
    if len(implications) > 20:
        raise ValueError("집필 시사점은 20개까지 저장할 수 있습니다.")
    return {
        "title": title.strip(),
        "overview": overview.strip(),
        "grade_bands": {
            band: {field: content[field].strip() for field in ("summary", "focus", "assessment")}
            for band, content in grade_bands.items()
        },
        "domains": {domain: value.strip() for domain, value in domains.items()},
        "editorial_implications": [item.strip() for item in implications],
    }


def store_analysis(payload: dict, change_note: str, status: str = "draft") -> dict:
    clean = validate_analysis_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM curriculum_analysis WHERE id = 1"
        ).fetchone()
        next_version = int(current["version"]) + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        db.execute(
            """
            UPDATE curriculum_analysis
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1
            """,
            (encoded, status, next_version, now, approved_at),
        )
        db.execute(
            """
            INSERT INTO curriculum_analysis_versions
                (version, payload, status, change_note, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (next_version, encoded, status, change_note, now),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('curriculum_analysis', '1', ?, ?, ?)
            """,
            (
                "approved" if status == "approved" else "updated",
                json.dumps(
                    {"version": next_version, "change_note": change_note},
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()
    return analysis_record()


def update_analysis(payload: dict) -> dict:
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_analysis(payload, change_note.strip() or "웹 편집 내용 저장")


def regenerate_analysis() -> dict:
    return store_analysis(
        generated_analysis_payload(),
        "공식 교육과정 자료를 기반으로 AI 분석 초안 재생성",
    )


def approve_analysis() -> dict:
    source_state = readiness(source_rows())
    if not source_state["is_ready"]:
        raise ValueError("공식 자료가 모두 승인된 뒤 교육과정 분석을 확정할 수 있습니다.")
    current = analysis_record()
    payload = {
        key: current[key]
        for key in (
            "title",
            "overview",
            "grade_bands",
            "domains",
            "editorial_implications",
        )
    }
    return store_analysis(payload, "편집팀 교육과정 분석 승인", status="approved")


def direction_record() -> dict:
    with connect_db() as db:
        row = db.execute(
            """
            SELECT payload, status, version, updated_at, approved_at
            FROM development_direction WHERE id = 1
            """
        ).fetchone()
    result = json.loads(row["payload"])
    result.update(
        {
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "approved_at": row["approved_at"],
        }
    )
    return result


def direction_versions() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, version, status, change_note, created_at
            FROM development_direction_versions
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()
    return [dict(row) for row in rows]


def direction_bootstrap_payload() -> dict:
    analysis = analysis_record()
    return {
        "direction": direction_record(),
        "versions": direction_versions(),
        "prerequisite": {
            "analysis_status": analysis["status"],
            "analysis_version": analysis["version"],
            "analysis_title": analysis["title"],
            "is_ready": analysis["status"] == "approved",
        },
        "project": project_payload(),
    }


def clean_string_list(value: object, label: str, maximum: int = 20) -> list[str]:
    if (
        not isinstance(value, list)
        or not value
        or len(value) > maximum
        or any(not isinstance(item, str) or not item.strip() for item in value)
    ):
        raise ValueError(f"{label}은(는) 1~{maximum}개의 문장으로 입력해 주세요.")
    return [item.strip() for item in value]


def validate_direction_payload(payload: dict) -> dict:
    for field, label in (
        ("title", "개발 방향 제목"),
        ("purpose", "개발 목적"),
        ("target_learner", "대상 학습자"),
    ):
        if not isinstance(payload.get(field), str) or not payload[field].strip():
            raise ValueError(f"{label}이(가) 필요합니다.")

    options = payload.get("options")
    expected_ids = {"balanced", "field", "engaging"}
    if (
        not isinstance(options, list)
        or len(options) != 3
        or {option.get("id") for option in options if isinstance(option, dict)} != expected_ids
    ):
        raise ValueError("균형 성장형·안전 현장형·흥미 도전형의 세 가지 안이 필요합니다.")

    clean_options = []
    metric_keys = {"curriculum", "feasibility", "engagement", "novelty", "safety"}
    for option in options:
        clean_option = {"id": option["id"]}
        for field in ("name", "tagline", "summary", "strength", "risk"):
            value = option.get(field)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{option['id']} 안의 {field} 내용이 필요합니다.")
            clean_option[field] = value.strip()
        clean_option["priorities"] = clean_string_list(
            option.get("priorities"), f"{option['name']} 우선순위", 8
        )
        metrics = option.get("metrics")
        if not isinstance(metrics, dict) or set(metrics) != metric_keys:
            raise ValueError(f"{option['name']} 비교 지표가 올바르지 않습니다.")
        if any(not isinstance(value, int) or not 1 <= value <= 5 for value in metrics.values()):
            raise ValueError("비교 지표 점수는 1~5의 정수여야 합니다.")
        clean_option["metrics"] = {key: metrics[key] for key in metric_keys}
        clean_options.append(clean_option)

    selected = payload.get("selected_option_id")
    if selected not in expected_ids:
        raise ValueError("세 가지 개발 방향 중 하나를 선택해 주세요.")

    policies = payload.get("policies")
    policy_keys = {
        "lesson_experience",
        "safety_inclusion",
        "assessment",
        "digital",
        "language_visual",
    }
    if not isinstance(policies, dict) or set(policies) != policy_keys:
        raise ValueError("다섯 가지 공통 집필 정책이 모두 필요합니다.")
    if any(not isinstance(value, str) or not value.strip() for value in policies.values()):
        raise ValueError("공통 집필 정책의 빈 내용을 채워 주세요.")

    return {
        "title": payload["title"].strip(),
        "purpose": payload["purpose"].strip(),
        "target_learner": payload["target_learner"].strip(),
        "selected_option_id": selected,
        "options": clean_options,
        "common_principles": clean_string_list(
            payload.get("common_principles"), "공통 개발 원칙"
        ),
        "policies": {key: policies[key].strip() for key in policy_keys},
        "success_criteria": clean_string_list(
            payload.get("success_criteria"), "성공 기준"
        ),
    }


def store_direction(payload: dict, change_note: str, status: str = "draft") -> dict:
    clean = validate_direction_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM development_direction WHERE id = 1"
        ).fetchone()
        next_version = int(current["version"]) + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        db.execute(
            """
            UPDATE development_direction
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1
            """,
            (encoded, status, next_version, now, approved_at),
        )
        db.execute(
            """
            INSERT INTO development_direction_versions
                (version, payload, status, change_note, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (next_version, encoded, status, change_note, now),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('development_direction', '1', ?, ?, ?)
            """,
            (
                "approved" if status == "approved" else "updated",
                json.dumps(
                    {"version": next_version, "change_note": change_note},
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()
    return direction_record()


def update_direction(payload: dict) -> dict:
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_direction(payload, change_note.strip() or "웹 편집 내용 저장")


def regenerate_direction() -> dict:
    return store_direction(
        generated_direction_payload(),
        "승인된 교육과정 분석을 기준으로 AI 개발 방향 3개 안 재생성",
    )


def approve_direction() -> dict:
    analysis = analysis_record()
    if analysis["status"] != "approved":
        raise ValueError("2단계 교육과정 분석을 먼저 승인해야 개발 방향을 확정할 수 있습니다.")
    current = direction_record()
    payload = {
        key: current[key]
        for key in (
            "title",
            "purpose",
            "target_learner",
            "selected_option_id",
            "options",
            "common_principles",
            "policies",
            "success_criteria",
        )
    }
    return store_direction(payload, "편집팀 교과서 개발 방향 승인", status="approved")


def allocation_record() -> dict:
    with connect_db() as db:
        row = db.execute(
            """
            SELECT payload, status, version, updated_at, approved_at
            FROM grade_allocation WHERE id = 1
            """
        ).fetchone()
    result = json.loads(row["payload"])
    result.update(
        {
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "approved_at": row["approved_at"],
        }
    )
    return result


def allocation_versions() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, version, status, change_note, created_at
            FROM grade_allocation_versions
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()
    return [dict(row) for row in rows]


def allocation_summary(payload: dict) -> dict:
    grades = {
        str(grade): {
            "target": int(payload["target_hours"][str(grade)]),
            "allocated": 0,
            "standard_count": 0,
            "domains": {"운동": 0, "스포츠": 0, "표현": 0},
        }
        for grade in (3, 4, 5, 6)
    }
    standards = {item["code"]: item for item in curriculum_standard_rows()}
    zero_hour_codes = []
    for assignment in payload["assignments"]:
        grade = str(assignment["grade"])
        standard = standards[assignment["code"]]
        grades[grade]["allocated"] += assignment["hours"]
        grades[grade]["standard_count"] += 1
        grades[grade]["domains"][standard["domain"]] += assignment["hours"]
        if assignment["hours"] == 0:
            zero_hour_codes.append(assignment["code"])
    for grade in grades.values():
        grade["difference"] = grade["allocated"] - grade["target"]
        grade["is_balanced"] = grade["difference"] == 0
    return {
        "grades": grades,
        "total_allocated": sum(item["allocated"] for item in grades.values()),
        "all_balanced": all(item["is_balanced"] for item in grades.values()),
        "zero_hour_codes": zero_hour_codes,
    }


def allocation_bootstrap_payload() -> dict:
    direction = direction_record()
    selected = next(
        option
        for option in direction["options"]
        if option["id"] == direction["selected_option_id"]
    )
    payload = allocation_record()
    return {
        "allocation": payload,
        "summary": allocation_summary(payload),
        "standards": curriculum_standard_rows(),
        "versions": allocation_versions(),
        "prerequisite": {
            "direction_status": direction["status"],
            "direction_version": direction["version"],
            "direction_name": selected["name"],
            "is_ready": direction["status"] == "approved",
        },
    }


def validate_allocation_payload(payload: dict) -> dict:
    title = payload.get("title")
    planning_note = payload.get("planning_note")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("배분안 제목이 필요합니다.")
    if not isinstance(planning_note, str) or not planning_note.strip():
        raise ValueError("배분 원칙 설명이 필요합니다.")

    targets = payload.get("target_hours")
    if not isinstance(targets, dict) or set(targets) != {"3", "4", "5", "6"}:
        raise ValueError("3~6학년의 목표 차시가 모두 필요합니다.")
    if any(not isinstance(value, int) or value <= 0 for value in targets.values()):
        raise ValueError("학년별 목표 차시는 1 이상의 정수여야 합니다.")

    assignments = payload.get("assignments")
    standards = {item["code"]: item for item in curriculum_standard_rows()}
    if not isinstance(assignments, list) or len(assignments) != len(standards):
        raise ValueError(f"성취기준 {len(standards)}개가 모두 배분되어야 합니다.")
    assignment_codes = [
        item.get("code") for item in assignments if isinstance(item, dict)
    ]
    if len(set(assignment_codes)) != len(standards) or set(assignment_codes) != set(standards):
        raise ValueError("성취기준이 누락되거나 중복 배분되었습니다.")

    clean_assignments = []
    treatments = {"기본", "중점", "연계"}
    for assignment in assignments:
        code = assignment["code"]
        grade = assignment.get("grade")
        valid_grades = {3, 4} if standards[code]["grade_band"] == "3~4학년군" else {5, 6}
        if grade not in valid_grades:
            raise ValueError(f"{code}는 {standards[code]['grade_band']} 안에서 배분해야 합니다.")
        hours = assignment.get("hours")
        if not isinstance(hours, int) or hours < 0 or hours > 40:
            raise ValueError(f"{code} 차시는 0~40 범위의 정수여야 합니다.")
        treatment = assignment.get("treatment")
        if treatment not in treatments:
            raise ValueError(f"{code}의 집중도 값이 올바르지 않습니다.")
        sequence = assignment.get("sequence")
        if not isinstance(sequence, int) or sequence <= 0:
            raise ValueError(f"{code}의 학습 순서는 1 이상의 정수여야 합니다.")
        rationale = assignment.get("rationale")
        if not isinstance(rationale, str) or not rationale.strip():
            raise ValueError(f"{code}의 배치 근거가 필요합니다.")
        clean_assignments.append(
            {
                "code": code,
                "grade": grade,
                "hours": hours,
                "treatment": treatment,
                "sequence": sequence,
                "rationale": rationale.strip(),
            }
        )

    return {
        "title": title.strip(),
        "planning_note": planning_note.strip(),
        "target_hours": {key: targets[key] for key in ("3", "4", "5", "6")},
        "assignments": clean_assignments,
    }


def store_allocation(payload: dict, change_note: str, status: str = "draft") -> dict:
    clean = validate_allocation_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute("SELECT version FROM grade_allocation WHERE id = 1").fetchone()
        next_version = int(current["version"]) + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        db.execute(
            """
            UPDATE grade_allocation
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1
            """,
            (encoded, status, next_version, now, approved_at),
        )
        db.execute(
            """
            INSERT INTO grade_allocation_versions
                (version, payload, status, change_note, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (next_version, encoded, status, change_note, now),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('grade_allocation', '1', ?, ?, ?)
            """,
            (
                "approved" if status == "approved" else "updated",
                json.dumps(
                    {
                        "version": next_version,
                        "change_note": change_note,
                        "summary": allocation_summary(clean),
                    },
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()
    return allocation_record()


def update_allocation(payload: dict) -> dict:
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_allocation(payload, change_note.strip() or "웹 편집 내용 저장")


def regenerate_allocation() -> dict:
    return store_allocation(
        generated_grade_allocation_payload(),
        "교육과정 계열성과 선택한 개발 방향을 기준으로 AI 배분안 재생성",
    )


def approve_allocation() -> dict:
    direction = direction_record()
    if direction["status"] != "approved":
        raise ValueError("3단계 교과서 개발 방향을 먼저 승인해야 배분안을 확정할 수 있습니다.")
    current = allocation_record()
    summary = allocation_summary(current)
    if not summary["all_balanced"]:
        raise ValueError("각 학년의 배분 차시가 목표 차시와 정확히 일치해야 합니다.")
    if summary["zero_hour_codes"]:
        raise ValueError("0차시로 배분된 성취기준이 있어 확정할 수 없습니다.")
    payload = {
        key: current[key]
        for key in ("title", "planning_note", "target_hours", "assignments")
    }
    return store_allocation(payload, "편집팀 학년별 성취기준·차시 배분 승인", status="approved")


def content_record() -> dict:
    with connect_db() as db:
        row = db.execute(
            """
            SELECT payload, status, version, updated_at, approved_at
            FROM content_selection WHERE id = 1
            """
        ).fetchone()
    result = json.loads(row["payload"])
    result.update(
        {
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "approved_at": row["approved_at"],
        }
    )
    return result


def content_versions() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, version, status, change_note, created_at
            FROM content_selection_versions
            ORDER BY id DESC
            LIMIT 20
            """
        ).fetchall()
    return [dict(row) for row in rows]


def content_summary(payload: dict) -> dict:
    allocation = allocation_record()
    standards = {item["code"]: item for item in curriculum_standard_rows()}
    assigned_by_grade_domain: dict[tuple[int, str], set[str]] = {}
    for assignment in allocation["assignments"]:
        domain = standards[assignment["code"]]["domain"]
        assigned_by_grade_domain.setdefault((assignment["grade"], domain), set()).add(
            assignment["code"]
        )

    grades = {
        str(grade): {
            "selected_count": 0,
            "domains": {"운동": 0, "스포츠": 0, "표현": 0},
            "high_risk_count": 0,
            "covered_codes": set(),
        }
        for grade in (3, 4, 5, 6)
    }
    for candidate in payload["candidates"]:
        for grade in candidate["selected_grades"]:
            grade_summary = grades[str(grade)]
            grade_summary["selected_count"] += 1
            grade_summary["domains"][candidate["domain"]] += 1
            if candidate["safety_risk"] == "높음":
                grade_summary["high_risk_count"] += 1
            grade_summary["covered_codes"].update(
                assigned_by_grade_domain.get((grade, candidate["domain"]), set())
            )

    all_assigned = {
        assignment["code"] for assignment in allocation["assignments"]
    }
    all_covered: set[str] = set()
    for grade_summary in grades.values():
        grade_summary["covered_count"] = len(grade_summary["covered_codes"])
        all_covered.update(grade_summary["covered_codes"])
        grade_summary["covered_codes"] = sorted(grade_summary["covered_codes"])
        grade_summary["all_domains_selected"] = all(
            count > 0 for count in grade_summary["domains"].values()
        )

    return {
        "grades": grades,
        "selected_candidate_count": sum(
            bool(candidate["selected_grades"]) for candidate in payload["candidates"]
        ),
        "total_candidate_count": len(payload["candidates"]),
        "covered_standard_count": len(all_covered),
        "uncovered_codes": sorted(all_assigned - all_covered),
        "all_domains_selected": all(
            grade["all_domains_selected"] for grade in grades.values()
        ),
    }


def content_bootstrap_payload() -> dict:
    allocation = allocation_record()
    payload = content_record()
    return {
        "content": payload,
        "summary": content_summary(payload),
        "standards": curriculum_standard_rows(),
        "allocation_assignments": allocation["assignments"],
        "versions": content_versions(),
        "prerequisite": {
            "allocation_status": allocation["status"],
            "allocation_version": allocation["version"],
            "is_ready": allocation["status"] == "approved",
        },
    }


def validate_content_payload(payload: dict) -> dict:
    title = payload.get("title")
    note = payload.get("selection_note")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("내용·종목 선정안 제목이 필요합니다.")
    if not isinstance(note, str) or not note.strip():
        raise ValueError("선정 원칙 설명이 필요합니다.")

    candidates = payload.get("candidates")
    if not isinstance(candidates, list) or not candidates or len(candidates) > 100:
        raise ValueError("내용·종목 후보는 1~100개가 필요합니다.")
    ids = [
        candidate.get("id") for candidate in candidates if isinstance(candidate, dict)
    ]
    if len(ids) != len(candidates) or len(set(ids)) != len(ids):
        raise ValueError("후보 ID가 누락되거나 중복되었습니다.")

    clean_candidates = []
    for candidate in candidates:
        band = candidate.get("grade_band")
        valid_grades = {3, 4} if band == "3~4학년군" else {5, 6} if band == "5~6학년군" else set()
        selected_grades = candidate.get("selected_grades")
        if (
            not isinstance(selected_grades, list)
            or len(set(selected_grades)) != len(selected_grades)
            or len(selected_grades) > 1
            or not set(selected_grades).issubset(valid_grades)
        ):
            raise ValueError(
                f"{candidate.get('name', '후보')}은 한 학년에만 선정할 수 있습니다."
            )
        domain = candidate.get("domain")
        if domain not in {"운동", "스포츠", "표현"}:
            raise ValueError("후보 영역은 운동·스포츠·표현 중 하나여야 합니다.")
        examples = candidate.get("examples")
        if (
            not isinstance(examples, list)
            or not examples
            or any(not isinstance(item, str) or not item.strip() for item in examples)
        ):
            raise ValueError(f"{candidate.get('name', '후보')}의 활동 예시가 필요합니다.")
        for field in ("id", "subdomain", "name", "facilities", "safety_note", "rationale"):
            if not isinstance(candidate.get(field), str) or not candidate[field].strip():
                raise ValueError(f"후보의 {field} 값이 필요합니다.")
        if candidate.get("priority") not in {"핵심", "선택", "대체"}:
            raise ValueError("후보 우선순위 값이 올바르지 않습니다.")
        feasibility = candidate.get("feasibility")
        if not isinstance(feasibility, int) or not 1 <= feasibility <= 5:
            raise ValueError("현장 실행 가능성은 1~5의 정수여야 합니다.")
        if candidate.get("safety_risk") not in {"낮음", "보통", "높음"}:
            raise ValueError("안전 위험도 값이 올바르지 않습니다.")
        source_type = candidate.get("source_type")
        if source_type not in {"official", "custom"}:
            raise ValueError("후보 출처 유형이 올바르지 않습니다.")
        source_page = candidate.get("source_page")
        if not isinstance(source_page, int) or source_page < 0:
            raise ValueError("후보 출처 쪽수가 올바르지 않습니다.")
        activity_groups = candidate.get("activity_groups")
        if not isinstance(activity_groups, list) or not activity_groups:
            raise ValueError(f"{candidate.get('name', '후보')}의 중단원 기초 항목이 필요합니다.")
        clean_groups = []
        for group in activity_groups:
            if (
                not isinstance(group, dict)
                or not isinstance(group.get("official_title"), str)
                or not group["official_title"].strip()
                or not isinstance(group.get("middle_unit_title"), str)
                or not group["middle_unit_title"].strip()
            ):
                raise ValueError("중단원 기초 항목과 중단원명이 필요합니다.")
            small_units = group.get("small_units")
            if not isinstance(small_units, list) or not small_units:
                raise ValueError("중단원마다 소단원 소재가 필요합니다.")
            clean_small_units = []
            for small in small_units:
                if (
                    not isinstance(small, dict)
                    or not isinstance(small.get("source_activity"), str)
                    or not small["source_activity"].strip()
                    or not isinstance(small.get("draft_title"), str)
                    or not small["draft_title"].strip()
                    or not isinstance(small.get("selected"), bool)
                ):
                    raise ValueError("소단원 소재와 새 소단원명이 필요합니다.")
                clean_small_units.append(
                    {
                        "source_activity": small["source_activity"].strip(),
                        "draft_title": small["draft_title"].strip(),
                        "selected": small["selected"],
                    }
                )
            clean_groups.append(
                {
                    "official_title": group["official_title"].strip(),
                    "middle_unit_title": group["middle_unit_title"].strip(),
                    "small_units": clean_small_units,
                }
            )
        clean_candidates.append(
            {
                "id": candidate["id"].strip(),
                "grade_band": band,
                "domain": domain,
                "subdomain": candidate["subdomain"].strip(),
                "name": candidate["name"].strip(),
                "examples": [item.strip() for item in examples],
                "activity_groups": clean_groups,
                "source_page": source_page,
                "source_type": source_type,
                "selected_grades": sorted(selected_grades),
                "priority": candidate["priority"],
                "feasibility": feasibility,
                "safety_risk": candidate["safety_risk"],
                "facilities": candidate["facilities"].strip(),
                "safety_note": candidate["safety_note"].strip(),
                "rationale": candidate["rationale"].strip(),
            }
        )
    return {
        "title": title.strip(),
        "selection_note": note.strip(),
        "candidates": clean_candidates,
    }


def store_content(payload: dict, change_note: str, status: str = "draft") -> dict:
    clean = validate_content_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM content_selection WHERE id = 1"
        ).fetchone()
        next_version = int(current["version"]) + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        db.execute(
            """
            UPDATE content_selection
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1
            """,
            (encoded, status, next_version, now, approved_at),
        )
        db.execute(
            """
            INSERT INTO content_selection_versions
                (version, payload, status, change_note, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (next_version, encoded, status, change_note, now),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('content_selection', '1', ?, ?, ?)
            """,
            (
                "approved" if status == "approved" else "updated",
                json.dumps(
                    {
                        "version": next_version,
                        "change_note": change_note,
                        "summary": content_summary(clean),
                    },
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()
    return content_record()


def update_content(payload: dict) -> dict:
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_content(payload, change_note.strip() or "웹 편집 내용 저장")


def regenerate_content() -> dict:
    return store_content(
        generated_content_selection_payload(),
        "공식 신체활동 예시와 성취기준 배분을 기준으로 AI 후보안 재생성",
    )


def approve_content() -> dict:
    allocation = allocation_record()
    if allocation["status"] != "approved":
        raise ValueError("4단계 성취기준·차시 배분안을 먼저 승인해야 내용·종목을 확정할 수 있습니다.")
    current = content_record()
    summary = content_summary(current)
    if summary["uncovered_codes"]:
        raise ValueError("선택한 내용과 연결되지 않은 성취기준이 있습니다.")
    if not summary["all_domains_selected"]:
        raise ValueError("각 학년에 운동·스포츠·표현 내용이 모두 포함되어야 합니다.")
    payload = {
        key: current[key] for key in ("title", "selection_note", "candidates")
    }
    return store_content(payload, "편집팀 학년별 내용·종목 선정 승인", status="approved")


WORKFLOW_STAGE_ORDER = ("outline", "design", "manuscript", "review")
WORKFLOW_STAGE_LABELS = {
    "outline": "목차·쪽수·차시 설계",
    "design": "단원 설계",
    "manuscript": "원고 초안",
    "review": "자동 검증·모의심사",
}


def allocate_integer(total: int, weights: list[int]) -> list[int]:
    if not weights:
        return []
    safe = [max(1, int(weight)) for weight in weights]
    weight_sum = sum(safe)
    raw = [total * weight / weight_sum for weight in safe]
    values = [int(value) for value in raw]
    for index in sorted(
        range(len(values)), key=lambda item: raw[item] - values[item], reverse=True
    )[: total - sum(values)]:
        values[index] += 1
    return values


def generated_outline_payload() -> dict:
    content = content_record()
    project = project_payload()
    domain_numbers = {"운동": 1, "스포츠": 2, "표현": 3}
    grades: dict[str, dict] = {}
    for grade in (3, 4, 5, 6):
        selected = [
            candidate
            for candidate in content["candidates"]
            if grade in candidate["selected_grades"]
        ]
        selected.sort(key=lambda item: (domain_numbers[item["domain"]], item["subdomain"]))
        weights = [
            sum(
                small["selected"]
                for group in candidate["activity_groups"]
                for small in group["small_units"]
            )
            or 1
            for candidate in selected
        ]
        hours = allocate_integer(project["default_grade_hours"], weights)
        pages = allocate_integer(project["page_baseline"], weights)
        units = []
        for index, candidate in enumerate(selected):
            units.append(
                {
                    "id": f"{grade}-{candidate['id']}",
                    "domain": candidate["domain"],
                    "large_unit_title": f"{domain_numbers[candidate['domain']]}. {candidate['domain']}",
                    "subtitle": candidate["subdomain"],
                    "hours": hours[index],
                    "pages": pages[index],
                    "middle_units": [
                        {
                            "title": group["middle_unit_title"],
                            "small_units": [
                                {
                                    "title": small["draft_title"],
                                    "source_activity": small["source_activity"],
                                }
                                for small in group["small_units"]
                                if small["selected"]
                            ],
                        }
                        for group in candidate["activity_groups"]
                    ],
                }
            )
        grades[str(grade)] = {
            "grade": grade,
            "target_hours": project["default_grade_hours"],
            "target_pages": project["page_baseline"],
            "units": units,
        }
    return {
        "title": "학년별 목차·쪽수·차시 통합 설계",
        "planning_note": "목차를 수정하면 같은 화면에서 쪽수와 차시 합계를 함께 조정한다.",
        "source_content_version": content["version"],
        "grades": grades,
    }


def generated_design_payload() -> dict:
    outline = workflow_stage_record("outline")
    units = []
    for grade_data in outline["grades"].values():
        for unit in grade_data["units"]:
            units.append(
                {
                    "id": unit["id"],
                    "grade": grade_data["grade"],
                    "domain": unit["domain"],
                    "large_unit_title": unit["large_unit_title"],
                    "subtitle": unit["subtitle"],
                    "hours": unit["hours"],
                    "pages": unit["pages"],
                    "essential_question": f"{unit['subtitle']}을 생활 속에서 어떻게 실천할 수 있을까요?",
                    "learning_goal": f"{unit['subtitle']}의 의미와 기능을 이해하고 안전하게 수행한다.",
                    "lesson_flow": "도입과 탐색 → 기능 익히기 → 적용과 도전 → 성찰과 평가",
                    "assessment": "관찰 평가, 자기 평가, 수행 과제를 성취기준과 연결한다.",
                    "materials": "학교 보유 시설과 기본 교구를 우선 활용한다.",
                    "safety": "활동 전 공간·도구·학생 간 거리를 확인하고 난이도별 대체 활동을 제공한다.",
                    "inclusion": "신체 조건과 기능 수준에 따라 규칙·거리·도구를 조정한다.",
                    "middle_units": json.loads(json.dumps(unit["middle_units"], ensure_ascii=False)),
                }
            )
    return {
        "title": "학년별 단원 설계",
        "design_note": "목차의 모든 단원에 목표·수업 흐름·평가·안전·포용 설계를 연결한다.",
        "source_outline_version": outline["version"],
        "units": units,
    }


def generated_manuscript_payload() -> dict:
    design = workflow_stage_record("design")
    chapters = []
    for unit in design["units"]:
        sections = []
        for middle in unit["middle_units"]:
            activities = [
                {
                    "title": small["title"],
                    "source_activity": small["source_activity"],
                    "instruction": (
                        f"{small['source_activity']}의 핵심 동작을 탐색하고, 자신의 수준에 맞게 "
                        "연습한 뒤 친구와 결과를 나눠 봅시다."
                    ),
                }
                for small in middle["small_units"]
            ]
            sections.append(
                {
                    "title": middle["title"],
                    "body": (
                        f"{middle['title']}의 원리와 방법을 알아보고 안전하게 활동한다. "
                        "학생이 스스로 난이도를 선택하고 활동 결과를 성찰하도록 구성한다."
                    ),
                    "activities": activities,
                }
            )
        chapters.append(
            {
                "id": unit["id"],
                "grade": unit["grade"],
                "domain": unit["domain"],
                "large_unit_title": unit["large_unit_title"],
                "subtitle": unit["subtitle"],
                "opening": (
                    f"{unit['essential_question']}라는 질문에서 출발해 "
                    f"{unit['learning_goal']}"
                ),
                "sections": sections,
                "assessment_box": unit["assessment"],
                "safety_box": unit["safety"],
            }
        )
    return {
        "title": "교과서 원고 초안",
        "editorial_note": "AI 초안을 편집팀이 수정하며, 공식 근거와 단원 설계의 연결을 유지한다.",
        "source_design_version": design["version"],
        "chapters": chapters,
    }


def build_review_payload() -> dict:
    outline = workflow_stage_record("outline")
    design = workflow_stage_record("design")
    manuscript = workflow_stage_record("manuscript")
    outline_summary = workflow_stage_summary("outline", outline)
    standards_count = len(curriculum_standard_rows())
    findings = []
    for grade, grade_summary in outline_summary["grades"].items():
        if grade_summary["hours"] != grade_summary["target_hours"]:
            findings.append(
                {
                    "severity": "critical",
                    "category": "차시",
                    "location": f"{grade}학년",
                    "message": f"차시 합계가 {grade_summary['hours']}차시입니다.",
                    "suggestion": f"{grade_summary['target_hours']}차시에 맞추세요.",
                }
            )
        if not grade_summary["page_valid"]:
            findings.append(
                {
                    "severity": "critical",
                    "category": "쪽수",
                    "location": f"{grade}학년",
                    "message": f"본문·부록 합계가 {grade_summary['pages']}쪽입니다.",
                    "suggestion": "108~132쪽 범위로 조정하세요.",
                }
            )
    empty_bodies = sum(
        not section["body"].strip()
        for chapter in manuscript["chapters"]
        for section in chapter["sections"]
    )
    missing_safety = sum(not unit["safety"].strip() for unit in design["units"])
    if empty_bodies:
        findings.append(
            {
                "severity": "major",
                "category": "원고 완결성",
                "location": "중단원 본문",
                "message": f"본문이 비어 있는 중단원이 {empty_bodies}개입니다.",
                "suggestion": "학습 원리와 활동 안내 원고를 작성하세요.",
            }
        )
    if missing_safety:
        findings.append(
            {
                "severity": "critical",
                "category": "안전",
                "location": "단원 설계",
                "message": f"안전 설계가 없는 단원이 {missing_safety}개입니다.",
                "suggestion": "위험 요소와 대체 활동을 명시하세요.",
            }
        )
    critical_count = sum(item["severity"] == "critical" for item in findings)
    major_count = sum(item["severity"] == "major" for item in findings)
    scores = {
        "교육과정 정합성": 100 if standards_count == 49 else 70,
        "목차·분량 균형": max(0, 100 - critical_count * 15),
        "학년 적합성": 90,
        "현장 실행 가능성": 90 if not missing_safety else 65,
        "안전·포용성": 95 if not missing_safety else 55,
        "원고 완결성": max(0, 100 - empty_bodies * 5),
    }
    overall = round(sum(scores.values()) / len(scores))
    return {
        "title": "독립 모의심사 결과",
        "review_note": "앞 단계의 선택 근거와 선호 점수는 제외하고 공식 기준과 현재 산출물만 평가한다.",
        "source_versions": {
            "outline": outline["version"],
            "design": design["version"],
            "manuscript": manuscript["version"],
        },
        "reviewed_at": utc_now(),
        "overall_score": overall,
        "decision": "보완 후 통과" if findings else "통과",
        "scores": scores,
        "findings": findings,
        "hard_checks": {
            "achievement_standards": standards_count,
            "grade_hours_valid": all(
                item["hours"] == item["target_hours"]
                for item in outline_summary["grades"].values()
            ),
            "grade_pages_valid": all(
                item["page_valid"] for item in outline_summary["grades"].values()
            ),
            "empty_middle_bodies": empty_bodies,
            "missing_safety_designs": missing_safety,
        },
    }


def initialize_workflow_stages() -> None:
    generators = {
        "outline": generated_outline_payload,
        "design": generated_design_payload,
        "manuscript": generated_manuscript_payload,
        "review": build_review_payload,
    }
    for stage_key in WORKFLOW_STAGE_ORDER:
        with connect_db() as db:
            exists = db.execute(
                "SELECT 1 FROM workflow_stages WHERE stage_key = ?", (stage_key,)
            ).fetchone()
        if exists:
            continue
        payload = generators[stage_key]()
        encoded = json.dumps(payload, ensure_ascii=False)
        now = utc_now()
        with connect_db() as db:
            db.execute(
                """
                INSERT INTO workflow_stages
                    (stage_key, payload, status, version, updated_at)
                VALUES (?, ?, 'draft', 1, ?)
                """,
                (stage_key, encoded, now),
            )
            db.execute(
                """
                INSERT INTO workflow_stage_versions
                    (stage_key, version, payload, status, change_note, created_at)
                VALUES (?, 1, ?, 'draft', ?, ?)
                """,
                (
                    stage_key,
                    encoded,
                    f"{WORKFLOW_STAGE_LABELS[stage_key]} 최초 AI 초안 생성",
                    now,
                ),
            )
            db.commit()


def workflow_stage_record(stage_key: str) -> dict:
    if stage_key not in WORKFLOW_STAGE_ORDER:
        raise KeyError("지원하지 않는 제작 단계입니다.")
    with connect_db() as db:
        row = db.execute(
            """
            SELECT payload, status, version, updated_at, approved_at
            FROM workflow_stages WHERE stage_key = ?
            """,
            (stage_key,),
        ).fetchone()
    if row is None:
        raise KeyError("제작 단계 데이터를 찾을 수 없습니다.")
    payload = json.loads(row["payload"])
    payload.update(
        {
            "status": row["status"],
            "version": row["version"],
            "updated_at": row["updated_at"],
            "approved_at": row["approved_at"],
        }
    )
    return payload


def workflow_stage_versions(stage_key: str) -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT id, version, status, change_note, created_at
            FROM workflow_stage_versions
            WHERE stage_key = ? ORDER BY id DESC LIMIT 20
            """,
            (stage_key,),
        ).fetchall()
    return [dict(row) for row in rows]


def workflow_prerequisite(stage_key: str) -> dict:
    if stage_key == "outline":
        previous = content_record()
        return {
            "label": "5단계 내용·종목 선정",
            "status": previous["status"],
            "version": previous["version"],
            "is_ready": previous["status"] == "approved",
        }
    previous_key = WORKFLOW_STAGE_ORDER[WORKFLOW_STAGE_ORDER.index(stage_key) - 1]
    previous = workflow_stage_record(previous_key)
    return {
        "label": WORKFLOW_STAGE_LABELS[previous_key],
        "status": previous["status"],
        "version": previous["version"],
        "is_ready": previous["status"] == "approved",
    }


def workflow_stage_summary(stage_key: str, payload: dict | None = None) -> dict:
    payload = payload or workflow_stage_record(stage_key)
    if stage_key == "outline":
        project = project_payload()
        grades = {}
        for grade, grade_data in payload["grades"].items():
            hours = sum(unit["hours"] for unit in grade_data["units"])
            pages = sum(unit["pages"] for unit in grade_data["units"])
            grades[grade] = {
                "hours": hours,
                "pages": pages,
                "target_hours": project["default_grade_hours"],
                "target_pages": project["page_baseline"],
                "hours_valid": hours == project["default_grade_hours"],
                "page_valid": project["page_min"] <= pages <= project["page_max"],
                "unit_count": len(grade_data["units"]),
            }
        return {
            "grades": grades,
            "valid": all(
                item["hours_valid"] and item["page_valid"] and item["unit_count"] > 0
                for item in grades.values()
            ),
        }
    if stage_key == "design":
        required = ("learning_goal", "assessment", "safety", "inclusion")
        complete = sum(
            all(str(unit.get(field, "")).strip() for field in required)
            for unit in payload["units"]
        )
        return {
            "total_units": len(payload["units"]),
            "complete_units": complete,
            "valid": complete == len(payload["units"]) and bool(payload["units"]),
        }
    if stage_key == "manuscript":
        sections = [
            section
            for chapter in payload["chapters"]
            for section in chapter["sections"]
        ]
        complete = sum(bool(section["body"].strip()) for section in sections)
        return {
            "chapters": len(payload["chapters"]),
            "sections": len(sections),
            "complete_sections": complete,
            "valid": bool(payload["chapters"]) and complete == len(sections),
        }
    return {
        "overall_score": payload["overall_score"],
        "finding_count": len(payload["findings"]),
        "critical_count": sum(
            item["severity"] == "critical" for item in payload["findings"]
        ),
        "valid": not any(
            item["severity"] == "critical" for item in payload["findings"]
        ),
    }


def validate_workflow_payload(stage_key: str, payload: dict) -> dict:
    clean = json.loads(json.dumps(payload, ensure_ascii=False))
    for metadata in ("status", "version", "updated_at", "approved_at", "change_note"):
        clean.pop(metadata, None)
    title = clean.get("title")
    if not isinstance(title, str) or not title.strip():
        raise ValueError("단계 제목이 필요합니다.")
    if stage_key == "outline":
        grades = clean.get("grades")
        if not isinstance(grades, dict) or set(grades) != {"3", "4", "5", "6"}:
            raise ValueError("3~6학년 목차가 모두 필요합니다.")
        for grade, grade_data in grades.items():
            units = grade_data.get("units")
            if not isinstance(units, list) or not units:
                raise ValueError(f"{grade}학년 단원이 필요합니다.")
            for unit in units:
                for field in ("id", "domain", "large_unit_title", "subtitle"):
                    if not isinstance(unit.get(field), str) or not unit[field].strip():
                        raise ValueError(f"{grade}학년 단원 정보가 누락되었습니다.")
                if unit["domain"] not in {"운동", "스포츠", "표현"}:
                    raise ValueError("단원 영역이 올바르지 않습니다.")
                if not isinstance(unit.get("hours"), int) or unit["hours"] < 0:
                    raise ValueError("단원 차시는 0 이상의 정수여야 합니다.")
                if not isinstance(unit.get("pages"), int) or unit["pages"] < 0:
                    raise ValueError("단원 쪽수는 0 이상의 정수여야 합니다.")
                if not isinstance(unit.get("middle_units"), list):
                    raise ValueError("중단원 목록이 필요합니다.")
    elif stage_key == "design":
        units = clean.get("units")
        if not isinstance(units, list) or not units:
            raise ValueError("단원 설계가 필요합니다.")
        for unit in units:
            for field in (
                "id",
                "large_unit_title",
                "subtitle",
                "essential_question",
                "learning_goal",
                "lesson_flow",
                "assessment",
                "materials",
                "safety",
                "inclusion",
            ):
                if not isinstance(unit.get(field), str) or not unit[field].strip():
                    raise ValueError(f"단원 설계의 {field} 값이 필요합니다.")
    elif stage_key == "manuscript":
        chapters = clean.get("chapters")
        if not isinstance(chapters, list) or not chapters:
            raise ValueError("원고 장이 필요합니다.")
        for chapter in chapters:
            if not isinstance(chapter.get("opening"), str):
                raise ValueError("단원 도입 원고가 필요합니다.")
            sections = chapter.get("sections")
            if not isinstance(sections, list):
                raise ValueError("중단원 원고 목록이 필요합니다.")
            for section in sections:
                if not isinstance(section.get("title"), str) or not isinstance(
                    section.get("body"), str
                ):
                    raise ValueError("중단원명과 본문이 필요합니다.")
    elif stage_key == "review":
        if not isinstance(clean.get("scores"), dict) or not isinstance(
            clean.get("findings"), list
        ):
            raise ValueError("모의심사 결과가 올바르지 않습니다.")
    else:
        raise KeyError("지원하지 않는 제작 단계입니다.")
    return clean


def store_workflow_stage(
    stage_key: str, payload: dict, change_note: str, status: str = "draft"
) -> dict:
    clean = validate_workflow_payload(stage_key, payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM workflow_stages WHERE stage_key = ?", (stage_key,)
        ).fetchone()
        next_version = int(current["version"]) + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        db.execute(
            """
            UPDATE workflow_stages
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE stage_key = ?
            """,
            (
                encoded,
                status,
                next_version,
                now,
                now if status == "approved" else None,
                stage_key,
            ),
        )
        db.execute(
            """
            INSERT INTO workflow_stage_versions
                (stage_key, version, payload, status, change_note, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (stage_key, next_version, encoded, status, change_note, now),
        )
        db.commit()
    return workflow_stage_record(stage_key)


def workflow_bootstrap_payload(stage_key: str) -> dict:
    stage = workflow_stage_record(stage_key)
    return {
        "stage_key": stage_key,
        "stage_label": WORKFLOW_STAGE_LABELS[stage_key],
        "stage": stage,
        "summary": workflow_stage_summary(stage_key, stage),
        "versions": workflow_stage_versions(stage_key),
        "prerequisite": workflow_prerequisite(stage_key),
        "project": project_payload(),
    }


def update_workflow_stage(stage_key: str, payload: dict) -> dict:
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_workflow_stage(
        stage_key, payload, change_note.strip() or "웹 편집 내용 저장"
    )


def regenerate_workflow_stage(stage_key: str) -> dict:
    generators = {
        "outline": generated_outline_payload,
        "design": generated_design_payload,
        "manuscript": generated_manuscript_payload,
        "review": build_review_payload,
    }
    return store_workflow_stage(
        stage_key,
        generators[stage_key](),
        (
            "독립 심사 엔진으로 현재 산출물 재검토"
            if stage_key == "review"
            else f"{WORKFLOW_STAGE_LABELS[stage_key]} AI 초안 재생성"
        ),
    )


def approve_workflow_stage(stage_key: str) -> dict:
    prerequisite = workflow_prerequisite(stage_key)
    if not prerequisite["is_ready"]:
        raise ValueError(f"{prerequisite['label']}을 먼저 승인해야 합니다.")
    current = workflow_stage_record(stage_key)
    summary = workflow_stage_summary(stage_key, current)
    if not summary["valid"]:
        raise ValueError(f"{WORKFLOW_STAGE_LABELS[stage_key]} 자동 검증을 통과해야 합니다.")
    payload = {
        key: value
        for key, value in current.items()
        if key not in {"status", "version", "updated_at", "approved_at"}
    }
    return store_workflow_stage(
        stage_key,
        payload,
        f"편집팀 {WORKFLOW_STAGE_LABELS[stage_key]} 승인",
        status="approved",
    )


def bootstrap_payload() -> dict:
    synchronize_sources()
    sources = source_rows()
    return {
        "project": project_payload(),
        "sources": sources,
        "readiness": readiness(sources),
        "audit_log": recent_audit_rows(),
        "workspace": {
            "root": str(WORKSPACE_DIR),
            "processed": str(PROCESSED_DIR),
            "database": str(DB_PATH),
        },
    }


def validate_project(payload: dict) -> dict:
    required_text = ["name", "subject", "school_level", "curriculum_version"]
    for field in required_text:
        if not isinstance(payload.get(field), str) or not payload[field].strip():
            raise ValueError(f"{field} 값이 필요합니다.")

    grades = payload.get("grades")
    if grades != [3, 4, 5, 6]:
        raise ValueError("초기 프로젝트의 학년은 3, 4, 5, 6으로 고정합니다.")

    numeric_fields = [
        "page_baseline",
        "page_min",
        "page_max",
        "supplement_max",
        "band_hours_34",
        "band_hours_56",
        "default_grade_hours",
    ]
    for field in numeric_fields:
        value = payload.get(field)
        if not isinstance(value, int) or value < 0:
            raise ValueError(f"{field} 값은 0 이상의 정수여야 합니다.")

    if not payload["page_min"] <= payload["page_baseline"] <= payload["page_max"]:
        raise ValueError("기준 쪽수는 최소·최대 허용 범위 안에 있어야 합니다.")
    if payload["default_grade_hours"] * 2 != payload["band_hours_34"]:
        raise ValueError("학년 기본 차시×2는 3~4학년군 시수와 같아야 합니다.")
    if payload["default_grade_hours"] * 2 != payload["band_hours_56"]:
        raise ValueError("학년 기본 차시×2는 5~6학년군 시수와 같아야 합니다.")

    return {key: payload[key] for key in DEFAULT_PROJECT}


def update_project(payload: dict) -> dict:
    clean = validate_project(payload)
    now = utc_now()
    with connect_db() as db:
        previous = db.execute("SELECT payload FROM project WHERE id = 1").fetchone()
        db.execute(
            "UPDATE project SET payload = ?, updated_at = ? WHERE id = 1",
            (json.dumps(clean, ensure_ascii=False), now),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('project', '1', 'updated', ?, ?)
            """,
            (
                json.dumps(
                    {"before": json.loads(previous["payload"]), "after": clean},
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()
    return project_payload()


def update_source(document_id: str, payload: dict) -> dict:
    status = payload.get("review_status")
    note = payload.get("review_note", "")
    if status not in {"pending", "approved", "rejected"}:
        raise ValueError("지원하지 않는 검수 상태입니다.")
    if not isinstance(note, str) or len(note) > 2000:
        raise ValueError("검수 메모는 2,000자 이내여야 합니다.")

    now = utc_now()
    with connect_db() as db:
        previous = db.execute(
            "SELECT review_status, review_note, integrity_status FROM sources WHERE document_id = ?",
            (document_id,),
        ).fetchone()
        if previous is None:
            raise KeyError("공식 자료를 찾을 수 없습니다.")
        if status == "approved" and previous["integrity_status"] != "verified":
            raise ValueError("무결성 확인이 완료되지 않은 자료는 승인할 수 없습니다.")

        reviewed_at = now if status in {"approved", "rejected"} else None
        db.execute(
            """
            UPDATE sources
            SET review_status = ?, review_note = ?, reviewed_at = ?, updated_at = ?
            WHERE document_id = ?
            """,
            (status, note.strip(), reviewed_at, now, document_id),
        )
        db.execute(
            """
            INSERT INTO audit_log (entity_type, entity_id, action, details, created_at)
            VALUES ('source', ?, 'reviewed', ?, ?)
            """,
            (
                document_id,
                json.dumps(
                    {
                        "before": {
                            "review_status": previous["review_status"],
                            "review_note": previous["review_note"],
                        },
                        "after": {"review_status": status, "review_note": note.strip()},
                    },
                    ensure_ascii=False,
                ),
                now,
            ),
        )
        db.commit()

    return next(source for source in source_rows() if source["document_id"] == document_id)


class StudioHandler(BaseHTTPRequestHandler):
    server_version = "TextbookStudio/0.1"

    def log_message(self, format_string: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format_string % args}")

    def send_json(self, payload: object, status: int = HTTPStatus.OK) -> None:
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(encoded)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length)
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("올바른 JSON 요청이 아닙니다.") from exc
        if not isinstance(payload, dict):
            raise ValueError("JSON 객체가 필요합니다.")
        return payload

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/bootstrap":
            self.send_json(bootstrap_payload())
            return
        if parsed.path == "/api/analysis/bootstrap":
            self.send_json(analysis_bootstrap_payload())
            return
        if parsed.path == "/api/direction/bootstrap":
            self.send_json(direction_bootstrap_payload())
            return
        if parsed.path == "/api/allocation/bootstrap":
            self.send_json(allocation_bootstrap_payload())
            return
        if parsed.path == "/api/content/bootstrap":
            self.send_json(content_bootstrap_payload())
            return
        for stage_key in WORKFLOW_STAGE_ORDER:
            if parsed.path == f"/api/{stage_key}/bootstrap":
                self.send_json(workflow_bootstrap_payload(stage_key))
                return
        if parsed.path == "/api/health":
            self.send_json({"status": "ok", "time": utc_now()})
            return
        self.serve_static(parsed.path)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/api/project":
                self.send_json({"project": update_project(payload)})
                return
            if parsed.path == "/api/analysis":
                self.send_json({"analysis": update_analysis(payload)})
                return
            if parsed.path == "/api/direction":
                self.send_json({"direction": update_direction(payload)})
                return
            if parsed.path == "/api/allocation":
                allocation = update_allocation(payload)
                self.send_json(
                    {
                        "allocation": allocation,
                        "summary": allocation_summary(allocation),
                    }
                )
                return
            if parsed.path == "/api/content":
                content = update_content(payload)
                self.send_json(
                    {"content": content, "summary": content_summary(content)}
                )
                return
            for stage_key in WORKFLOW_STAGE_ORDER:
                if parsed.path == f"/api/{stage_key}":
                    stage = update_workflow_stage(stage_key, payload)
                    self.send_json(
                        {
                            "stage": stage,
                            "summary": workflow_stage_summary(stage_key, stage),
                        }
                    )
                    return
            prefix = "/api/sources/"
            if parsed.path.startswith(prefix):
                document_id = unquote(parsed.path[len(prefix) :])
                source = update_source(document_id, payload)
                sources = source_rows()
                self.send_json({"source": source, "readiness": readiness(sources)})
                return
            self.send_json({"error": "API 경로를 찾을 수 없습니다."}, HTTPStatus.NOT_FOUND)
        except KeyError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - last-resort boundary
            self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/analysis/generate":
                self.send_json({"analysis": regenerate_analysis()})
                return
            if parsed.path == "/api/analysis/approve":
                self.send_json({"analysis": approve_analysis()})
                return
            if parsed.path == "/api/direction/generate":
                self.send_json({"direction": regenerate_direction()})
                return
            if parsed.path == "/api/direction/approve":
                self.send_json({"direction": approve_direction()})
                return
            if parsed.path == "/api/allocation/generate":
                allocation = regenerate_allocation()
                self.send_json(
                    {
                        "allocation": allocation,
                        "summary": allocation_summary(allocation),
                    }
                )
                return
            if parsed.path == "/api/allocation/approve":
                self.send_json({"allocation": approve_allocation()})
                return
            if parsed.path == "/api/content/generate":
                content = regenerate_content()
                self.send_json(
                    {"content": content, "summary": content_summary(content)}
                )
                return
            if parsed.path == "/api/content/approve":
                self.send_json({"content": approve_content()})
                return
            for stage_key in WORKFLOW_STAGE_ORDER:
                if parsed.path == f"/api/{stage_key}/generate":
                    stage = regenerate_workflow_stage(stage_key)
                    self.send_json(
                        {
                            "stage": stage,
                            "summary": workflow_stage_summary(stage_key, stage),
                        }
                    )
                    return
                if parsed.path == f"/api/{stage_key}/approve":
                    self.send_json({"stage": approve_workflow_stage(stage_key)})
                    return
            self.send_json({"error": "API 경로를 찾을 수 없습니다."}, HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - last-resort boundary
            self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def serve_static(self, request_path: str) -> None:
        route_files = {
            "": "index.html",
            "/": "index.html",
            "/analysis": "analysis.html",
            "/direction": "direction.html",
            "/allocation": "allocation.html",
            "/content": "content.html",
            "/outline": "workflow.html",
            "/design": "workflow.html",
            "/manuscript": "workflow.html",
            "/review": "workflow.html",
        }
        relative = route_files.get(request_path, unquote(request_path.lstrip("/")))
        candidate = (STATIC_DIR / relative).resolve()
        try:
            candidate.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not candidate.is_file():
            candidate = STATIC_DIR / "index.html"
        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in {"application/javascript", "application/json"}:
            content_type += "; charset=utf-8"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)


def main() -> None:
    parser = argparse.ArgumentParser(description="교과서 제작 스튜디오 로컬 서버")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    initialize_database()
    server = ThreadingHTTPServer((args.host, args.port), StudioHandler)
    print(f"교과서 제작 스튜디오: http://{args.host}:{args.port}")
    print(f"공식 자료: {PROCESSED_DIR}")
    print(f"데이터베이스: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
