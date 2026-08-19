from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

from database import connect_database
from hwpx_export import build_hwpx


APP_DIR = Path(__file__).resolve().parent
BUNDLED_WORKSPACE_DIR = APP_DIR / "official-data"
DEFAULT_WORKSPACE_DIR = (
    BUNDLED_WORKSPACE_DIR
    if (BUNDLED_WORKSPACE_DIR / "processed").is_dir()
    else APP_DIR.parent
)
WORKSPACE_DIR = Path(
    os.environ.get("TEXTBOOK_DATA_ROOT", DEFAULT_WORKSPACE_DIR)
).resolve()
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

EXPORT_SCOPE_LABELS = {
    "analysis": "교육과정 분석",
    "direction": "교과서 개발 방향",
    "allocation": "성취기준·차시 배분",
    "content": "내용·종목 선정",
    "outline": "목차·쪽수·차시 설계",
    "design": "단원 설계",
    "manuscript": "교과서 원고 초안",
    "review": "자동검증·모의심사",
    "all": "교과서 제작 전체 결과",
}

EXPORT_FIELD_LABELS = {
    "name": "이름",
    "title": "제목",
    "subject": "교과",
    "school_level": "학교급",
    "curriculum_version": "교육과정",
    "overview": "개요",
    "summary": "요약",
    "focus": "중점",
    "assessment": "평가",
    "purpose": "개발 목적",
    "target_learner": "학습자",
    "selected_option_id": "선택안",
    "common_principles": "공통 개발 원칙",
    "policies": "집필 정책",
    "success_criteria": "성공 기준",
    "planning_note": "배분 계획",
    "target_hours": "학년별 목표 차시",
    "assignments": "성취기준 배분",
    "selection_note": "선정 원칙",
    "candidates": "내용·종목 후보",
    "grade_bands": "학년군 분석",
    "domains": "영역별 분석",
    "editorial_implications": "집필 시사점",
    "standards": "성취기준과 해설",
    "code": "성취기준",
    "statement": "성취기준 내용",
    "explanation": "성취기준 해설",
    "grade_band": "학년군",
    "grade": "학년",
    "hours": "차시",
    "treatment": "집중도",
    "sequence": "순서",
    "rationale": "근거",
    "subdomain": "세부 영역",
    "examples": "신체활동 예시",
    "activity_groups": "중·소단원 구성",
    "small_units": "소단원",
    "selected_grades": "선정 학년",
    "priority": "우선순위",
    "feasibility": "현장 실행 가능성",
    "safety_risk": "안전 위험도",
    "facilities": "시설 조건",
    "safety_note": "안전 대책",
    "chapters": "대단원 원고",
    "sections": "중단원 원고",
    "body": "본문",
    "findings": "심사 의견",
    "scores": "심사 점수",
    "domain": "영역",
    "large_unit_title": "대단원명",
    "subtitle": "부제",
    "target_pages": "목표 쪽수",
    "generated_pages": "생성된 쪽수",
    "opener_pages": "도입 쪽수",
    "opening": "도입 안내",
    "assessment_box": "평가란",
    "safety_box": "안전란",
    "activities": "활동",
    "source_activity": "원 활동",
    "instruction": "학습 안내",
    "spreads": "펼침면",
    "spread_number": "펼침면 번호",
    "left_page": "왼쪽 쪽",
    "right_page": "오른쪽 쪽",
    "layout_template": "펼침면 유형",
    "role": "역할",
    "intro": "도입",
    "support_boxes": "보조란",
    "wrap_up": "정리",
    "spread_visual_note": "삽화 안내",
    "number": "번호",
    "placement": "배치",
    "objective": "목표",
    "method": "활동 방법",
    "visual_note": "삽화 메모",
    "type": "유형",
    "content": "내용",
}

EXPORT_METADATA_FIELDS = {
    "id",
    "status",
    "version",
    "updated_at",
    "approved_at",
    "created_at",
    "source_document_id",
    "source_page",
    "explanation_source_page",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connect_db():
    with connect_database(DB_PATH) as connection:
        yield connection


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

            CREATE TABLE IF NOT EXISTS editor_accounts (
                email TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'editor',
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )
        standard_columns = db.table_columns("curriculum_standards")
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


class AuthenticationError(Exception):
    pass


class AuthorizationError(Exception):
    pass


class VersionConflictError(Exception):
    pass


def requested_version(payload: dict) -> int | None:
    value = payload.pop("expected_version", None)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError("저장 기준 버전이 올바르지 않습니다.")
    return value


def ensure_current_version(current_version: int, expected_version: int | None) -> None:
    if expected_version is not None and current_version != expected_version:
        raise VersionConflictError(
            "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
        )


def auth_config() -> dict:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    publishable_key = (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY")
        or os.environ.get("SUPABASE_ANON_KEY")
        or ""
    )
    return {
        "enabled": bool(supabase_url and publishable_key),
        "supabase_url": supabase_url,
        "publishable_key": publishable_key,
    }


def authenticated_user(authorization_header: str) -> dict:
    config = auth_config()
    if not config["enabled"]:
        return {
            "id": "local-user",
            "email": os.environ.get("STUDIO_OWNER_EMAIL", "local@example.com"),
            "role": "owner",
        }
    if not authorization_header.startswith("Bearer "):
        raise AuthenticationError("로그인이 필요합니다.")
    access_token = authorization_header.removeprefix("Bearer ").strip()
    if not access_token:
        raise AuthenticationError("로그인이 필요합니다.")
    request = Request(
        f"{config['supabase_url']}/auth/v1/user",
        headers={
            "apikey": config["publishable_key"],
            "Authorization": f"Bearer {access_token}",
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            user = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
        raise AuthenticationError("로그인이 만료되었거나 유효하지 않습니다.") from exc
    email = str(user.get("email", "")).strip().lower()
    user_id = str(user.get("id", "")).strip()
    if not email or not user_id:
        raise AuthenticationError("사용자 정보를 확인할 수 없습니다.")

    owner_email = os.environ.get("STUDIO_OWNER_EMAIL", "").strip().lower()
    with connect_db() as db:
        account = db.execute(
            """
            SELECT email, user_id, role, active
            FROM editor_accounts WHERE email = ?
            """,
            (email,),
        ).fetchone()
        if account is None and owner_email and email == owner_email:
            now = utc_now()
            db.execute(
                """
                INSERT INTO editor_accounts (
                    email, user_id, role, active, created_at, updated_at
                ) VALUES (?, ?, 'owner', 1, ?, ?)
                """,
                (email, user_id, now, now),
            )
            db.commit()
            account = {"email": email, "user_id": user_id, "role": "owner", "active": 1}
        elif account is not None and account["user_id"] != user_id:
            db.execute(
                """
                UPDATE editor_accounts
                SET user_id = ?, updated_at = ?
                WHERE email = ?
                """,
                (user_id, utc_now(), email),
            )
            db.commit()
        if account is None or not bool(account["active"]):
            raise AuthorizationError("이 프로젝트의 편집자로 등록되지 않았습니다.")
        return {"id": user_id, "email": email, "role": account["role"]}


def require_owner(user: dict | None) -> None:
    if not user or user.get("role") != "owner":
        raise AuthorizationError("관리자만 편집자 계정을 관리할 수 있습니다.")


def editor_rows() -> list[dict]:
    with connect_db() as db:
        rows = db.execute(
            """
            SELECT email, role, active, created_at, updated_at
            FROM editor_accounts
            ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, email
            """
        ).fetchall()
    return [
        {
            "email": row["email"],
            "role": row["role"],
            "active": bool(row["active"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def add_editor(payload: dict) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("올바른 편집자 이메일을 입력하세요.")
    now = utc_now()
    with connect_db() as db:
        db.execute(
            """
            INSERT INTO editor_accounts (
                email, user_id, role, active, created_at, updated_at
            ) VALUES (?, '', 'editor', 1, ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                active = 1,
                updated_at = excluded.updated_at
            """,
            (email, now, now),
        )
        db.commit()
    return next(row for row in editor_rows() if row["email"] == email)


def deactivate_editor(email: str) -> dict:
    normalized = email.strip().lower()
    with connect_db() as db:
        account = db.execute(
            "SELECT email, role FROM editor_accounts WHERE email = ?",
            (normalized,),
        ).fetchone()
        if account is None:
            raise KeyError("편집자를 찾을 수 없습니다.")
        if account["role"] == "owner":
            raise ValueError("최초 관리자는 비활성화할 수 없습니다.")
        db.execute(
            """
            UPDATE editor_accounts
            SET active = 0, updated_at = ?
            WHERE email = ?
            """,
            (utc_now(), normalized),
        )
        db.commit()
    return next(row for row in editor_rows() if row["email"] == normalized)


def source_title(manifest: dict, folder: Path) -> str:
    source_name = Path(manifest.get("source_file", "")).stem
    return source_name or folder.name


def manifest_source_path(manifest: dict) -> Path | None:
    configured = Path(str(manifest.get("source_file", "")))
    candidates = [configured]
    if not configured.is_absolute():
        candidates.extend(
            (
                WORKSPACE_DIR / configured,
                APP_DIR.parent / configured,
            )
        )
    candidates.extend(
        (
            WORKSPACE_DIR / "criteria" / configured.name,
            APP_DIR.parent / "criteria" / configured.name,
        )
    )
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return None


def determine_integrity(manifest: dict, folder: Path) -> str:
    outputs = manifest.get("outputs", [])
    if any(not (folder / output).is_file() for output in outputs):
        return "outputs_missing"

    page_count = int(manifest.get("page_count", 0))
    embedded_pages = manifest.get("pages")
    if isinstance(embedded_pages, list) and embedded_pages:
        if len(embedded_pages) != page_count:
            return "page_mismatch"
    elif (folder / "pages.jsonl").is_file():
        try:
            jsonl_page_count = sum(
                bool(line.strip())
                for line in (folder / "pages.jsonl").read_text(encoding="utf-8-sig").splitlines()
            )
        except OSError:
            return "outputs_missing"
        if jsonl_page_count != page_count:
            return "page_mismatch"

    expected_hash = manifest.get("source_sha256", "").lower()
    source_path = manifest_source_path(manifest)
    if source_path is None:
        return "processed_only" if expected_hash else "source_missing"
    if not expected_hash or sha256_file(source_path) != expected_hash:
        return "hash_mismatch"
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
    usable_statuses = {"verified", "processed_only"}
    integrity_verified = sum(
        s["integrity_status"] in usable_statuses for s in sources
    )
    source_verified = sum(s["integrity_status"] == "verified" for s in sources)
    processed_only = sum(s["integrity_status"] == "processed_only" for s in sources)
    approved = sum(s["review_status"] == "approved" for s in sources)
    rejected = sum(s["review_status"] == "rejected" for s in sources)
    is_ready = total > 0 and integrity_verified == total and approved == total
    return {
        "total": total,
        "integrity_verified": integrity_verified,
        "source_verified": source_verified,
        "processed_only": processed_only,
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


def store_analysis(
    payload: dict,
    change_note: str,
    status: str = "draft",
    expected_version: int | None = None,
) -> dict:
    clean = validate_analysis_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM curriculum_analysis WHERE id = 1"
        ).fetchone()
        current_version = int(current["version"])
        ensure_current_version(current_version, expected_version)
        next_version = current_version + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        updated = db.execute(
            """
            UPDATE curriculum_analysis
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1 AND version = ?
            """,
            (encoded, status, next_version, now, approved_at, current_version),
        )
        if updated.rowcount != 1:
            raise VersionConflictError(
                "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
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
    expected_version = requested_version(payload)
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_analysis(
        payload,
        change_note.strip() or "웹 편집 내용 저장",
        expected_version=expected_version,
    )


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


def store_direction(
    payload: dict,
    change_note: str,
    status: str = "draft",
    expected_version: int | None = None,
) -> dict:
    clean = validate_direction_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM development_direction WHERE id = 1"
        ).fetchone()
        current_version = int(current["version"])
        ensure_current_version(current_version, expected_version)
        next_version = current_version + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        updated = db.execute(
            """
            UPDATE development_direction
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1 AND version = ?
            """,
            (encoded, status, next_version, now, approved_at, current_version),
        )
        if updated.rowcount != 1:
            raise VersionConflictError(
                "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
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
    expected_version = requested_version(payload)
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_direction(
        payload,
        change_note.strip() or "웹 편집 내용 저장",
        expected_version=expected_version,
    )


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


def store_allocation(
    payload: dict,
    change_note: str,
    status: str = "draft",
    expected_version: int | None = None,
) -> dict:
    clean = validate_allocation_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute("SELECT version FROM grade_allocation WHERE id = 1").fetchone()
        current_version = int(current["version"])
        ensure_current_version(current_version, expected_version)
        next_version = current_version + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        updated = db.execute(
            """
            UPDATE grade_allocation
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1 AND version = ?
            """,
            (encoded, status, next_version, now, approved_at, current_version),
        )
        if updated.rowcount != 1:
            raise VersionConflictError(
                "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
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
    expected_version = requested_version(payload)
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_allocation(
        payload,
        change_note.strip() or "웹 편집 내용 저장",
        expected_version=expected_version,
    )


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


def store_content(
    payload: dict,
    change_note: str,
    status: str = "draft",
    expected_version: int | None = None,
) -> dict:
    clean = validate_content_payload(payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM content_selection WHERE id = 1"
        ).fetchone()
        current_version = int(current["version"])
        ensure_current_version(current_version, expected_version)
        next_version = current_version + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        approved_at = now if status == "approved" else None
        updated = db.execute(
            """
            UPDATE content_selection
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE id = 1 AND version = ?
            """,
            (encoded, status, next_version, now, approved_at, current_version),
        )
        if updated.rowcount != 1:
            raise VersionConflictError(
                "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
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
    expected_version = requested_version(payload)
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_content(
        payload,
        change_note.strip() or "웹 편집 내용 저장",
        expected_version=expected_version,
    )


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


def allocate_small_unit_spreads(total_pages: int, count: int) -> tuple[int, list[int]]:
    """Return chapter opener pages and even small-unit page counts."""
    if count <= 0:
        return total_pages, []
    opener_pages = total_pages % 2
    content_pages = total_pages - opener_pages
    minimum = count * 2
    if content_pages < minimum:
        raise ValueError("소단원마다 최소 한 개의 펼침면(2쪽)을 배정할 수 없습니다.")
    pages = [2 for _ in range(count)]
    remaining_spreads = (content_pages - minimum) // 2
    for index in range(remaining_spreads):
        pages[index % count] += 2
    return opener_pages, pages


def manuscript_spread_draft(
    *,
    left_page: int,
    spread_index: int,
    spread_count: int,
    small_title: str,
    source_activity: str,
    middle_title: str,
) -> dict:
    if spread_index == 0:
        template = "기본 기능형"
        role = "도입·기능 익히기"
        focus = f"{source_activity}의 특징과 기본 움직임을 익혀 봅시다."
    elif spread_index == spread_count - 1:
        template = "탐구·평가형"
        role = "적용·정리"
        focus = f"{source_activity}을 적용하고 활동 결과를 돌아봅시다."
    else:
        template = "게임·적용형"
        role = "도전·전략 적용"
        focus = f"친구와 함께 {source_activity}에 도전하며 전략을 찾아봅시다."
    activity_count = 3 if spread_count > 1 and spread_index == spread_count - 1 else 2
    placements = ["left", "right", "across"]
    activities = [
        {
            "number": index + 1,
            "title": (
                f"{small_title} 기본 움직임 익히기"
                if index == 0
                else f"{small_title} 상황에 맞게 도전하기"
                if index == 1
                else f"{small_title} 전략 만들기"
            ),
            "placement": placements[index],
            "objective": f"{source_activity}의 방법을 이해하고 자신의 수준에 맞게 수행할 수 있다.",
            "method": [
                "모둠을 정하고 활동 공간과 준비물을 확인합니다.",
                f"{source_activity}의 핵심 움직임을 단계에 따라 수행합니다.",
                "친구와 결과를 비교하고 더 나은 방법을 찾아 다시 활동합니다.",
            ],
            "visual_note": "주요 동작 순서, 학생 간 안전 거리, 이동 방향을 삽화로 표시",
        }
        for index in range(activity_count)
    ]
    return {
        "spread_number": spread_index + 1,
        "left_page": left_page,
        "right_page": left_page + 1,
        "layout_template": template,
        "role": role,
        "title": f"{small_title} · {role}",
        "intro": (
            f"{middle_title}에서 배운 내용을 바탕으로 {focus} "
            "활동 전에는 공간과 도구를 확인하고 모둠의 안전 약속을 정합니다."
        ),
        "activities": activities,
        "support_boxes": [
            {"type": "준비물", "content": f"{source_activity}에 필요한 기본 교구와 기록 도구"},
            {"type": "안전", "content": "활동 간격을 유지하고 충돌 위험이 있는 이동 방향을 미리 확인합니다."},
            {
                "type": "전략" if role != "적용·정리" else "점검",
                "content": "친구의 움직임을 관찰하고 성공한 방법과 바꿀 점을 정리합니다.",
            },
        ],
        "wrap_up": (
            f"{source_activity}에서 잘된 점과 다음 활동에서 바꿀 점을 한 가지씩 적어 봅시다."
        ),
        "spread_visual_note": "좌우 페이지를 연결하는 주 활동 삽화와 활동별 동작·전략 보조 그림 배치",
    }


def generated_manuscript_payload() -> dict:
    design = workflow_stage_record("design")
    chapters = []
    next_page_by_grade = {3: 1, 4: 1, 5: 1, 6: 1}
    for unit in design["units"]:
        small_unit_count = sum(
            len(middle["small_units"]) for middle in unit["middle_units"]
        )
        opener_pages, small_page_counts = allocate_small_unit_spreads(
            unit["pages"], small_unit_count
        )
        chapter_start_page = next_page_by_grade[unit["grade"]]
        opener_page_numbers = list(
            range(chapter_start_page, chapter_start_page + opener_pages)
        )
        next_page_by_grade[unit["grade"]] += opener_pages
        small_page_index = 0
        sections = []
        for middle in unit["middle_units"]:
            activities = []
            for small in middle["small_units"]:
                target_pages = small_page_counts[small_page_index]
                spreads = [
                    manuscript_spread_draft(
                        left_page=next_page_by_grade[unit["grade"]] + spread_index * 2,
                        spread_index=spread_index,
                        spread_count=target_pages // 2,
                        small_title=small["title"],
                        source_activity=small["source_activity"],
                        middle_title=middle["title"],
                    )
                    for spread_index in range(target_pages // 2)
                ]
                activities.append(
                    {
                        "title": small["title"],
                        "source_activity": small["source_activity"],
                        "target_pages": target_pages,
                        "instruction": (
                            f"{small['source_activity']}의 핵심 동작을 탐색하고, 자신의 수준에 맞게 "
                            "연습한 뒤 친구와 결과를 나눠 봅시다."
                        ),
                        "spreads": spreads,
                    }
                )
                next_page_by_grade[unit["grade"]] += target_pages
                small_page_index += 1
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
                "target_pages": unit["pages"],
                "opener_pages": opener_page_numbers,
                "generated_pages": len(opener_page_numbers) + sum(
                    len(activity["spreads"]) * 2
                    for section in sections
                    for activity in section["activities"]
                ),
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
        "editorial_note": (
            "소단원은 2쪽 펼침면 단위로 구성하고, 펼침면 전체에 활동 2~3개와 "
            "준비물·안전·전략·점검 요소를 배치한다."
        ),
        "source_design_version": design["version"],
        "generation_mode": "전체 원고",
        "total_target_pages": sum(chapter["target_pages"] for chapter in chapters),
        "total_generated_pages": sum(chapter["generated_pages"] for chapter in chapters),
        "chapters": chapters,
    }


def secret_environment_value(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    local_env = APP_DIR / ".env.local"
    if not local_env.is_file():
        return ""
    for line in local_env.read_text(encoding="utf-8-sig").splitlines():
        key, separator, candidate = line.partition("=")
        if separator and key.strip() == name:
            return candidate.strip().strip('"').strip("'")
    return ""


def manuscript_ai_config() -> dict:
    return {
        "enabled": bool(secret_environment_value("OPENAI_API_KEY")),
        "model": os.environ.get("OPENAI_MODEL", "gpt-5.6"),
    }


def manuscript_catalog_record() -> dict:
    manuscript = workflow_stage_record("manuscript")
    catalog = []
    for chapter in manuscript["chapters"]:
        catalog.append(
            {
                "id": chapter["id"],
                "grade": chapter["grade"],
                "domain": chapter["domain"],
                "large_unit_title": chapter["large_unit_title"],
                "subtitle": chapter["subtitle"],
                "target_pages": chapter["target_pages"],
                "generated_pages": chapter["generated_pages"],
                "sections": [
                    {
                        "index": section_index,
                        "title": section["title"],
                        "small_units": [
                            {
                                "index": small_index,
                                "title": small_unit["title"],
                                "target_pages": small_unit["target_pages"],
                                "spread_count": len(small_unit.get("spreads", [])),
                            }
                            for small_index, small_unit in enumerate(
                                section.get("activities", [])
                            )
                        ],
                    }
                    for section_index, section in enumerate(chapter["sections"])
                ],
            }
        )
    stage = {
        key: value
        for key, value in manuscript.items()
        if key not in {"chapters"}
    }
    return {
        "stage": stage,
        "catalog": catalog,
        "summary": workflow_stage_summary("manuscript", manuscript),
        "versions": workflow_stage_versions("manuscript"),
        "prerequisite": workflow_prerequisite("manuscript"),
        "project": project_payload(),
        "ai": manuscript_ai_config(),
    }


def manuscript_small_unit_selection(
    chapter_id: str,
    section_index: int,
    small_unit_index: int,
) -> tuple[dict, dict, dict, dict]:
    if section_index < 0 or small_unit_index < 0:
        raise KeyError("선택한 소단원을 찾을 수 없습니다.")
    manuscript = workflow_stage_record("manuscript")
    chapter = next(
        (item for item in manuscript["chapters"] if item["id"] == chapter_id),
        None,
    )
    if chapter is None:
        raise KeyError("대단원을 찾을 수 없습니다.")
    try:
        section = chapter["sections"][section_index]
        small_unit = section["activities"][small_unit_index]
    except (IndexError, KeyError, TypeError) as exc:
        raise KeyError("선택한 소단원을 찾을 수 없습니다.") from exc
    return manuscript, chapter, section, small_unit


def manuscript_small_unit_payload(
    chapter_id: str,
    section_index: int,
    small_unit_index: int,
) -> dict:
    manuscript, chapter, section, small_unit = manuscript_small_unit_selection(
        chapter_id, section_index, small_unit_index
    )
    return {
        "manuscript_version": manuscript["version"],
        "chapter": {
            key: chapter[key]
            for key in (
                "id",
                "grade",
                "domain",
                "large_unit_title",
                "subtitle",
                "target_pages",
                "generated_pages",
                "opening",
                "assessment_box",
                "safety_box",
            )
        },
        "section": {
            "index": section_index,
            "title": section["title"],
            "body": section["body"],
        },
        "small_unit": {
            **small_unit,
            "index": small_unit_index,
        },
        "ai": manuscript_ai_config(),
    }


def openai_response_text(response: dict) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    for output in response.get("output", []):
        if output.get("type") != "message":
            continue
        for content in output.get("content", []):
            if content.get("type") == "output_text" and isinstance(
                content.get("text"), str
            ):
                return content["text"]
            if content.get("type") == "refusal":
                raise ValueError(f"AI가 생성을 거절했습니다: {content.get('refusal', '')}")
    raise ValueError("OpenAI 응답에서 원고 JSON을 찾지 못했습니다.")


def small_unit_ai_schema(spread_count: int) -> dict:
    activity_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "title",
            "placement",
            "objective",
            "method",
            "visual_note",
        ],
        "properties": {
            "title": {"type": "string"},
            "placement": {"type": "string", "enum": ["left", "right", "across"]},
            "objective": {"type": "string"},
            "method": {
                "type": "array",
                "minItems": 3,
                "maxItems": 5,
                "items": {"type": "string"},
            },
            "visual_note": {"type": "string"},
        },
    }
    support_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["type", "content"],
        "properties": {
            "type": {
                "type": "string",
                "enum": ["준비물", "안전", "전략", "점검", "도움말"],
            },
            "content": {"type": "string"},
        },
    }
    spread_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "layout_template",
            "role",
            "title",
            "intro",
            "activities",
            "support_boxes",
            "wrap_up",
            "spread_visual_note",
        ],
        "properties": {
            "layout_template": {
                "type": "string",
                "enum": ["기본 기능형", "게임·적용형", "탐구·평가형"],
            },
            "role": {"type": "string"},
            "title": {"type": "string"},
            "intro": {"type": "string"},
            "activities": {
                "type": "array",
                "minItems": 2,
                "maxItems": 3,
                "items": activity_schema,
            },
            "support_boxes": {
                "type": "array",
                "minItems": 3,
                "maxItems": 4,
                "items": support_schema,
            },
            "wrap_up": {"type": "string"},
            "spread_visual_note": {"type": "string"},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["instruction", "spreads"],
        "properties": {
            "instruction": {"type": "string"},
            "spreads": {
                "type": "array",
                "minItems": spread_count,
                "maxItems": spread_count,
                "items": spread_schema,
            },
        },
    }


def call_openai_for_small_unit(
    chapter: dict,
    section: dict,
    small_unit: dict,
) -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")
    design = workflow_stage_record("design")
    unit_design = next(
        (item for item in design["units"] if item["id"] == chapter["id"]),
        {},
    )
    other_titles = [
        activity["title"]
        for candidate_section in chapter["sections"]
        for activity in candidate_section.get("activities", [])
        if activity is not small_unit
    ][:20]
    context = {
        "grade": chapter["grade"],
        "domain": chapter["domain"],
        "large_unit": chapter["large_unit_title"],
        "subtitle": chapter["subtitle"],
        "middle_unit": section["title"],
        "small_unit": small_unit["title"],
        "source_activity": small_unit["source_activity"],
        "target_pages": small_unit["target_pages"],
        "spread_count": len(small_unit["spreads"]),
        "learning_goal": unit_design.get("learning_goal", ""),
        "essential_question": unit_design.get("essential_question", ""),
        "safety": unit_design.get("safety", ""),
        "inclusion": unit_design.get("inclusion", ""),
        "assessment": unit_design.get("assessment", ""),
        "other_small_unit_titles": other_titles,
    }
    instructions = (
        "당신은 2022 개정 교육과정 초등 체육 교과서 집필자다. 제공된 소단원 하나의 "
        "펼침면 원고만 작성한다. 출판사 샘플의 문장이나 고유 디자인을 복제하지 말고 "
        "일반적인 교과서 구성 원리만 활용한다. 각 펼침면에는 서로 다른 활동 2~3개를 "
        "구성한다. 활동마다 인원, 공간 배치, 준비물, 규칙, 수행 순서, 성공 조건, 안전 "
        "유의점을 구체화한다. '확인합니다-수행합니다-나눕니다' 같은 동일 문장 틀을 "
        "반복하지 않는다. 앞뒤 활동은 난이도와 사고 수준이 발전해야 한다. 초등학생이 "
        "이해할 수 있는 짧고 명확한 문장을 사용하고, 사실 확인이 필요한 정보는 만들지 않는다."
    )
    request_body = {
        "model": manuscript_ai_config()["model"],
        "reasoning": {"effort": "low"},
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False),
        "max_output_tokens": 12000,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "elementary_pe_small_unit",
                "strict": True,
                "schema": small_unit_ai_schema(len(small_unit["spreads"])),
            }
        },
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=50) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            message = detail
        if exc.code == HTTPStatus.UNAUTHORIZED:
            raise ValueError(
                "OpenAI API 키가 유효하지 않습니다. 등록한 키를 다시 확인해 주세요."
            ) from exc
        if exc.code == HTTPStatus.TOO_MANY_REQUESTS:
            if "quota" in message.lower() or "billing" in message.lower():
                raise ValueError(
                    "OpenAI API 사용 가능 금액이 없습니다. OpenAI API 결제 설정과 "
                    "사용 한도를 확인한 뒤 다시 시도해 주세요."
                ) from exc
            raise ValueError(
                "OpenAI API 요청이 잠시 너무 많습니다. 잠시 후 다시 시도해 주세요."
            ) from exc
        raise ValueError(f"OpenAI API 오류: {message[:500]}") from exc
    except TimeoutError as exc:
        raise ValueError(
            "OpenAI 응답 제한 시간(50초)을 초과했습니다. 잠시 후 다시 시도해 주세요."
        ) from exc
    except URLError as exc:
        raise ValueError(
            "로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인하고 "
            "서버를 다시 실행해 주세요."
        ) from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            "OpenAI 응답을 원고 형식으로 해석하지 못했습니다. 다시 생성해 주세요."
        ) from exc
    generated = json.loads(openai_response_text(payload))
    if len(generated["spreads"]) != len(small_unit["spreads"]):
        raise ValueError("AI가 요청한 펼침면 수와 다른 원고를 반환했습니다.")
    for index, spread in enumerate(generated["spreads"]):
        original = small_unit["spreads"][index]
        spread.update(
            {
                "spread_number": original["spread_number"],
                "left_page": original["left_page"],
                "right_page": original["right_page"],
            }
        )
        for activity_index, activity in enumerate(spread["activities"]):
            activity["number"] = activity_index + 1
    return generated


# --- 프로토타입(static/prototype.js) 스포츠 문화 4단계 원고 생성 — 클라이언트가
# 소단원·종목·전개각도·전처리 근거 발췌문을 조립해 보내면, 서버의 OPENAI_API_KEY로
# 실제 문장을 생성해 반환한다. 근거 매칭(evidenceRecordFor 등)은 여전히 클라이언트
# JS(prototype-draft-engine.js)가 담당하고, 서버는 그 결과를 받아 집필만 한다.

def sports_culture_manuscript_schema(spread_count: int, section_count: int) -> dict:
    section_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["paragraphs"],
        "properties": {
            "paragraphs": {
                "type": "array",
                "minItems": 2,
                "maxItems": 4,
                "items": {"type": "string"},
            },
        },
    }
    spread_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "headline",
            "learning_goal",
            "opening_question",
            "deck",
            "sections",
            "visual_briefs",
        ],
        "properties": {
            "headline": {"type": "string"},
            "learning_goal": {"type": "string"},
            "opening_question": {"type": "string"},
            "deck": {"type": "string"},
            "sections": {
                "type": "array",
                "minItems": section_count,
                "maxItems": section_count,
                "items": section_schema,
            },
            "visual_briefs": {
                "type": "array",
                "minItems": 2,
                "maxItems": 3,
                "items": {"type": "string"},
            },
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["spreads"],
        "properties": {
            "spreads": {
                "type": "array",
                "minItems": spread_count,
                "maxItems": spread_count,
                "items": spread_schema,
            },
        },
    }


def call_openai_for_sports_culture_manuscript(context: dict) -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    print(
        f"[diag] OPENAI_API_KEY length={len(api_key)} "
        f"prefix={api_key[:12]!r} suffix={api_key[-6:]!r}"
        if api_key
        else "[diag] OPENAI_API_KEY is empty"
    )
    if not api_key:
        raise ValueError("OPENAI_API_KEY가 설정되지 않았습니다.")
    spreads = context.get("spreads", [])
    if not spreads:
        raise ValueError("생성할 펼침면 정보가 없습니다.")
    section_count = len(spreads[0].get("sectionTitles", [])) or 4
    page_role = context.get("page_role", "small-unit")
    if page_role == "small-unit":
        page_role_note = "지금 쓰는 지면은 소단원 본문이다. 제공된 근거는 이 소단원에 특정된 발췌문이다."
    elif page_role == "unit-intro":
        page_role_note = "지금 쓰는 지면은 대단원 도입이다. 이 대단원 전체를 여는 문제의식과 학습 방향을 제시한다."
    elif page_role == "unit-closing":
        page_role_note = "지금 쓰는 지면은 대단원 마무리다. 대단원에서 다룬 내용을 종합·정리하고 성찰을 유도한다."
    else:
        page_role_note = "지금 쓰는 지면은 대단원 안의 특별 페이지(읽을거리·인물과 진로·안전·문화 비평·프로젝트·수행평가 등)다. 본문 소단원과는 별도로, 확장된 사례나 활동을 다룬다."
    instructions = (
        "당신은 2022 개정 교육과정 고등학교 인정교과서 '스포츠 문화' 집필자다. "
        f"{page_role_note} "
        "제공된 전처리 근거 발췌문(교과서·지도서 원문 일부)을 사실적 바탕으로 삼아, "
        "실제 고등학교 교과서에 실릴 법한 자연스러운 설명문 문단을 작성한다.\n"
        "다음을 반드시 지킨다.\n"
        "1) 본문에 출판사명이나 쪽수를 직접 인용하지 않는다(예: 'OO출판 12쪽' 금지). "
        "발췌문은 사실 확인용 참고 자료일 뿐, 본문에 출처를 표시하지 않는다.\n"
        "2) 절 제목을 본문에서 그대로 되받아 설명하지 않는다(예: '이 절의 핵심은 ~이다', "
        "'~에 관한 자료는' 같은 자기 지시적 문장 금지). 절 제목은 화면에 이미 표시되므로 "
        "본문은 곧바로 내용을 설명하는 문장으로 시작한다.\n"
        "3) 제공된 근거에 없는 수치·역사적 사실·규칙을 새로 지어내지 않는다. 도입·마무리· "
        "특별 페이지처럼 여러 소단원을 종합하는 지면에서는 근거의 세부 사실을 벗어나지 "
        "않는 범위에서 자유롭게 종합·재구성해도 된다.\n"
        "4) 종목이 지정되면 그 종목의 구체적 사례로 설명하고, 종목이 없으면(sport_mode가 "
        "none) 특정 종목에 치우치지 않는 일반적인 스포츠 문화 설명으로 쓴다.\n"
        "5) style_label 값에 따라 문체를 다르게 한다: '안정·정석형'은 개념과 역사 중심의 "
        "차분한 설명문, '참신·활동형'은 질문이나 구체적 장면으로 시작해 활동을 강조하는 "
        "문체, '균형형'은 그 중간으로 쓴다.\n"
        "6) 여러 펼침면이 주어지면 펼침면마다 다른 내용과 사례를 다루고, 같은 문장이나 "
        "표현을 반복하지 않는다.\n"
        "7) 각 절은 2~4개 문단으로 자연스럽게 흐르는 설명문으로 쓴다. 문단 개수나 "
        "'정의-사례-과제' 같은 고정 틀에 얽매이지 말고, 내용에 맞는 자연스러운 전개를 "
        "선택한다.\n"
        "8) 고등학생이 읽기에 적절한 문장 길이와 어휘를 사용한다."
    )
    request_body = {
        "model": manuscript_ai_config()["model"],
        "reasoning": {"effort": "medium"},
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False),
        "max_output_tokens": 16000,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "sports_culture_manuscript",
                "strict": True,
                "schema": sports_culture_manuscript_schema(len(spreads), section_count),
            }
        },
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=50) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            message = detail
        if exc.code == HTTPStatus.UNAUTHORIZED:
            raise ValueError(
                "OpenAI API 키가 유효하지 않습니다. 등록한 키를 다시 확인해 주세요."
            ) from exc
        if exc.code == HTTPStatus.TOO_MANY_REQUESTS:
            if "quota" in message.lower() or "billing" in message.lower():
                raise ValueError(
                    "OpenAI API 사용 가능 금액이 없습니다. OpenAI API 결제 설정과 "
                    "사용 한도를 확인한 뒤 다시 시도해 주세요."
                ) from exc
            raise ValueError(
                "OpenAI API 요청이 잠시 너무 많습니다. 잠시 후 다시 시도해 주세요."
            ) from exc
        raise ValueError(f"OpenAI API 오류: {message[:500]}") from exc
    except TimeoutError as exc:
        raise ValueError(
            "OpenAI 응답 제한 시간(50초)을 초과했습니다. 잠시 후 다시 시도해 주세요."
        ) from exc
    except URLError as exc:
        raise ValueError(
            "로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인하고 "
            "서버를 다시 실행해 주세요."
        ) from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            "OpenAI 응답을 원고 형식으로 해석하지 못했습니다. 다시 생성해 주세요."
        ) from exc
    generated = json.loads(openai_response_text(payload))
    if len(generated.get("spreads", [])) != len(spreads):
        raise ValueError("AI가 요청한 펼침면 수와 다른 원고를 반환했습니다.")
    return generated


def call_prototype_sports_culture_manuscript(payload: dict) -> dict:
    small_unit = payload.get("smallUnit")
    if not isinstance(small_unit, dict) or not str(small_unit.get("smallTitle", "")).strip():
        raise ValueError("소단원 정보가 없습니다.")
    spreads = payload.get("spreads")
    if not isinstance(spreads, list) or not spreads:
        raise ValueError("생성할 펼침면 정보가 없습니다.")
    context = {
        "small_unit_title": small_unit.get("smallTitle", ""),
        "domain": small_unit.get("domain", ""),
        "middle_title": small_unit.get("middleTitle", ""),
        "standard_codes": small_unit.get("standardCodes", []),
        "page_role": payload.get("pageRole", "small-unit"),
        "primary_type": payload.get("primaryType", "theory"),
        "support_mode": payload.get("supportMode", ""),
        "carrier_sport": payload.get("carrierSport", ""),
        "sport_mode": payload.get("sportMode", "primary"),
        "style_label": payload.get("styleLabel", "균형형"),
        "thesis": payload.get("thesis", ""),
        "standard_context": payload.get("standardContext", {}),
        "sport_reference": payload.get("sportReference"),
        "spreads": spreads,
    }
    return call_openai_for_sports_culture_manuscript(context)


# --- 프로토타입(static/prototype.js) 모의심사 — 사용자가 업로드한 별도 PDF를 서버의
# OPENAI_API_KEY로 채점한다. 초등은 22개 검정기준, 고등 체육 인정도서는 20개
# 인정기준을 사용하며, 선택 프로젝트 ID로 기준을 구분한다.

def extract_pdf_text(pdf_bytes: bytes, max_chars: int = 40000) -> tuple[str, bool]:
    import pymupdf

    document = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        parts = []
        for page in document:
            text = page.get_text("text").strip()
            if text:
                parts.append(f"[{page.number + 1}쪽]\n{text}")
        full_text = "\n\n".join(parts)
    finally:
        document.close()
    if len(full_text) > max_chars:
        return full_text[:max_chars], True
    return full_text, False


def pdf_review_json_schema() -> dict:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["items", "review_note"],
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["number", "status", "evidence"],
                    "properties": {
                        "number": {"type": "integer"},
                        "status": {"type": "string", "enum": ["pass", "partial", "fail"]},
                        "evidence": {"type": "string"},
                    },
                },
            },
            "review_note": {"type": "string"},
        },
    }


def call_openai_for_pdf_review(
    pdf_text: str,
    criteria: list[tuple[str, int, int, str]] | None = None,
    standard_label: str = "검정기준",
) -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("서버에 OPENAI_API_KEY가 설정되지 않았습니다.")
    selected_criteria = criteria or TEXTBOOK_REVIEW_CRITERIA
    criteria_count = len(selected_criteria)
    criteria_lines = "\n".join(
        f"{number}. [{area}] {criterion}" for area, _weight, number, criterion in selected_criteria
    )
    instructions = (
        f"당신은 2022 개정 교육과정 체육 교과서를 {standard_label}에 따라 심사하는 심사위원이다. "
        f"주어진 교과서 원문(PDF에서 추출한 텍스트)을 아래 {criteria_count}개 {standard_label} 각각에 대해 pass(충족)/"
        "partial(부분 충족)/fail(미흡)로 판정하고, 각 판정의 근거를 원문 내용을 인용하거나 요약해 "
        "구체적으로 적어라. 원문에서 확인할 수 없는 항목은 fail로 판정하고 이유를 명시하라."
    )
    request_body = {
        "model": manuscript_ai_config()["model"],
        "instructions": instructions,
        "input": f"[{standard_label} {criteria_count}개]\n{criteria_lines}\n\n[교과서 원문]\n{pdf_text}",
        "max_output_tokens": 8000,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "pdf_review_result",
                "strict": True,
                "schema": pdf_review_json_schema(),
            }
        },
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=55) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            message = detail
        if exc.code == HTTPStatus.UNAUTHORIZED:
            raise ValueError(f"OpenAI API 키가 유효하지 않습니다: {message[:300]}") from exc
        if exc.code == HTTPStatus.TOO_MANY_REQUESTS:
            if "quota" in message.lower() or "billing" in message.lower():
                raise ValueError("OpenAI API 사용 가능 금액이 없습니다. 결제 설정과 사용 한도를 확인해 주세요.") from exc
            raise ValueError("OpenAI API 요청이 잠시 너무 많습니다. 잠시 후 다시 시도해 주세요.") from exc
        raise ValueError(f"OpenAI API 오류({exc.code}): {message[:500]}") from exc
    except TimeoutError as exc:
        raise ValueError("OpenAI 응답 제한 시간(55초)을 초과했습니다. 잠시 후 다시 시도해 주세요.") from exc
    except URLError as exc:
        raise ValueError("로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from exc
    except json.JSONDecodeError as exc:
        raise ValueError("OpenAI 응답을 해석하지 못했습니다. 다시 시도해 주세요.") from exc
    try:
        return json.loads(openai_response_text(payload))
    except json.JSONDecodeError as exc:
        raise ValueError("OpenAI 응답을 채점 결과 형식으로 해석하지 못했습니다. 다시 시도해 주세요.") from exc


def call_prototype_pdf_review(payload: dict) -> dict:
    pdf_base64 = str(payload.get("pdfBase64", ""))
    file_name = str(payload.get("fileName", "업로드한 파일"))
    if not pdf_base64:
        raise ValueError("PDF 파일이 없습니다.")
    try:
        pdf_bytes = base64.b64decode(pdf_base64)
    except (ValueError, TypeError) as exc:
        raise ValueError("PDF 파일을 읽지 못했습니다.") from exc
    try:
        pdf_text, truncated = extract_pdf_text(pdf_bytes)
    except Exception as exc:
        raise ValueError("PDF 파일을 열지 못했습니다. 손상되었거나 PDF 형식이 아닐 수 있습니다.") from exc
    if not pdf_text.strip():
        raise ValueError("PDF에서 텍스트를 추출하지 못했습니다(스캔 이미지로만 되어 있을 수 있습니다).")
    standard = prototype_review_standard(str(payload.get("catalogId", "")))
    criteria = standard["criteria"]
    result = call_openai_for_pdf_review(pdf_text, criteria, standard["label"])
    criteria_by_number = {number: (area, weight) for area, weight, number, _criterion in criteria}
    status_value = {"pass": 1.0, "partial": 0.5, "fail": 0.0}
    area_totals: dict[str, list[float]] = {}
    area_weight_by_name: dict[str, int] = {}
    for item in result.get("items", []):
        area, weight = criteria_by_number.get(item.get("number"), (None, None))
        if area is None:
            continue
        area_totals.setdefault(area, []).append(status_value.get(item.get("status"), 0.0))
        area_weight_by_name[area] = weight
    area_scores = {
        area: round(area_weight_by_name[area] * (sum(values) / len(values)), 1)
        for area, values in area_totals.items()
    }
    overall_score = round(sum(area_scores.values()), 1)
    if overall_score >= 80:
        decision = "통과"
    elif overall_score >= 60:
        decision = "보완 후 통과"
    else:
        decision = "미통과"
    return {
        "fileName": file_name,
        "items": result.get("items", []),
        "areaScores": area_scores,
        "overallScore": overall_score,
        "decision": decision,
        "reviewNote": result.get("review_note", ""),
        "truncated": truncated,
        "standard": {
            "id": standard["id"],
            "label": standard["label"],
            "count": len(criteria),
            "source": standard["source"],
            "sourceLocation": standard["source_location"],
            "criteria": [
                {"area": area, "weight": weight, "number": number, "criterion": criterion}
                for area, weight, number, criterion in criteria
            ],
        },
    }


def update_manuscript_small_unit(payload: dict, generate_with_ai: bool = False) -> dict:
    chapter_id = str(payload.get("chapter_id", ""))
    section_index = int(payload.get("section_index", -1))
    small_unit_index = int(payload.get("small_unit_index", -1))
    expected_version = requested_version(payload)
    manuscript, chapter, section, small_unit = manuscript_small_unit_selection(
        chapter_id, section_index, small_unit_index
    )
    if generate_with_ai:
        generated = call_openai_for_small_unit(chapter, section, small_unit)
        small_unit["instruction"] = generated["instruction"]
        small_unit["spreads"] = generated["spreads"]
        note = f"OpenAI로 소단원 '{small_unit['title']}' 원고 생성"
    else:
        replacement = payload.get("small_unit")
        if not isinstance(replacement, dict):
            raise ValueError("저장할 소단원 원고가 필요합니다.")
        replacement = dict(replacement)
        replacement.pop("index", None)
        section["activities"][small_unit_index] = replacement
        note = f"소단원 '{replacement.get('title', '')}' 원고 저장"
    clean = {
        key: value
        for key, value in manuscript.items()
        if key not in {"status", "version", "updated_at", "approved_at"}
    }
    stored = store_workflow_stage(
        "manuscript",
        clean,
        note,
        expected_version=expected_version,
    )
    return manuscript_small_unit_payload(
        chapter_id, section_index, small_unit_index
    ) | {"stored_version": stored["version"]}


TEXTBOOK_REVIEW_CRITERIA = [
    ("Ⅰ. 교육과정의 준수", 25, 1, "교육과정의 성격과 목표 반영"),
    ("Ⅰ. 교육과정의 준수", 25, 2, "내용 체계와 성취기준 반영"),
    ("Ⅰ. 교육과정의 준수", 25, 3, "교수·학습과 평가 반영"),
    ("Ⅰ. 교육과정의 준수", 25, 4, "포용성·창의성·주도성과 디지털 소양 반영"),
    ("Ⅰ. 교육과정의 준수", 25, 5, "신체활동 역량과 움직임 기술의 체계적 발달"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 6, "신체활동을 위한·관한·통한 학습의 종합 구현"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 7, "학년 간 중복 방지와 계열성·연계성"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 8, "학습자 수준과 성취기준 도달에 적절한 내용"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 9, "영역별 비중과 내용 제시 방법"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 10, "움직임 발달 체계에 따른 활동 위계화"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 11, "개인차를 고려한 현장 적합성과 실천 가능성"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 12, "자기주도 학습과 일상생활 적용"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 13, "사실·개념·용어·사례의 정확성"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 14, "사진·삽화·인용 자료의 최신성과 출처"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 15, "편견 없는 공정한 기술"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 16, "어문·용어·단위 표기의 정확성"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 17, "문법·어휘·표현의 정확성과 이해 용이성"),
    ("Ⅳ. 학습 활동 및 평가 지원", 25, 18, "성취기준과 연계된 창의적 활동·평가"),
    ("Ⅳ. 학습 활동 및 평가 지원", 25, 19, "수준에 적절하고 수행 가능한 충분한 활동"),
    ("Ⅳ. 학습 활동 및 평가 지원", 25, 20, "다양한 교수·학습 과정과 평가 방법"),
    ("Ⅳ. 학습 활동 및 평가 지원", 25, 21, "참여와 성장을 지원하는 과정 중심 활동"),
    ("Ⅳ. 학습 활동 및 평가 지원", 25, 22, "디지털·온오프라인 연계 활동 지원"),
]


SPORTS_CULTURE_RECOGNITION_CRITERIA = [
    ("Ⅰ. 교육과정의 준수", 20, 1, "교육과정에 제시된 ‘성격’과 ‘목표’를 충실히 반영하였는가?"),
    ("Ⅰ. 교육과정의 준수", 20, 2, "교육과정에 제시된 ‘내용 체계’와 ‘성취기준’을 충실히 반영하였는가?"),
    ("Ⅰ. 교육과정의 준수", 20, 3, "교육과정에 제시된 ‘교수·학습’을 충실히 반영하였는가?"),
    ("Ⅰ. 교육과정의 준수", 20, 4, "교육과정에 제시된 ‘평가’를 충실히 반영하였는가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 5, "내용의 수준과 범위 및 학습량이 적절한가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 6, "내용 요소 간 위계가 있고, 연계성, 통합성, 균형성을 가지고 있는가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 7, "일상생활과 연계되어 흥미와 관심을 유발할 수 있도록 다양한 주제, 제재, 소재 등을 선정하였는가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 8, "학생들이 배운 내용을 다양한 방식으로 일상생활에 적용함으로써 역량 및 기초 소양 함양이 가능하도록 학습 내용을 조직하였는가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 9, "학생의 자기주도적 학습이 촉진될 수 있도록 학습 내용을 선정 및 조직하였는가?"),
    ("Ⅱ. 내용의 선정 및 조직", 30, 10, "단원의 전개 및 구성 체제가 학습에 효과적인가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 11, "사실, 개념, 용어, 이론 등은 객관적이고 정확한가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 12, "평가 문항의 질문과 답에 오류는 없는가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 13, "사진, 삽화, 통계, 도표 및 각종 자료 등은 공신력 있는 최근의 것으로서 출처를 분명히 제시하고 있으며, 해당 내용에 대한 설명으로 적합한가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 14, "한글, 한자, 로마자, 인명, 지명, 각종 용어, 통계, 도표, 지도, 계량 단위 등의 표기가 정확하며, 편찬상의 유의점에 제시된 기준을 충실히 따랐는가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 15, "문법 오류, 부적절한 어휘 등 표현상의 오류가 없고 정확한가?"),
    ("Ⅲ. 내용의 정확성 및 공정성", 20, 16, "특정 지역, 국가, 인종, 민족, 문화, 계층, 성, 종교, 직업, 집단, 인물, 기관, 상품 등을 비방·왜곡 또는 옹호하지 않았으며, 집필자 개인의 편견 없이 공정하게 기술하였는가?"),
    ("Ⅳ. 학습 활동 및 평가 지원", 30, 17, "학습 활동 및 평가 과제는 교과 내용과 유기적으로 연계되어 있는가?"),
    ("Ⅳ. 학습 활동 및 평가 지원", 30, 18, "학습 활동 및 평가 과제가 학생의 수준에 적절하며, 수행이 가능한가?"),
    ("Ⅳ. 학습 활동 및 평가 지원", 30, 19, "학생의 역량 및 기초 소양 함양이 가능하도록 다양한 학습 활동 및 평가 과제를 제시하였는가?"),
    ("Ⅳ. 학습 활동 및 평가 지원", 30, 20, "학습의 과정을 중시하고 학생의 참여와 성장을 지원하는 학습 활동 및 평가 과제를 제시하였는가?"),
]


def prototype_review_standard(catalog_id: str) -> dict:
    if catalog_id.startswith("high-"):
        return {
            "id": "high-physical-education-recognition",
            "label": "인정기준",
            "source": "(서울교육연구정보원) 2022 개정 교육과정 교육부 장관 고시 인정도서 편찬상의 유의점 및 인정기준",
            "source_location": "고등학교 체육 · 스포츠 문화 <인정 기준> (HWP 원본 고등학교 체육 20~45쪽 범위에서 소제목 대조)",
            "criteria": SPORTS_CULTURE_RECOGNITION_CRITERIA,
        }
    if catalog_id == "middle-pe":
        raise ValueError("중등 체육 모의심사 기준은 아직 공식자료와 연결되지 않았습니다.")
    return {
        "id": "elementary-physical-education-screening",
        "label": "검정기준",
        "source": "2022 개정 교육과정에 따른 체육과 편찬상의 유의점 및 검정기준",
        "source_location": "PDF 원본 20~21쪽 · 22개 검정기준",
        "criteria": TEXTBOOK_REVIEW_CRITERIA,
    }


def manuscript_review_page_entries(manuscript: dict) -> list[tuple[int, str, dict]]:
    entries: list[tuple[int, str, dict]] = []
    for chapter in manuscript["chapters"]:
        for opener_page in chapter.get("opener_pages", []):
            entries.append(
                (
                    chapter["grade"],
                    chapter["id"],
                    {
                        "page_number": opener_page,
                        "body": chapter.get("opening", ""),
                        "activities": [],
                        "wrap_up": "",
                        "page_role": "대단원 도입",
                    },
                )
            )
        for section in chapter["sections"]:
            for small_unit in section.get("activities", []):
                for spread in small_unit.get("spreads", []):
                    page_view = {
                        "body": spread.get("intro", ""),
                        "activities": spread.get("activities", []),
                        "wrap_up": spread.get("wrap_up", ""),
                        "page_role": spread.get("role", ""),
                    }
                    for page_number in (spread["left_page"], spread["right_page"]):
                        entries.append(
                            (
                                chapter["grade"],
                                chapter["id"],
                                {**page_view, "page_number": page_number},
                            )
                        )
    return entries


def build_review_payload(review_options: dict | None = None) -> dict:
    outline = workflow_stage_record("outline")
    design = workflow_stage_record("design")
    manuscript = workflow_stage_record("manuscript")
    outline_summary = workflow_stage_summary("outline", outline)
    manuscript_summary = workflow_stage_summary("manuscript", manuscript)
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
    review_options = review_options or {}
    requested_mode = str(review_options.get("mode", "all"))
    requested_grade = int(review_options.get("grade", 3))
    requested_start = max(1, int(review_options.get("start_page", 1)))
    requested_end = max(requested_start, int(review_options.get("end_page", 120)))
    page_entries = manuscript_review_page_entries(manuscript)
    if requested_mode == "range":
        selected_entries = [
            entry
            for entry in page_entries
            if entry[0] == requested_grade
            and requested_start <= entry[2]["page_number"] <= requested_end
        ]
        scope_label = f"{requested_grade}학년 {requested_start}~{requested_end}쪽"
        scope_grades = [requested_grade]
    elif requested_mode == "grade":
        selected_entries = [entry for entry in page_entries if entry[0] == requested_grade]
        scope_label = f"{requested_grade}학년 전체"
        scope_grades = [requested_grade]
    else:
        requested_mode = "all"
        selected_entries = page_entries
        scope_label = "3~6학년 전체 원고"
        scope_grades = [3, 4, 5, 6]
    if not selected_entries:
        raise ValueError("선택한 심사 범위에 원고 쪽이 없습니다.")
    all_pages = [entry[2] for entry in selected_entries]
    empty_bodies = sum(not page.get("body", "").strip() for page in all_pages)
    insufficient_activities = sum(
        page.get("page_role") != "대단원 도입"
        and not 2 <= len(page.get("activities", [])) <= 3
        for page in all_pages
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
    if not manuscript_summary["page_count_valid"]:
        findings.append(
            {
                "severity": "critical",
                "category": "원고 분량",
                "location": "전체 원고",
                "message": (
                    f"심사 원고가 {manuscript_summary['generated_pages']}쪽이며 "
                    f"목표는 {manuscript_summary['target_pages']}쪽입니다."
                ),
                "suggestion": "목차에서 지정한 쪽수만큼 쪽별 원고를 다시 생성하세요.",
            }
        )
    if insufficient_activities:
        findings.append(
            {
                "severity": "major",
                "category": "학습 활동",
                "location": "쪽별 원고",
                "message": f"활동이 2개 미만인 쪽이 {insufficient_activities}쪽입니다.",
                "suggestion": "각 쪽에 수행 가능한 활동과 방법을 2개 이상 제시하세요.",
            }
        )

    structure_ready = (
        bool(all_pages)
        and
        standards_count == 49
        and manuscript_summary["page_count_valid"]
        and not empty_bodies
        and not insufficient_activities
    )
    manual_numbers = {13, 14, 15, 16, 17}
    criteria_results = []
    for area, area_weight, number, criterion in TEXTBOOK_REVIEW_CRITERIA:
        if number in manual_numbers:
            status = "manual"
            evidence = "원문·이미지·출처·어문 규정과의 인적 대조가 필요합니다."
        elif structure_ready and not missing_safety:
            status = "pass"
            evidence = (
                f"{manuscript_summary['generated_pages']}쪽 원고, "
                f"선택 범위 {len(all_pages)}쪽, 성취기준 {standards_count}개 연결을 확인했습니다."
            )
        else:
            status = "supplement"
            evidence = "분량·본문·활동·안전 구성의 보완이 필요합니다."
        criteria_results.append(
            {
                "number": number,
                "area": area,
                "area_weight": area_weight,
                "criterion": criterion,
                "status": status,
                "evidence": evidence,
                "source_page": 20 if number <= 18 else 21,
            }
        )

    score_1 = 25 if standards_count == 49 else 15
    score_2 = 30 if manuscript_summary["page_count_valid"] and not empty_bodies else 18
    score_3 = 10  # 20점 중 자동 확인 10점, 나머지는 원문·시각자료 인적 대조
    score_4 = 25 if all_pages and not insufficient_activities else 15
    scores = {
        "Ⅰ. 교육과정의 준수": score_1,
        "Ⅱ. 내용의 선정 및 조직": score_2,
        "Ⅲ. 내용의 정확성 및 공정성": score_3,
        "Ⅳ. 학습 활동 및 평가 지원": score_4,
    }
    overall = sum(scores.values())
    return {
        "title": "독립 모의심사 결과",
        "review_note": (
            "앞 단계의 선택 근거와 선호 점수는 제외하고, 초등 체육 교과서 검정기준 "
            "22개 항목으로 원고를 별도 심사한다. "
            "내용 정확성·공정성 영역은 자동 판정으로 확정하지 않고 인적 대조 대상으로 표시한다."
        ),
        "criteria_source": {
            "document_id": "체육_2022편찬상의_유의점_및_검정기준",
            "pdf_pages": "20~21",
            "item_count": 22,
            "total_weight": 100,
        },
        "review_scope": {
            "mode": requested_mode,
            "label": scope_label,
            "pages_reviewed": len(all_pages),
            "grades": scope_grades,
            "grade": requested_grade,
            "start_page": requested_start,
            "end_page": requested_end,
        },
        "source_versions": {
            "outline": outline["version"],
            "design": design["version"],
            "manuscript": manuscript["version"],
        },
        "reviewed_at": utc_now(),
        "overall_score": overall,
        "decision": "보완 후 통과" if findings else "통과",
        "scores": scores,
        "criteria_results": criteria_results,
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
        small_units = [
            activity
            for section in sections
            for activity in section.get("activities", [])
        ]
        spreads = [
            spread
            for activity in small_units
            for spread in activity.get("spreads", [])
        ]
        complete = sum(
            bool(activity.get("instruction", "").strip())
            and len(activity.get("spreads", [])) * 2 == activity.get("target_pages")
            and all(
                spread.get("title", "").strip()
                and spread.get("intro", "").strip()
                and 2 <= len(spread.get("activities", [])) <= 3
                and spread.get("wrap_up", "").strip()
                for spread in activity.get("spreads", [])
            )
            for activity in small_units
        )
        target_pages = sum(chapter.get("target_pages", 0) for chapter in payload["chapters"])
        generated_pages = sum(
            len(chapter.get("opener_pages", []))
            + sum(
                len(activity.get("spreads", [])) * 2
                for section in chapter["sections"]
                for activity in section.get("activities", [])
            )
            for chapter in payload["chapters"]
        )
        return {
            "chapters": len(payload["chapters"]),
            "sections": len(sections),
            "small_units": len(small_units),
            "complete_small_units": complete,
            "target_pages": target_pages,
            "generated_pages": generated_pages,
            "spreads": len(spreads),
            "page_count_valid": target_pages == generated_pages,
            "valid": (
                bool(payload["chapters"])
                and complete == len(small_units)
                and target_pages == generated_pages
            ),
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
                for activity in section.get("activities", []):
                    target_pages = activity.get("target_pages")
                    spreads = activity.get("spreads")
                    if not isinstance(target_pages, int) or target_pages < 1:
                        raise ValueError("소단원 목표 쪽수는 1 이상의 정수여야 합니다.")
                    if (
                        not isinstance(spreads, list)
                        or len(spreads) * 2 != target_pages
                    ):
                        raise ValueError("소단원 펼침면이 지정 쪽수와 일치하지 않습니다.")
                    for spread in spreads:
                        if not isinstance(spread.get("intro"), str) or not isinstance(
                            spread.get("activities"), list
                        ):
                            raise ValueError("펼침면 도입과 활동 구성이 필요합니다.")
                        if not 2 <= len(spread["activities"]) <= 3:
                            raise ValueError("각 펼침면에는 활동이 2~3개 필요합니다.")
    elif stage_key == "review":
        if not isinstance(clean.get("scores"), dict) or not isinstance(
            clean.get("findings"), list
        ):
            raise ValueError("모의심사 결과가 올바르지 않습니다.")
    else:
        raise KeyError("지원하지 않는 제작 단계입니다.")
    return clean


def store_workflow_stage(
    stage_key: str,
    payload: dict,
    change_note: str,
    status: str = "draft",
    expected_version: int | None = None,
) -> dict:
    clean = validate_workflow_payload(stage_key, payload)
    now = utc_now()
    with connect_db() as db:
        current = db.execute(
            "SELECT version FROM workflow_stages WHERE stage_key = ?", (stage_key,)
        ).fetchone()
        current_version = int(current["version"])
        ensure_current_version(current_version, expected_version)
        next_version = current_version + 1
        encoded = json.dumps(clean, ensure_ascii=False)
        updated = db.execute(
            """
            UPDATE workflow_stages
            SET payload = ?, status = ?, version = ?, updated_at = ?, approved_at = ?
            WHERE stage_key = ? AND version = ?
            """,
            (
                encoded,
                status,
                next_version,
                now,
                now if status == "approved" else None,
                stage_key,
                current_version,
            ),
        )
        if updated.rowcount != 1:
            raise VersionConflictError(
                "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
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
    expected_version = requested_version(payload)
    change_note = payload.pop("change_note", "웹 편집 내용 저장")
    if not isinstance(change_note, str) or len(change_note) > 200:
        raise ValueError("변경 메모는 200자 이내여야 합니다.")
    return store_workflow_stage(
        stage_key,
        payload,
        change_note.strip() or "웹 편집 내용 저장",
        expected_version=expected_version,
    )


def regenerate_workflow_stage(
    stage_key: str,
    generation_options: dict | None = None,
) -> dict:
    generators = {
        "outline": generated_outline_payload,
        "design": generated_design_payload,
        "manuscript": generated_manuscript_payload,
        "review": build_review_payload,
    }
    payload = (
        build_review_payload(generation_options)
        if stage_key == "review"
        else generators[stage_key]()
    )
    return store_workflow_stage(
        stage_key,
        payload,
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
        if (
            status == "approved"
            and previous["integrity_status"] not in {"verified", "processed_only"}
        ):
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


def export_field_label(key: str) -> str:
    return EXPORT_FIELD_LABELS.get(key, key.replace("_", " ").strip())


def export_item_title(item: dict, index: int) -> str:
    for key in ("title", "name", "code", "subdomain", "domain", "grade"):
        value = item.get(key)
        if isinstance(value, (str, int)) and str(value).strip():
            return str(value).strip()
    return f"항목 {index}"


def payload_export_blocks(
    value: object,
    label: str = "",
    level: int = 2,
) -> list[tuple[str, object, int]]:
    blocks: list[tuple[str, object, int]] = []
    heading_level = min(max(level, 1), 4)
    if isinstance(value, dict):
        if label:
            blocks.append(("heading", label, heading_level))
        scalar_rows = [["항목", "내용"]]
        for key, child in value.items():
            if key in EXPORT_METADATA_FIELDS or child in (None, "", [], {}):
                continue
            child_label = export_field_label(str(key))
            if isinstance(child, (dict, list)):
                blocks.extend(
                    payload_export_blocks(
                        child,
                        child_label,
                        min(heading_level + 1, 4),
                    )
                )
            else:
                rendered = "예" if child is True else "아니요" if child is False else str(child)
                scalar_rows.append([child_label, rendered])
        if len(scalar_rows) > 1:
            blocks.insert(1 if label else 0, ("table", scalar_rows, heading_level))
        return blocks
    if isinstance(value, list):
        if label:
            blocks.append(("heading", label, heading_level))
        primitive_rows = [["번호", "내용"]]
        for index, item in enumerate(value, start=1):
            if isinstance(item, dict):
                blocks.extend(
                    payload_export_blocks(
                        item,
                        export_item_title(item, index),
                        min(heading_level + 1, 4),
                    )
                )
            elif isinstance(item, list):
                blocks.extend(
                    payload_export_blocks(
                        item,
                        f"항목 {index}",
                        min(heading_level + 1, 4),
                    )
                )
            elif item not in (None, ""):
                primitive_rows.append([str(index), str(item)])
        if len(primitive_rows) > 1:
            blocks.append(("table", primitive_rows, heading_level))
        return blocks
    if value not in (None, ""):
        blocks.append(("paragraph", f"{label}: {value}" if label else str(value), heading_level))
    return blocks


def export_scope_data(scope: str) -> list[tuple[str, dict]]:
    if scope == "analysis":
        return [
            (
                EXPORT_SCOPE_LABELS[scope],
                {
                    **analysis_record(),
                    "standards": curriculum_standard_rows(),
                },
            )
        ]
    loaders = {
        "direction": direction_record,
        "allocation": allocation_record,
        "content": content_record,
        "outline": lambda: workflow_stage_record("outline"),
        "design": lambda: workflow_stage_record("design"),
        "manuscript": lambda: workflow_stage_record("manuscript"),
        "review": lambda: workflow_stage_record("review"),
    }
    if scope in loaders:
        return [(EXPORT_SCOPE_LABELS[scope], loaders[scope]())]
    if scope == "all":
        sections = export_scope_data("analysis")
        for child_scope in (
            "direction",
            "allocation",
            "content",
            "outline",
            "design",
            "manuscript",
            "review",
        ):
            sections.extend(export_scope_data(child_scope))
        return sections
    raise ValueError("지원하지 않는 HWPX 출력 범위입니다.")


def export_hwpx(scope: str) -> tuple[bytes, str]:
    if scope not in EXPORT_SCOPE_LABELS:
        raise ValueError("지원하지 않는 HWPX 출력 범위입니다.")
    project = project_payload()
    title = f"{project.get('name', '교과서 제작')} · {EXPORT_SCOPE_LABELS[scope]}"
    blocks: list[tuple[str, str, int]] = [
        ("paragraph", f"교과: {project.get('subject', '')}", 1),
        ("paragraph", f"교육과정: {project.get('curriculum_version', '')}", 1),
        ("paragraph", f"생성 시각: {utc_now()}", 1),
    ]
    for section_title, payload in export_scope_data(scope):
        blocks.append(("heading", section_title, 1))
        blocks.extend(payload_export_blocks(payload, level=2))
    content = build_hwpx(title, blocks)
    date_stamp = datetime.now().strftime("%Y%m%d")
    filename = f"{EXPORT_SCOPE_LABELS[scope].replace('·', '_')}_{date_stamp}.hwpx"
    return content, filename


def export_manuscript_small_unit_hwpx(
    chapter_id: str,
    section_index: int,
    small_unit_index: int,
) -> tuple[bytes, str]:
    payload = manuscript_small_unit_payload(chapter_id, section_index, small_unit_index)
    chapter = payload["chapter"]
    section = payload["section"]
    small_unit = {key: value for key, value in payload["small_unit"].items() if key != "index"}
    project = project_payload()
    unit_title = small_unit.get("title") or "소단원 원고"
    title = f"{project.get('name', '교과서 제작')} · {unit_title}"
    blocks: list[tuple[str, object, int]] = [
        ("paragraph", f"교과: {project.get('subject', '')}", 1),
        ("paragraph", f"대단원: {chapter.get('large_unit_title', '')} · {chapter.get('subtitle', '')}", 1),
        ("paragraph", f"중단원: {section.get('title', '')}", 1),
        ("paragraph", f"생성 시각: {utc_now()}", 1),
    ]
    blocks.append(("heading", unit_title, 1))
    blocks.extend(payload_export_blocks(small_unit, level=2))
    content = build_hwpx(title, blocks)
    date_stamp = datetime.now().strftime("%Y%m%d")
    safe_title = unit_title.replace("/", "_").replace("·", "_").strip() or "소단원"
    filename = f"{safe_title}_원고초안_{date_stamp}.hwpx"
    return content, filename


class StudioHandler(BaseHTTPRequestHandler):
    current_user: dict | None = None

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

    def send_download(
        self,
        content: bytes,
        filename: str,
        content_type: str,
    ) -> None:
        ascii_name = "textbook-studio-export.hwpx"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Disposition",
            f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename)}",
        )
        self.end_headers()
        self.wfile.write(content)

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

    def require_user(self) -> dict:
        self.current_user = authenticated_user(
            self.headers.get("Authorization", "")
        )
        return self.current_user

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"status": "ok", "time": utc_now()})
            return
        if parsed.path == "/api/auth/config":
            self.send_json(auth_config())
            return
        if parsed.path.startswith("/api/"):
            try:
                self.require_user()
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
                return
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
                return
        if parsed.path == "/api/bootstrap":
            self.send_json(bootstrap_payload())
            return
        if parsed.path == "/api/editors":
            try:
                require_owner(self.current_user)
                self.send_json(
                    {"editors": editor_rows(), "current_user": self.current_user}
                )
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            return
        if parsed.path == "/api/export/hwpx":
            try:
                scope = parse_qs(parsed.query).get("scope", ["all"])[0]
                content, filename = export_hwpx(scope)
                self.send_download(content, filename, "application/hwp+zip")
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
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
        if parsed.path == "/api/manuscript/bootstrap":
            self.send_json(manuscript_catalog_record())
            return
        if parsed.path == "/api/manuscript/small-unit":
            query = parse_qs(parsed.query)
            try:
                self.send_json(
                    manuscript_small_unit_payload(
                        query.get("chapter_id", [""])[0],
                        int(query.get("section_index", ["-1"])[0]),
                        int(query.get("small_unit_index", ["-1"])[0]),
                    )
                )
            except (KeyError, ValueError) as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/manuscript/small-unit/export/hwpx":
            query = parse_qs(parsed.query)
            try:
                content, filename = export_manuscript_small_unit_hwpx(
                    query.get("chapter_id", [""])[0],
                    int(query.get("section_index", ["-1"])[0]),
                    int(query.get("small_unit_index", ["-1"])[0]),
                )
                self.send_download(content, filename, "application/hwp+zip")
            except (KeyError, ValueError) as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        for stage_key in WORKFLOW_STAGE_ORDER:
            if parsed.path == f"/api/{stage_key}/bootstrap":
                self.send_json(workflow_bootstrap_payload(stage_key))
                return
        self.serve_static(parsed.path)

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        try:
            self.require_user()
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
            if parsed.path == "/api/manuscript/small-unit":
                self.send_json(update_manuscript_small_unit(payload))
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
        except AuthenticationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
        except AuthorizationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
        except VersionConflictError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.CONFLICT)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - last-resort boundary
            self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/prototype/review":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json({"result": call_prototype_pdf_review(self.read_json())})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/sports-culture-manuscript":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json(
                    {"result": call_prototype_sports_culture_manuscript(self.read_json())}
                )
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        try:
            self.require_user()
            if parsed.path == "/api/editors":
                require_owner(self.current_user)
                self.send_json({"editor": add_editor(self.read_json())})
                return
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
            if parsed.path == "/api/manuscript/small-unit/generate":
                self.send_json(
                    update_manuscript_small_unit(
                        self.read_json(),
                        generate_with_ai=True,
                    )
                )
                return
            for stage_key in WORKFLOW_STAGE_ORDER:
                if parsed.path == f"/api/{stage_key}/generate":
                    generation_options = (
                        self.read_json() if stage_key == "review" else None
                    )
                    stage = regenerate_workflow_stage(stage_key, generation_options)
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
        except AuthenticationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
        except AuthorizationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
        except VersionConflictError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.CONFLICT)
        except ValueError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
        except Exception as exc:  # pragma: no cover - last-resort boundary
            self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        try:
            self.require_user()
            prefix = "/api/editors/"
            if parsed.path.startswith(prefix):
                require_owner(self.current_user)
                email = unquote(parsed.path[len(prefix) :])
                self.send_json({"editor": deactivate_editor(email)})
                return
            self.send_json({"error": "API 경로를 찾을 수 없습니다."}, HTTPStatus.NOT_FOUND)
        except KeyError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
        except AuthenticationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
        except AuthorizationError as exc:
            self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
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
            "/login": "login.html",
            "/reset-password": "reset-password.html",
            "/editors": "editors.html",
            "/export": "export.html",
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
