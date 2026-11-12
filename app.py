from __future__ import annotations

import argparse
import base64
import hashlib
import json
import mimetypes
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.client import HTTPException as HttpClientError
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, unquote, urlparse
from urllib.request import Request, urlopen

import designcraft_export
from database import connect_database
from hwpx_export import build_hwpx
from table_export import build_docx, build_xlsx


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

            CREATE TABLE IF NOT EXISTS prototype_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                payload TEXT NOT NULL,
                version INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS editor_accounts (
                email TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT 'editor',
                active INTEGER NOT NULL DEFAULT 1,
                password_hash TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS auth_sessions (
                token TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
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


class AuthenticationError(Exception):
    pass


class AuthorizationError(Exception):
    pass


class VersionConflictError(Exception):
    pass


def ensure_current_version(current_version: int, expected_version: int | None) -> None:
    if expected_version is not None and current_version != expected_version:
        raise VersionConflictError(
            "다른 편집자가 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 수정해 주세요."
        )


SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60  # 30 days
PASSWORD_HASH_ITERATIONS = 260_000


def auth_config() -> dict:
    owner_email = os.environ.get("STUDIO_OWNER_EMAIL", "").strip()
    return {"enabled": bool(owner_email)}


def ensure_auth_tables(db) -> None:
    if "password_hash" not in db.table_columns("editor_accounts"):
        db.execute(
            "ALTER TABLE editor_accounts ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''"
        )
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS auth_sessions (
            token TEXT PRIMARY KEY,
            email TEXT NOT NULL,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL
        );
        """
    )
    db.commit()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_HASH_ITERATIONS
    ).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    candidate = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt.encode("utf-8"), PASSWORD_HASH_ITERATIONS
    ).hex()
    return secrets.compare_digest(candidate, digest)


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
    token = authorization_header.removeprefix("Bearer ").strip()
    if not token:
        raise AuthenticationError("로그인이 필요합니다.")
    with connect_db() as db:
        ensure_auth_tables(db)
        session = db.execute(
            "SELECT email, expires_at FROM auth_sessions WHERE token = ?", (token,)
        ).fetchone()
        if session is None or session["expires_at"] < utc_now():
            raise AuthenticationError("로그인이 만료되었거나 유효하지 않습니다.")
        account = db.execute(
            "SELECT email, role, active FROM editor_accounts WHERE email = ?",
            (session["email"],),
        ).fetchone()
        if account is None or not bool(account["active"]):
            raise AuthorizationError("이 프로젝트의 편집자로 등록되지 않았습니다.")
        return {"id": account["email"], "email": account["email"], "role": account["role"]}


def login_user(payload: dict) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not email or not password:
        raise ValueError("이메일과 비밀번호를 입력하세요.")
    owner_email = os.environ.get("STUDIO_OWNER_EMAIL", "").strip().lower()

    with connect_db() as db:
        ensure_auth_tables(db)
        account = db.execute(
            "SELECT email, role, active, password_hash FROM editor_accounts WHERE email = ?",
            (email,),
        ).fetchone()
        now = utc_now()
        if account is None:
            if not owner_email or email != owner_email:
                raise AuthenticationError("등록되지 않은 계정입니다. 관리자에게 문의하세요.")
            db.execute(
                """
                INSERT INTO editor_accounts (
                    email, user_id, role, active, password_hash, created_at, updated_at
                ) VALUES (?, '', 'owner', 1, ?, ?, ?)
                """,
                (email, hash_password(password), now, now),
            )
            db.commit()
            role = "owner"
        elif not bool(account["active"]):
            raise AuthorizationError("이 프로젝트의 편집자로 등록되지 않았습니다.")
        elif not account["password_hash"]:
            # Invited but never logged in yet: this attempt sets the password.
            db.execute(
                "UPDATE editor_accounts SET password_hash = ?, updated_at = ? WHERE email = ?",
                (hash_password(password), now, email),
            )
            db.commit()
            role = account["role"]
        else:
            if not verify_password(password, account["password_hash"]):
                raise AuthenticationError("이메일 또는 비밀번호가 올바르지 않습니다.")
            role = account["role"]

        token = secrets.token_hex(32)
        expires_at_dt = datetime.now(timezone.utc).timestamp() + SESSION_LIFETIME_SECONDS
        db.execute(
            "INSERT INTO auth_sessions (token, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (token, email, now, datetime.fromtimestamp(expires_at_dt, tz=timezone.utc).isoformat()),
        )
        db.commit()
        return {"access_token": token, "expires_at": int(expires_at_dt), "email": email, "role": role}


def logout_user(authorization_header: str) -> None:
    if not authorization_header.startswith("Bearer "):
        return
    token = authorization_header.removeprefix("Bearer ").strip()
    if not token:
        return
    with connect_db() as db:
        ensure_auth_tables(db)
        db.execute("DELETE FROM auth_sessions WHERE token = ?", (token,))
        db.commit()


def change_password(user: dict, payload: dict) -> None:
    current_password = str(payload.get("current_password", ""))
    new_password = str(payload.get("new_password", ""))
    if len(new_password) < 8:
        raise ValueError("새 비밀번호는 8자 이상이어야 합니다.")
    with connect_db() as db:
        ensure_auth_tables(db)
        account = db.execute(
            "SELECT password_hash FROM editor_accounts WHERE email = ?", (user["email"],)
        ).fetchone()
        if account is None or not verify_password(current_password, account["password_hash"]):
            raise AuthenticationError("현재 비밀번호가 올바르지 않습니다.")
        db.execute(
            "UPDATE editor_accounts SET password_hash = ?, updated_at = ? WHERE email = ?",
            (hash_password(new_password), utc_now(), user["email"]),
        )
        db.commit()


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
        ensure_auth_tables(db)
        db.execute(
            """
            INSERT INTO editor_accounts (
                email, user_id, role, active, password_hash, created_at, updated_at
            ) VALUES (?, '', 'editor', 1, '', ?, ?)
            ON CONFLICT(email) DO UPDATE SET
                active = 1,
                updated_at = excluded.updated_at
            """,
            (email, now, now),
        )
        db.commit()
    return next(row for row in editor_rows() if row["email"] == email)


def reset_editor_password(email: str) -> dict:
    normalized = email.strip().lower()
    with connect_db() as db:
        ensure_auth_tables(db)
        account = db.execute(
            "SELECT email FROM editor_accounts WHERE email = ?", (normalized,)
        ).fetchone()
        if account is None:
            raise KeyError("편집자를 찾을 수 없습니다.")
        db.execute(
            "UPDATE editor_accounts SET password_hash = '', updated_at = ? WHERE email = ?",
            (utc_now(), normalized),
        )
        db.execute("DELETE FROM auth_sessions WHERE email = ?", (normalized,))
        db.commit()
    return next(row for row in editor_rows() if row["email"] == normalized)


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


# 각 컴퓨터에서 도구를 실행하는 사람이 자기 OpenAI 키를 화면에서 한 번 넣으면, 그 컴퓨터의
# .env.local에 저장돼 서버를 다시 켜도 계속 쓴다. 키 값은 화면으로 돌려주지 않고(끝 4자리만),
# 저장·삭제는 이 컴퓨터(루프백)에서 온 요청만 받는다. 배포본(Vercel)은 파일을 쓸 수 없으므로
# 관리자가 환경 변수로 설정한다.
OPENAI_KEY_NAME = "OPENAI_API_KEY"


def openai_key_status() -> dict:
    env_value = os.environ.get(OPENAI_KEY_NAME, "").strip()
    value = secret_environment_value(OPENAI_KEY_NAME)
    return {
        "configured": bool(value),
        "source": "environment" if env_value else ("local-file" if value else ""),
        "masked": f"····{value[-4:]}" if value else "",
        "editable": not os.environ.get("VERCEL"),
    }


def verify_openai_key(key: str) -> str:
    """키로 모델 목록을 조회해 본다(과금 없음). 반환: ok · invalid · unverified."""
    request = Request(
        "https://api.openai.com/v1/models",
        headers={"Authorization": f"Bearer {key}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=15) as response:
            return "ok" if response.status == 200 else "unverified"
    except HTTPError as exc:
        return "invalid" if exc.code in (401, 403) else "unverified"
    except (URLError, TimeoutError, OSError, HttpClientError):
        return "unverified"


def save_openai_key(key: str | None, verify=verify_openai_key) -> dict:
    if os.environ.get("VERCEL"):
        raise ValueError("배포본에서는 키를 저장할 수 없습니다. 관리자가 환경 변수로 설정합니다.")
    key = (key or "").strip()
    verification = ""
    if key:
        if not key.startswith("sk-") or re.search(r"\s", key) or len(key) < 20:
            raise ValueError("OpenAI API 키 형식이 아닙니다. 'sk-'로 시작하는 키 전체를 붙여 넣어 주세요.")
        verification = verify(key)
        if verification == "invalid":
            raise ValueError("OpenAI가 이 키를 거부했습니다. 키를 다시 확인해 주세요.")
    local_env = APP_DIR / ".env.local"
    lines = local_env.read_text(encoding="utf-8-sig").splitlines() if local_env.is_file() else []
    kept = [line for line in lines if line.partition("=")[0].strip() != OPENAI_KEY_NAME]
    if key:
        kept.append(f"{OPENAI_KEY_NAME}={key}")
    local_env.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")
    return {**openai_key_status(), "verification": verification}


# ── 작업 데이터 폴더 ──
# 작업 상태·초고·시안 그림·배치(studio.db)와 조판 결과 파일을 한 폴더에 둔다. 이 폴더만 다른 컴퓨터로 복사해
# 거기서 같은 폴더를 고르면 그대로 이어서 볼 수 있다(폴더 위치·드라이브가 달라도 됨). 위치는 컴퓨터마다
# .env.local의 TEXTBOOK_STUDIO_DATA_DIR에 적어 두고, 서버를 켤 때 읽는다(브라우저 폴더 권한이 필요 없다).
DATA_DIR_KEY = "TEXTBOOK_STUDIO_DATA_DIR"
DATA_SUBFOLDER = "_도구데이터"
BUILD_SUBFOLDER = "조판결과"


def configured_data_dir() -> Path | None:
    value = secret_environment_value(DATA_DIR_KEY)
    return Path(value) if value else None


def apply_data_dir(folder: Path) -> None:
    global DB_PATH
    DB_PATH = (folder / "studio.db").resolve()
    os.environ["DESIGNCRAFT_OUTPUT_DIR"] = str((folder / BUILD_SUBFOLDER).resolve())


def data_folder_status() -> dict:
    folder = configured_data_dir()
    return {
        "path": str(folder) if folder else "",
        "custom": bool(folder),
        "database": str(DB_PATH),
        "builds": str(designcraft_export.output_root(APP_DIR)),
    }


def write_local_setting(name: str, value: str) -> None:
    local_env = APP_DIR / ".env.local"
    lines = local_env.read_text(encoding="utf-8-sig").splitlines() if local_env.is_file() else []
    kept = [line for line in lines if line.partition("=")[0].strip() != name]
    if value:
        kept.append(f"{name}={value}")
    local_env.write_text("\n".join(kept) + ("\n" if kept else ""), encoding="utf-8")


def pick_folder_dialog(initial: str = "") -> str:
    """이 컴퓨터 화면에 폴더 고르기 창을 띄운다(서버와 따로 도는 작은 파이썬 프로세스)."""
    script = (
        "import sys, tkinter\n"
        "from tkinter import filedialog\n"
        "root = tkinter.Tk(); root.withdraw(); root.attributes('-topmost', True)\n"
        "path = filedialog.askdirectory(title='작업 데이터를 둘 폴더를 고르세요 (예: 테스트 연결폴더)', initialdir=sys.argv[1] or None, mustexist=True, parent=root)\n"
        "root.destroy()\n"
        "sys.stdout.buffer.write((path or '').encode('utf-8'))\n"
    )
    completed = subprocess.run([sys.executable, "-c", script, initial], capture_output=True, timeout=600)
    return completed.stdout.decode("utf-8", errors="replace").strip()


def data_dir_for(picked: Path) -> Path:
    """고른 폴더 안의 _도구데이터 폴더를 쓴다(고른 폴더가 이미 데이터 폴더면 그대로)."""
    if picked.name == DATA_SUBFOLDER or (picked / "studio.db").is_file():
        return picked
    return picked / DATA_SUBFOLDER


def switch_data_folder(picked: Path) -> dict:
    """고른 폴더에 데이터가 있으면 그것을 열고, 없으면 지금 작업(DB·조판 결과)을 그 폴더로 복사해 옮긴다."""
    if not picked.is_dir():
        raise ValueError("폴더를 찾지 못했습니다.")
    folder = data_dir_for(picked)
    folder.mkdir(parents=True, exist_ok=True)
    target_db = folder / "studio.db"
    if target_db.resolve() == DB_PATH:
        return {**data_folder_status(), "mode": "same"}
    if target_db.is_file():
        mode = "opened"
    else:
        mode = "moved"
        source = sqlite3.connect(DB_PATH)
        target = sqlite3.connect(target_db)
        try:
            source.backup(target)
        finally:
            target.close()
            source.close()
        builds = designcraft_export.output_root(APP_DIR)
        if builds.is_dir():
            shutil.copytree(builds, folder / BUILD_SUBFOLDER, dirs_exist_ok=True)
    apply_data_dir(folder)
    initialize_database()
    write_local_setting(DATA_DIR_KEY, str(folder.resolve()))
    return {**data_folder_status(), "mode": mode}


# ── 작업 폴더 파일 읽기·쓰기 ──
# 초고별 원고 PDF·지도서·PPT·생성 이력 같은 결과 파일도 브라우저가 아니라 서버가 작업 폴더에 쓴다. 그래서 작업
# 폴더 하나(_도구데이터 + 결과 파일)만 통째로 복사하면 다른 컴퓨터에서 그대로 이어서 쓸 수 있고, 도구를 열 때마다
# 브라우저 폴더 권한을 다시 줄 필요가 없다.
FOLDER_FILE_LIMIT = 300 * 1024 * 1024


def work_folder_root() -> Path:
    data_dir = configured_data_dir()
    if not data_dir:
        raise ValueError("작업 폴더를 먼저 골라 주세요.")
    return data_dir.parent if data_dir.name == DATA_SUBFOLDER else data_dir


def work_folder_path(relative: str, writing: bool = False) -> Path:
    root = work_folder_root().resolve()
    parts = [part for part in str(relative or "").replace("\\", "/").split("/") if part]
    if any(part in (".", "..") for part in parts):
        raise ValueError("올바른 경로가 아닙니다.")
    if writing and parts and parts[0] == DATA_SUBFOLDER:
        raise ValueError("도구 데이터 폴더에는 직접 쓸 수 없습니다.")
    path = root.joinpath(*parts).resolve() if parts else root
    if path != root and root not in path.parents:
        raise ValueError("작업 폴더 밖의 경로입니다.")
    return path


def work_folder_list(relative: str, kind: str = "") -> list[str]:
    folder = work_folder_path(relative)
    if not folder.is_dir():
        return []
    names = []
    for entry in folder.iterdir():
        if kind == "file" and not entry.is_file():
            continue
        if kind == "directory" and not entry.is_dir():
            continue
        names.append(entry.name)
    return sorted(names)


def work_folder_write(relative: str, data: bytes) -> None:
    path = work_folder_path(relative, writing=True)
    if path == work_folder_root().resolve():
        raise ValueError("파일 이름이 없습니다.")
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    partial.write_bytes(data)
    partial.replace(path)


def manuscript_ai_config() -> dict:
    return {
        "enabled": bool(secret_environment_value("OPENAI_API_KEY")),
        "model": os.environ.get("OPENAI_MODEL", "gpt-5.6"),
    }


# 로컬 실행에는 함수 실행 시간 제한이 없지만, Vercel Hobby 배포(vercel.json의
# maxDuration: 60)는 60초에서 함수 자체가 강제 종료된다. Vercel은 이 함수의 런타임에
# VERCEL 환경변수를 자동으로 넣어 주므로 이를 기준으로 예산을 다르게 잡는다 — 배포본은
# 콜드 스타트·요청 파싱·응답 전송 여유를 남기고 재시도 없이 한 번만 시도한다.
def manuscript_request_budget() -> dict:
    if os.environ.get("VERCEL"):
        # 재시도 여유가 없으므로 reasoning effort도 낮춰 애초에 시간 안에 끝날
        # 확률을 높인다 — 로컬에서 다듬는 medium 품질보다는 떨어지지만, 시간 초과로
        # 아예 못 받는 것보다 낫다.
        return {"timeout_seconds": 50, "max_attempts": 1, "reasoning_effort": "low"}
    return {"timeout_seconds": 110, "max_attempts": 2, "reasoning_effort": "medium"}


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


# --- 프로토타입(static/prototype.js) 스포츠 문화 4단계 원고 생성 — 클라이언트가
# 소단원·종목·전개각도·전처리 근거 발췌문을 조립해 보내면, 서버의 OPENAI_API_KEY로
# 실제 문장을 생성해 반환한다. 근거 매칭(evidenceRecordFor 등)은 여전히 클라이언트
# JS(prototype-draft-engine.js)가 담당하고, 서버는 그 결과를 받아 집필만 한다.

def sports_culture_manuscript_schema(spread_count: int, section_count: int) -> dict:
    section_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "paragraphs", "box_type"],
        "properties": {
            "title": {"type": "string"},
            "paragraphs": {
                "type": "array",
                "minItems": 2,
                "maxItems": 4,
                "items": {"type": "string"},
            },
            "box_type": {
                "type": ["string", "null"],
                "description": (
                    "이 절이 입력의 concept_types 중 하나에 해당하는 박스형 코너면 그 이름을 "
                    "그대로 넣고, 일반 설명 절이면 null."
                ),
            },
        },
    }
    visual_item_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["size", "placement", "description"],
        "properties": {
            "size": {"type": "string", "enum": ["full", "half", "small"]},
            "placement": {
                "type": "string",
                "enum": ["top", "bottom", "left", "right", "background", "inline"],
            },
            "description": {"type": "string"},
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
            "left_visuals",
            "right_visuals",
        ],
        "properties": {
            "headline": {"type": "string"},
            "learning_goal": {"type": "string"},
            "opening_question": {"type": "string"},
            "deck": {"type": "string"},
            "sections": {
                "type": "array",
                "minItems": max(3, section_count - 1),
                "maxItems": section_count + 1,
                "items": section_schema,
            },
            "left_visuals": {
                "type": "array",
                "minItems": 0,
                "maxItems": 3,
                "items": visual_item_schema,
            },
            "right_visuals": {
                "type": "array",
                "minItems": 0,
                "maxItems": 3,
                "items": visual_item_schema,
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


def _collect_manuscript_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _collect_manuscript_strings(value)
    elif isinstance(node, list):
        for item in node:
            yield from _collect_manuscript_strings(item)


# 추론 모델이 strict json_schema 검증은 통과시키면서도, 답을 확신하지 못해 혼란스러운
# 영어 메타 발언("Let's redo", "sports_culture_manuscript" 같은 스키마 이름 자체)을
# 실제 본문 자리에 채워 넣는 드문 실패가 관찰됨(JSON 파싱은 성공하므로 json.JSONDecodeError로
# 잡히지 않는다). 이런 응답의 특징 — 스키마 이름이 그대로 텍스트에 등장하거나, 원래
# 한글이어야 할 본문의 알파벳 비율이 비정상적으로 높음 — 을 감지해 재시도한다.
def manuscript_looks_corrupted(
    generated: dict, schema_name: str = "sports_culture_manuscript"
) -> bool:
    strings = list(_collect_manuscript_strings(generated))
    joined = " ".join(strings)
    if not joined.strip():
        return True
    if schema_name in joined:
        return True
    # 응답이 무너질 때의 다른 모양: 스키마 필드 이름이 그대로 글로 나오거나(예: 활동 단계에 "tip"·"title"),
    # 일본어 가나가 섞이거나, 짧아야 할 초등 원고 한 줄이 수백 자로 이어진다(2026-11-05 굴리기 초고에서 확인).
    field_names = {"tip", "title", "steps", "content", "headline", "paragraphs", "description", "sections", "activities", "boxes", "deck", "type"}
    if any(text.strip().lower() in field_names for text in strings):
        return True
    if re.search(r"[぀-ヿ]", joined):
        return True
    if schema_name == "elementary_pe_manuscript" and any(len(text) > 400 for text in strings):
        return True
    letters = [ch for ch in joined if ch.isalpha()]
    if not letters:
        return False
    ascii_ratio = sum(1 for ch in letters if ch.isascii()) / len(letters)
    return ascii_ratio > 0.5


def request_structured_manuscript(
    api_key: str,
    instructions: str,
    context: dict,
    schema_name: str,
    schema: dict,
    expected_spreads: int,
    count_key: str = "spreads",
) -> dict:
    """OpenAI Responses API에 구조화 출력(JSON 스키마)으로 원고를 요청한다.

    스포츠 문화·초등 체육 원고 생성이 함께 쓴다. 인증·과금·시간 초과는 즉시 오류를 올리고,
    스키마는 통과했지만 내용이 깨진 응답만 예산 안에서 다시 시도한다.
    """
    budget = manuscript_request_budget()
    request_body = {
        "model": manuscript_ai_config()["model"],
        "reasoning": {"effort": budget["reasoning_effort"]},
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False),
        "max_output_tokens": 16000,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": True,
                "schema": schema,
            }
        },
    }
    max_attempts = budget["max_attempts"]
    request_timeout_seconds = budget["timeout_seconds"]
    for attempt in range(1, max_attempts + 1):
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
            with urlopen(request, timeout=request_timeout_seconds) as response:
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
                f"OpenAI 응답 제한 시간({request_timeout_seconds}초)을 초과했습니다. "
                "잠시 후 다시 시도해 주세요."
            ) from exc
        except URLError as exc:
            raise ValueError(
                "로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인하고 "
                "서버를 다시 실행해 주세요."
            ) from exc
        except (HttpClientError, ConnectionError) as exc:
            raise ValueError(
                "OpenAI 응답을 받는 중 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요."
            ) from exc

        # 여기서부터는 "정상 응답이지만 내용이 망가졌을 수 있는" 경우만 재시도한다.
        # 인증/과금/타임아웃 같은 위 오류는 재시도해도 소용없으므로 즉시 올린다.
        try:
            generated = json.loads(openai_response_text(payload))
            spread_count_ok = len(generated.get(count_key, [])) == expected_spreads
            corrupted = manuscript_looks_corrupted(generated, schema_name)
        except json.JSONDecodeError:
            generated = None
            spread_count_ok = False
            corrupted = True

        if generated is not None and spread_count_ok and not corrupted:
            return generated
        if attempt < max_attempts:
            continue
        if generated is None:
            raise ValueError("OpenAI 응답을 원고 형식으로 해석하지 못했습니다. 다시 생성해 주세요.")
        if not spread_count_ok:
            raise ValueError("AI가 요청한 펼침면 수와 다른 원고를 반환했습니다.")
        retry_note = "같은 요청을 다시 시도했지만 반복됐습니다. " if max_attempts > 1 else ""
        raise ValueError(
            f"AI가 정상적인 한글 원고 대신 깨진 응답을 반환했습니다. {retry_note}"
            "잠시 후 다시 생성해 주세요."
        )


def call_openai_for_sports_culture_manuscript(context: dict) -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 이 컴퓨터용 키를 입력해 주세요.")
    spreads = context.get("spreads", [])
    if not spreads:
        raise ValueError("생성할 펼침면 정보가 없습니다.")
    section_count = len(spreads[0].get("sectionTitles", [])) or 4
    page_role = context.get("page_role", "small-unit")
    if page_role == "small-unit":
        page_role_note = "지금 쓰는 지면은 소단원 본문이다. 제공된 근거는 이 소단원에 특정된 발췌문이다."
    elif page_role == "unit-intro":
        page_role_note = (
            "지금 쓰는 지면은 대단원 도입이다. 실제 고등학교 교과서의 대단원 도입은 "
            "분석적인 설명문이 아니라 다음과 같이 구성된다: (1) 이 단원이 다루는 범위를 "
            "압축해 안내하는 2~4문장짜리 짧은 소개글(예: '이 단원에서는 ~을 이해할 수 "
            "있다', '이 단원을 배우면 ~을 실천할 수 있다'), (2) 이 단원에 속한 소단원 "
            "제목들을 번호와 함께 나열하는 목차 미리보기, (3) 필요하면 짧은 학습 목표 "
            "문장 여러 개(각 한 문장) 또는 단원을 여는 질문 하나. 절 하나가 여러 문장이 "
            "이어지는 긴 문단을 쓰지 않는다 — section의 title과 paragraphs를 위 (1)~(3) "
            "같은 서로 다른 역할로 나누어 짧게 구성한다."
        )
    elif page_role == "unit-closing":
        page_role_note = (
            "지금 쓰는 지면은 대단원 마무리다. 실제 고등학교 교과서의 대단원 마무리는 "
            "분석적인 설명문이 아니라, 서로 다른 역할을 맡은 짧은 활동 블록 여러 개로 "
            "구성된다. 다음 유형 중 이 단원 내용에 맞는 것들을 절(section)로 구성한다 — "
            "배운 내용을 빈칸 채우기·짧은 문답·용어 연결로 정리하는 복습 블록, 이 "
            "단원의 학습 목표에 맞춰 예/아니오나 O/X, 우수·보통·미흡 등으로 스스로 "
            "점검하는 자기평가 체크리스트, 배운 내용을 새로운 사례나 자신의 경험에 "
            "적용해 글이나 계획을 쓰게 하는 활동·프로젝트 프롬프트. 각 section의 "
            "paragraphs는 학생에게 직접 지시하는 짧은 문장('~해 보자', '~적어 보자', "
            "'~점검해 보자', '~판단하여 고쳐 보자' 등)으로 쓰고, 다음 문장으로 자연스럽게 "
            "이어지는 분석적인 설명 문단을 쓰지 않는다."
        )
    elif page_role == "special-safety":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '안전'이다. 분석적인 설명문이 아니라, "
            "실제 활동 상황에서 바로 확인할 수 있는 안전 수칙·점검 항목·주의 문구 "
            "중심으로 구성한다. 각 section은 상황별 위험 요인이나 점검 국면 하나를 "
            "제목으로 삼고, paragraphs는 '~할 것', '~하지 말 것', '~인지 확인한다' "
            "같은 짧은 지시문·점검문으로 쓴다. 여러 문장이 자연스럽게 이어지는 분석 "
            "문단을 쓰지 않는다."
        )
    elif page_role == "special-project":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '프로젝트'다. 분석적인 설명문이 아니라, "
            "학생이 직접 수행할 프로젝트의 단계별 활동 지시문으로 구성한다. 각 "
            "section은 프로젝트의 한 단계(주제 정하기, 자료 조사, 결과물 제작, "
            "발표·공유 등)를 맡고, paragraphs는 '~해 보자', '~를 정리해 제출한다' "
            "같은 실행 지시문으로 쓴다. 배경을 길게 설명하는 문단을 쓰지 않는다."
        )
    elif page_role == "special-assessment":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '수행평가'다. 분석적인 설명문이 아니라, "
            "평가 기준표(채점 기준·수준별 성취 수준)나 자기·동료 점검 체크리스트로 "
            "구성한다. 각 section은 평가 요소 하나를 맡고, paragraphs는 평가 기준 "
            "문장이나 점검 문항으로 짧게 쓴다. 자연스럽게 흐르는 설명 문단을 쓰지 "
            "않는다."
        )
    elif page_role == "special-career":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '인물·진로'다. 이 단원 내용과 관련된 "
            "진로·직업 경로를 소개한다. 실존 인물의 이름이나 구체적 경력을 새로 "
            "지어내지 말고(원칙 3), 그 대신 관련 직업의 역할·필요 역량·준비 과정을 "
            "중심으로 학생이 자신의 진로와 연결해 생각해 볼 수 있도록 쓴다. section은 "
            "직업·진로 유형별로 나누고, 각 절은 설명 문단 1~2개로 짧게 쓴다."
        )
    elif page_role == "special-critique":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '문화 비평'이다. 하나의 관점만 제시하지 "
            "말고 찬반이나 서로 다른 시각을 나란히 보여주는 비평적 설명문으로 쓴다. "
            "근거를 바탕으로 쟁점을 제시하고 다양한 입장을 균형 있게 소개한 뒤, 학생이 "
            "스스로 판단할 여지를 남긴다."
        )
    elif page_role == "special-reading":
        page_role_note = (
            "지금 쓰는 지면은 특별 페이지 중 '읽을거리'다. 실제 사례·일화·기사처럼 "
            "흥미를 끄는 소재를 소개하는 매거진 기사체로 쓴다. 개념을 딱딱하게 "
            "정의하기보다 구체적 장면이나 사례로 시작해 자연스럽게 내용을 풀어간다."
        )
    else:
        page_role_note = "지금 쓰는 지면은 대단원 안의 특별 페이지다. 본문 소단원과는 별도로, 확장된 사례나 활동을 다룬다."
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
        "7) 소단원 본문(small-unit)과 설명문 성격의 특별 페이지(special-reading, "
        "special-critique, special-career)는 2~4개 문단으로 자연스럽게 흐르는 "
        "설명문으로 쓴다. 문단 개수나 '정의-사례-과제' 같은 고정 틀에 얽매이지 말고, "
        "내용에 맞는 자연스러운 전개를 선택한다. 단, 대단원 도입·마무리(unit-intro/ "
        "unit-closing)와 활동·점검 성격의 특별 페이지(special-safety, "
        "special-project, special-assessment)는 이 규칙 대신 아래 11)을 따른다.\n"
        "8) 고등학생이 읽기에 적절한 문장 길이와 어휘를 사용한다.\n"
        "9) left_visuals/right_visuals(각 페이지의 삽화 구성)는 펼침면마다 개수·크기를 "
        "고정하지 않는다. 실제 고등학교 교과서는 페이지마다 삽화 구성이 다르다 — 개념 "
        "설명이 중심인 페이지는 전면 삽화 하나(size: full)만 있거나 삽화가 전혀 없을 "
        "수 있고, 여러 사례나 활동을 보여주는 페이지는 작은 컷(size: small) 여러 개가 "
        "흩어져 있을 수 있다. 이번 페이지의 본문 내용과 그 절의 역할(개념 설명, 사례 "
        "비교, 활동 안내 등)에 맞게 삽화 개수(0개도 가능)·크기·배치를 이 펼침면에서 "
        "직접 판단해서 정한다. description에는 실제로 그릴 대상을 구체적으로 쓴다.\n"
        "10) 각 절(section)의 title은 입력에 참고용으로 제공되는 sectionTitles를 그대로 "
        "베끼지 않는다. sectionTitles는 이 페이지 역할에 흔히 쓰이는 구성의 예시일 "
        "뿐이며, 실제 절 제목과 절 개수는 이번 소단원·종목·근거 내용에 맞게 직접 "
        "새로 정한다. 예를 들어 특별 페이지라도 다루는 사례가 인물 중심이면 인물의 "
        "선택과 서사를 따라가는 절 구성이 될 수 있고, 통계나 논쟁이 중심이면 자료 "
        "비교와 쟁점 구조를 따라가는 절 구성이 될 수 있다. 같은 page_role이라도 "
        "종목이나 소단원이 다르면 절 제목의 표현과 순서, 개수(3~5개 사이)가 달라져야 "
        "한다 — 매번 같은 뼈대를 반복하면 안 된다.\n"
        "11) 대단원 도입(unit-intro)·마무리(unit-closing)와 특별 페이지 중 안전 "
        "(special-safety)·프로젝트(special-project)·수행평가(special-assessment)는 "
        "위 page_role 설명에 따라 목차 미리보기·학습 목표·점검 문항·활동 지시문 같은 "
        "짧고 구체적인 항목으로 구성한다. 이 역할들에서는 paragraphs의 각 문자열을 "
        "한두 문장 이내의 짧은 항목(목차 한 줄, 체크리스트 한 문항, 활동 지시문 한 개 "
        "등)으로 쓰고, 절 하나에 여러 문장이 이어지는 긴 문단을 담지 않는다.\n"
        "12) primary_type이 practice(실기형)인 소단원은 theory(이론형)와 내용의 결이 "
        "뚜렷이 달라야 한다. 이론형은 개념·역사·사회적 의미를 중심으로 쓰지만, 실기형은 "
        "그 종목을 직접 수행·참여하는 관점에서 시설과 용구의 규격, 기본 동작의 순서, "
        "기초 전술, 안전 수칙, 경기 규칙의 실제 적용을 구체적이고 단계적으로 설명한다. "
        "이런 기초 동작·규격·안전 수칙은 그 종목에서 널리 통용되는 스포츠 상식이므로, "
        "근거 발췌문에 없어도 일반적으로 알려진 수준에서 자유롭게 구체적으로 설명해도 "
        "된다(3)의 '근거에 없는 사실을 지어내지 않는다'는 역사적 사실·통계·특정 대회 "
        "기록처럼 검증이 필요한 내용에 적용되는 것이며, 이렇게 널리 통용되는 기초 동작· "
        "안전 수칙 설명에는 적용되지 않는다). 다만 동작이나 규칙을 나열하는 데 그치지 "
        "말고, 그것이 경기 문화(안전, 공정성, 협력, 역할 수행, 참여 문화)와 어떻게 "
        "연결되는지도 함께 설명한다."
    )
    # 아래 두 지시문은 조건에 해당할 때만 덧붙인다 — 매 요청마다 무조건 붙이면 프롬프트가
    # 불필요하게 길어져 응답 지연(타임아웃)만 늘어나고 대부분의 평범한 요청에는 도움이 안
    # 된다(실제로 이 무조건 추가 때문에 정상 생성이 응답시간 초과로 실패한 사례가 있었다).
    if page_role == "small-unit" and not context.get("precise_evidence_match", True):
        instructions += (
            "\n13) 이 소단원은 새로 만들었거나 제목을 바꿔서 정확히 일치하는 출판사 발췌가 "
            "없다. 주어진 근거는 같은 대단원의 다른 소단원 참고 자료일 뿐이니 이 소단원 "
            "얘기인 것처럼 인용하지 말고, standard_context와 교육과정 취지·일반 지식으로 "
            "제목에 맞는 내용을 새로 구성한다(단, 위 3)의 통계·역사적 사실 지어내기 금지는 "
            "유지)."
        )
    concept_types = context.get("concept_types") or []
    if page_role == "small-unit" and concept_types:
        concept_list = "、".join(concept_types)
        instructions += (
            f"\n14) 다음 구성요소 중 이 소단원에 자연스럽게 어울리는 게 있으면 절 하나를 그 "
            f"성격(예: 안전 팁→점검 문구, 디지털활용 활동→기기·앱 활용법)에 맞게 쓰고 그 절의 "
            f"box_type에 이름을 정확히 넣는다: {concept_list}. 안 어울리면 0개도 되고, 나머지 "
            "절은 box_type을 null로 둔다."
        )
    additional_concept = str(context.get("additional_concept", "")).strip()
    if additional_concept:
        instructions += (
            f"\n15) 집필자가 이번 생성 요청에 추가로 남긴 지침: {additional_concept}\n"
            "위 1)~14)의 원칙과 상충하지 않는 범위에서 이 지침을 이번 지면 내용에 최대한 "
            "구체적으로 반영한다."
        )
    instructions += evidence_and_feedback_instructions(context)
    return request_structured_manuscript(
        api_key,
        instructions,
        context,
        "sports_culture_manuscript",
        sports_culture_manuscript_schema(len(spreads), section_count),
        len(spreads),
    )


# ── 현장 의견·조판 후 수정안·파생 자료(studio_ai.py) ──

def _studio_ai_key() -> str:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 키를 입력해 주세요.")
    return api_key


def call_feedback_analyze(payload: dict) -> dict:
    import studio_ai

    files = payload.get("files") if isinstance(payload.get("files"), list) else []
    book = payload.get("book") if isinstance(payload.get("book"), dict) else {}
    return studio_ai.analyze_feedback(_studio_ai_key(), manuscript_ai_config()["model"], files, str(payload.get("note") or ""), book)


def call_feedback_revisions(payload: dict) -> dict:
    import studio_ai

    issues = [item for item in payload.get("issues") or [] if isinstance(item, dict)]
    pages = [item for item in payload.get("pages") or [] if isinstance(item, dict) and str(item.get("text", "")).strip()]
    return studio_ai.propose_revisions(_studio_ai_key(), manuscript_ai_config()["model"], issues, pages, str(payload.get("roundLabel") or "1차 조판"))


def call_derived_material(payload: dict) -> dict:
    import studio_ai

    return studio_ai.generate_derived(_studio_ai_key(), manuscript_ai_config()["model"], str(payload.get("kind") or ""), payload)


def call_evidence_search(payload: dict) -> dict:
    import studio_ai

    query = str(payload.get("query") or "").strip()
    if not query:
        raise ValueError("검색어가 없습니다.")
    grade = payload.get("grade")
    return {"items": studio_ai.search_evidence(query, level=str(payload.get("level") or ""), grade=int(grade) if str(grade or "").isdigit() else None, limit=8)}


def clean_feedback_notes(value: object) -> list[str]:
    """현장 의견에서 고른 반영 사항(문장 목록). 너무 길면 앞부분만 쓴다."""
    if not isinstance(value, list):
        return []
    return [str(item).strip()[:400] for item in value if str(item).strip()][:15]


def searched_evidence_for(context: dict, level: str) -> list[dict]:
    """전처리 교과서·지도서에서 이번 지면과 가까운 펼침면을 찾아 발췌만 넘긴다(출판사·쪽 제외)."""
    import studio_ai

    try:
        found = studio_ai.evidence_for_context(context, level=level, limit=5)
    except Exception:  # 검색 실패가 원고 생성을 막지 않게 한다.
        return []
    return [{"document_type": item["documentType"], "revision": item["revision"], "excerpt": item["excerpt"]} for item in found]


def evidence_and_feedback_instructions(context: dict) -> str:
    text = ""
    if context.get("searched_evidence"):
        text += (
            "\n[근거 검색] searched_evidence는 09·15·22 개정 교과서·지도서 전처리 자료에서 이번 지면과 가까운 "
            "펼침면을 검색한 발췌다. 활동 방식·용어·난이도·안전 수칙을 확인하는 데만 쓰고 문장·활동명을 베끼지 않는다."
        )
    if context.get("field_feedback"):
        text += (
            "\n[현장 의견 반영] field_feedback은 현장 교사 만족도 조사와 편집자가 고른 반영 사항이다. 이번 지면과 "
            "관련 있는 항목은 활동 구성·설명·안전·자료 제시 방식에 구체적으로 반영하고, 관련 없는 항목은 무시한다."
        )
    return text


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
        "precise_evidence_match": payload.get("preciseEvidenceMatch", True),
        "concept_types": payload.get("conceptTypes") or [],
        "additional_concept": str(payload.get("additionalConcept", "")).strip(),
        "field_feedback": clean_feedback_notes(payload.get("feedbackNotes")),
        "spreads": spreads,
    }
    context["searched_evidence"] = searched_evidence_for({**context, "small_title": context["small_unit_title"]}, "sports-culture")
    return call_openai_for_sports_culture_manuscript(context)


ELEMENTARY_BOX_TYPES = ["준비물", "안전", "도움말", "움직임 확인", "놀이 규칙", "생각 나누기", "더 해 보기"]


def elementary_activity_limit(lesson_count: int) -> int:
    """펼침면이 맡은 차시 수로 활동 수 상한을 정한다(1차시 2개, 2차시 3개, 3차시 이상 4개).
    차시가 0인 펼침면(앞 펼침면의 차시를 이어 받음)은 2개까지."""
    return max(2, min(4, int(lesson_count or 0) + 1))


def elementary_pe_manuscript_schema(page_role: str, activity_count: int, lesson_count: int = 1) -> dict:
    small_unit = page_role == "small-unit"
    visual_item_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["size", "placement", "description"],
        "properties": {
            "size": {"type": "string", "enum": ["full", "half", "small"]},
            "placement": {
                "type": "string",
                "enum": ["top", "bottom", "left", "right", "background", "inline"],
            },
            "description": {"type": "string"},
        },
    }
    text_section_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "paragraphs"],
        "properties": {
            "title": {"type": "string"},
            "paragraphs": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"type": "string"}},
        },
    }
    activity_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["title", "steps", "tip"],
        "properties": {
            "title": {"type": "string"},
            "steps": {"type": "array", "minItems": 2, "maxItems": 4, "items": {"type": "string"}},
            "tip": {"type": "string"},
        },
    }
    box_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["type", "content"],
        "properties": {
            "type": {"type": "string", "enum": ELEMENTARY_BOX_TYPES},
            "content": {"type": "string"},
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
            "activities",
            "boxes",
            "self_check",
            "left_visuals",
            "right_visuals",
        ],
        "properties": {
            "headline": {"type": "string"},
            "learning_goal": {"type": "string"},
            "opening_question": {"type": "string"},
            "deck": {"type": "string"},
            "sections": {
                "type": "array",
                "minItems": 0 if small_unit else 2,
                "maxItems": 1 if small_unit else 3,
                "items": text_section_schema,
            },
            "activities": {
                "type": "array",
                "minItems": 1 if small_unit else 0,
                "maxItems": elementary_activity_limit(lesson_count) if small_unit else 2,
                "items": activity_schema,
            },
            "boxes": {
                "type": "array",
                "minItems": 0,
                "maxItems": 3,
                "items": box_schema,
            },
            "self_check": {
                "type": "array",
                "minItems": 3 if small_unit else 0,
                "maxItems": 3,
                "items": {"type": "string"},
            },
            "left_visuals": {"type": "array", "minItems": 0, "maxItems": 3, "items": visual_item_schema},
            "right_visuals": {"type": "array", "minItems": 0, "maxItems": 3, "items": visual_item_schema},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["spreads"],
        "properties": {
            "spreads": {"type": "array", "minItems": 1, "maxItems": 1, "items": spread_schema},
        },
    }


# 지면 종류별 구성은 2022 개정 초등 체육 검정 교과서 여러 출판사(천재·동아·금성·아이스크림·지학사·미래엔·
# 비상·YBM)에 공통된 골격을 따르고, 코너 이름·장치는 새로 짓게 한다. docs/structure-analysis/ 참고.
ELEMENTARY_PAGE_ROLE_NOTES = {
    "small-unit": (
        "지금 쓰는 지면은 소단원의 차시 본문 펼침면(2쪽)이다. 여러 출판사 초등 체육 교과서의 본문은 공통적으로 설명문이 아니라 "
        "'생각을 여는 질문(한 문장) → 짧은 도입 글(2~3문장) → 번호가 붙은 활동 1~3(마지막은 흔히 게임) → 준비물·안전 표시 → "
        "스스로 확인(3문항 안팎)' 흐름이고, 지면의 절반 이상이 동작 그림·활동 사진이다. 이 골격만 따르고 코너 이름과 장치"
        "(질문 방식, 게임판, 미션, 기록표, 말풍선 등)는 이 책만의 것으로 새로 정한다. 활동 카드의 steps는 그림 옆에 붙는 "
        "짧은 동작 설명(동작 이름이 드러나는 한 줄)이고, tip은 움직임을 잘하는 요령 한 문장이다. sections는 비워 두거나, "
        "꼭 필요할 때만 짧은 놀이 소개 1개를 쓴다."
    ),
    "unit-intro": (
        "지금 쓰는 지면은 대단원 도입이다. 여러 출판사의 단원 도입은 공통적으로 큰 장면 그림(또는 만화·사진) 위에 단원 제목과 "
        "중단원 이름이 놓이고 글은 아주 적다. 출판사마다 '이 단원을 배우면 할 수 있는 것', 짧은 만화나 이야기, 그림 보고 경험 "
        "나누기, 숨은 그림 찾기, 수업 전 내 실력 확인 같은 장치를 1~2개 쓴다. 이 가운데 단원에 어울리는 것을 골라 새로 "
        "구성하고, 코너 이름은 새로 짓는다. sections는 2~3개: 반드시 하나는 이 단원을 마치면 할 수 있는 것(짧은 문장 3~5개, "
        "각 20자 안팎)이고, 나머지는 고른 장치(예: 그림 4장 각각의 한 줄 설명, 만화 말풍선 4~6개, 진단 질문 3개)다. "
        "deck은 단원 제목 아래 붙는 한 줄(20자 안팎)이다. 긴 이야기 글과 설명 문단은 쓰지 않는다. "
        "삽화는 펼침면을 가로지르는 큰 장면 1개(background)와 장치에 필요한 작은 그림이다. activities·self_check는 비운다."
    ),
    "unit-closing": (
        "지금 쓰는 지면은 대단원 마무리다. 여러 출판사의 단원 마무리는 공통적으로 설명 문단 없이 번호 문항으로 되어 있고, "
        "지식(퀴즈: O/X·괄호 고르기·초성·빈칸)·기능(수행했는지 확인)·태도(마음·생활 실천) 세 갈래를 확인한다. 출판사마다 "
        "그림 카드 문장 완성, 상황 보고 조언 쓰기, 별·칸 색칠 자기 평가, 역량 그래프, 길 찾기 퀴즈판 같은 장치를 쓴다. "
        "이 가운데 어울리는 것을 골라 이 책만의 새 장치로 구성하고, 문항 제목은 새로 짓는다. sections는 2~3개: 지식 확인 "
        "문장 4~6개, 기능·태도를 돌아보는 활동 1개, 스스로 평가 '~할 수 있어요' 문장 4~5개. self_check는 비워도 된다. "
        "삽화는 문항 그림 카드와 자기 평가 배경 그림이다."
    ),
}


ELEMENTARY_CREATIVE_ANGLES = [
    "이야기 속 주인공이 되어 미션을 해결하는 상황",
    "우리 반만의 규칙을 직접 만들어 보는 상황",
    "기록을 재며 어제의 나와 겨루는 상황",
    "계절이나 날씨를 살린 바깥 활동 상황",
    "학교 행사(운동회·학급 축제)를 준비하는 상황",
    "동네·가정에서 가족과 이어서 해 보는 상황",
    "모둠이 힘을 합쳐 문제를 푸는 협동 상황",
    "새로운 놀이를 발명해 친구들에게 소개하는 상황",
    "동물·자연의 움직임을 관찰하고 따라 하는 상황",
    "디지털 기기로 내 움직임을 찍고 살펴보는 상황",
]


def call_openai_for_elementary_pe_manuscript(context: dict) -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 이 컴퓨터용 키를 입력해 주세요.")
    spread = context.get("spread") or {}
    page_role = context.get("page_role", "small-unit")
    upper = context.get("band") == "5~6학년군"
    if page_role in ELEMENTARY_PAGE_ROLE_NOTES:
        page_role_note = ELEMENTARY_PAGE_ROLE_NOTES[page_role]
    else:
        page_role_note = (
            f"지금 쓰는 지면은 차시가 배정되지 않은 확장 코너 '{context.get('corner_label', '')}'다. "
            "코너 소개 글, 학생이 따라 할 활동 1개(steps), 생각 나누기 코너를 짧게 구성한다."
        )
    if upper:
        tone_note = "5·6학년이므로 활동 지시문은 '~해 봅시다', 설명은 '~합니다'로 끝낸다.\n"
    else:
        tone_note = "3·4학년이므로 활동 지시문은 '~해 봐요', 설명은 '~해요/~입니다'로 끝낸다.\n"
    instructions = (
        "당신은 2022 개정 교육과정 초등학교 체육 검정 교과서 집필자다. "
        f"대상은 {context.get('grade_label', '')} 학생이다. {page_role_note}\n"
        "다음을 반드시 지킨다.\n"
        "1) 문장은 초등학생이 바로 이해할 수 있게 짧고 쉽게 쓴다. "
        f"{tone_note}"
        "2) 제공된 근거 발췌문(실제 교과서·지도서 원문 일부)은 사실과 활동 방식 확인용이다. 문장을 "
        "그대로 베끼거나 출판사명·쪽수를 쓰지 않고, 새 활동으로 다시 쓴다.\n"
        "3) 성취기준(standards)의 지식·기능·태도가 활동과 스스로 평가에 함께 드러나야 한다. "
        "스스로 평가 3문항은 지식·기능·태도 순서의 질문 문장으로 쓰되 대괄호 표시는 넣지 않는다.\n"
        "4) spread.phases는 이번 펼침면 활동이 따라야 할 차시 흐름이다(예: 기본 기능 → 기본 전략 → "
        "게임). 분량은 쪽수가 아니라 차시로 정한다. 이 펼침면이 맡은 차시는 spread.lesson_label"
        "(spread.lesson_count개)이고, 한 차시는 40분 중 실제 활동 25~30분이다. 그 시간 안에 이 학년 "
        "학생이 실제로 해낼 수 있는 양만 담는다: 1차시면 핵심 활동 1개(+짧은 응용 놀이 1개까지), "
        "2차시면 2개 안팎, 3차시면 3개 안팎. 쪽수가 차시보다 넉넉하면(예: 4쪽에 1차시) 활동을 늘리지 "
        "말고 큰 동작 그림·단계 그림·여백을 늘린다. 쪽수에 비해 차시가 많으면(예: 2쪽에 2~3차시) "
        "설명을 더하지 말고 반복 연습·게임으로 시간을 채우는 활동으로 구성한다. lesson_count가 0이면 앞 "
        "펼침면의 차시를 이어 받는 지면이므로 새 기능을 늘리지 말고 앞 활동의 응용·게임을 담는다. "
        "보조 코너(boxes)는 필요한 것만(대개 준비물·안전 1~2개) 넣는다. suggested_activity_titles는 "
        "참고만 하며 더 구체적인 놀이·게임 이름으로 바꿔도 된다. 같은 활동을 반복하지 않는다. "
        "활동 title에는 '활동 1' 같은 번호를, steps 각 항목에는 '1.' 같은 순서 번호를 붙이지 "
        "않는다(화면이 번호를 따로 붙인다).\n"
        "5) 안전 코너는 이 활동에서 실제로 생길 수 있는 위험과 예방 방법을 구체적으로 쓴다. 신체 "
        "접촉·도구·물·높이가 있는 활동은 반드시 안전 코너를 넣는다.\n"
        "6) 모든 학생이 참여할 수 있도록 활동 안에 쉬운 방법이나 다른 참여 방법을 하나 이상 넣는다.\n"
        "7) 경기 규칙·용구 규격은 학교 체육에서 널리 쓰이는 간이 규칙 수준으로 쓰고, 검증이 필요한 "
        "통계·기록·인물 정보는 지어내지 않는다.\n"
        "8) left_visuals/right_visuals는 펼침면 내용에 맞게 개수(0~3)·크기·배치를 직접 정한다. "
        "초등 교과서는 동작 순서를 보여 주는 단계 그림, 활동 장면, 경기장 배치도가 많다. "
        "description에는 그릴 대상(어린이의 동작·도구·대형)을 구체적으로 쓴다.\n"
        "9) style_label은 펼침면 전체의 방향이다(개수를 정하는 규칙이 아니다). "
        "'안정·정석형'은 정확한 동작 원리와 바른 자세를 단계별로 차근차근 익히고 확인하는 정돈된 교과서, "
        "'균형형'은 기능 익히기·활동·안전과 생활 연계가 고르게 어우러진 교과서, "
        "'참신·활동형'은 이야기·미션·게임·모둠 도전으로 학생이 스스로 규칙을 바꾸고 만들어 가는 "
        "놀이 중심 교과서다. 활동 이름, 도입 질문, 코너 종류, 문장 분위기, 삽화 장면 모두 이 방향에 맞춘다.\n"
        "10) 학생용 교과서 지면이다. 교사용 내용(지도 방법, 수업 운영·시간 배분, 모둠 편성 지시, 평가 기준, "
        "지도 유의점, '선생님은 ~')은 쓰지 않는다(지도서에 따로 만든다). 모든 문장은 학생에게 말하는 문장이다. "
        "글 양은 기존 교과서 수준으로 적게 쓴다: 소단원 펼침면 전체 글이 3·4학년은 300~500자, 5·6학년은 "
        "400~650자 안팎이고, 도입 글은 2~3문장, 활동 steps는 한 줄(3·4학년 25자, 5·6학년 35자 안팎), "
        "steps는 활동마다 2~4개다. 그림으로 보여 줄 수 있는 것은 글로 쓰지 말고 삽화 설명으로 넘긴다.\n"
        "11) 목적은 기존 교과서를 정리하는 것이 아니라 새 교과서를 만드는 것이다. 기존 교과서의 "
        "펼침면 제목·활동 이름·도입 이야기와 비슷하게 쓰지 말고, 이 학년 학생의 생활 장면(교실, "
        "운동장, 쉬는 시간, 계절, 학교 행사, 동네 놀이 등)에서 새 상황과 새 활동 이름을 만든다. "
        "소단원 펼침면의 제목은 화면이 소단원명을 그대로 쓰므로, headline은 그 아래 붙는 한 줄 부제로 "
        "짓는다. 소단원명을 되풀이하지 말고 학습 장면이 떠오르게 쓰며, "
        "'~에 도전해요'처럼 정해진 문형을 반복하지 않는다. creative_angle은 이번 펼침면의 발상 "
        "실마리이니 성취기준과 어울릴 때만 살린다."
    )
    additional_concept = str(context.get("additional_concept", "")).strip()
    if additional_concept:
        instructions += (
            f"\n12) 집필자가 이번 생성 요청에 추가로 남긴 지침: {additional_concept}\n"
            "위 1)~11)과 상충하지 않는 범위에서 최대한 구체적으로 반영한다."
        )
    instructions += evidence_and_feedback_instructions(context)
    # 같은 소단원을 여러 번 만들어도 매번 다른 발상에서 출발하도록 실마리를 하나 골라 준다.
    context = {**context, "creative_angle": secrets.choice(ELEMENTARY_CREATIVE_ANGLES)}
    activity_count = max(1, min(3, int(spread.get("activity_count") or 2)))
    try:
        lesson_count = int(spread.get("lesson_count") or 0)
    except (TypeError, ValueError):
        lesson_count = 1
    return request_structured_manuscript(
        api_key,
        instructions,
        context,
        "elementary_pe_manuscript",
        elementary_pe_manuscript_schema(page_role, activity_count, lesson_count),
        1,
    )


# ── 초등 체육 중단원·소단원 이름 제안 ──
# 교육과정 내용 요소에서 자동으로 만든 소단원명은 "○○에 도전해요"처럼 한 문형으로 고정돼 있다.
# 실제 검정 교과서(2022 개정 3~6학년, 전처리 차례 확인)는 학습 행동에 맞춰 동사를 바꾸고
# (길러요·실천해요·익혀요·즐겨요·표현해요·알아봐요), 학습 장면이 드러나게 짓는다. 이 예시는
# 말투와 길이 감각을 잡는 참고로만 주고, 같거나 비슷한 제목은 쓰지 않게 한다.
ELEMENTARY_PUBLISHED_TITLE_EXAMPLES = [
    "운동을 하며 체력을 길러요", "나에게 맞는 체력 운동을 해요", "이동하며 움직여요",
    "물체나 도구를 다루며 움직여요", "도구를 활용하여 표현해요", "운동으로 체력을 길러요",
    "건강한 생활 습관을 길러요", "비이동 움직임을 알아봐요", "체력운동으로 건강을 지켜요",
    "기술형 스포츠 움직임을 즐겨요", "흉내 내며 표현해요", "리듬에 맞춰 표현해요",
    "안전한 생활 습관을 실천해요", "운동 생활 습관을 실천해요", "모방 표현과 추상 표현을 해요",
    "관찰하고 표현해요", "전략형 스포츠의 움직임을 익혀요", "내 몸에 맞는 체력 운동 방법 찾기",
    "농구형 게임 하기", "게임 전략 만들기", "온몸 튼튼 관리 실천하기", "걷고 달리기", "밀고 당기기",
]


def elementary_unit_titles_schema(middle_count: int) -> dict:
    small_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["small_key", "title", "alternatives", "reason"],
        "properties": {
            "small_key": {"type": "string"},
            "title": {"type": "string"},
            "alternatives": {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "string"}},
            "reason": {"type": "string"},
        },
    }
    middle_schema = {
        "type": "object",
        "additionalProperties": False,
        "required": ["middle_key", "title", "alternatives", "smalls"],
        "properties": {
            "middle_key": {"type": "string"},
            "title": {"type": "string"},
            "alternatives": {"type": "array", "minItems": 2, "maxItems": 2, "items": {"type": "string"}},
            "smalls": {"type": "array", "items": small_schema},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["middles"],
        "properties": {
            "middles": {"type": "array", "minItems": middle_count, "maxItems": middle_count, "items": middle_schema},
        },
    }


def call_prototype_elementary_unit_titles(payload: dict) -> dict:
    middles = payload.get("middles")
    if not isinstance(middles, list) or not middles:
        raise ValueError("이름을 제안할 중단원 정보가 없습니다.")
    if len(middles) > 30 or sum(len(item.get("smalls") or []) for item in middles) > 120:
        raise ValueError("한 번에 제안할 수 있는 단원 수를 넘었습니다. 영역을 나누어 요청해 주세요.")
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 이 컴퓨터용 키를 입력해 주세요.")
    upper = payload.get("band") == "5~6학년군"
    voice = (
        "5·6학년이므로 '~해요'와 '~하기'를 섞어 쓴다(예: '~을 익혀요', '~ 전략 세우기')."
        if upper
        else "3·4학년이므로 친근한 '~해요' 말투로 쓴다."
    )
    instructions = (
        "당신은 2022 개정 교육과정 초등학교 체육 검정 교과서의 기획 편집자다. "
        f"{payload.get('grade_label', '')} 교과서의 중단원명과 소단원명을 새로 짓는다.\n"
        "다음을 반드시 지킨다.\n"
        f"1) {voice} 제목은 8~20자로 짧게 쓴다.\n"
        "2) 소단원명은 원 활동(source_activity)이 무엇인지 알아볼 수 있어야 하고, 그 활동의 학습 "
        "행동에 맞는 동사를 고른다(체력은 기르기, 건강·안전은 실천하기, 기능은 익히기, 게임은 전략·"
        "게임하기, 생태는 자연에서 즐기기, 표현은 표현하기 등). '~에 도전해요'는 기록·도전 활동에만 "
        "쓰고, 같은 중단원 안에서 같은 문형으로 끝나는 제목을 두 개 넘게 만들지 않는다.\n"
        "3) 중단원명은 그 안의 소단원을 묶는 배움의 방향이 드러나게 쓴다. 교육과정 용어(official_title)를 "
        "그대로 옮기지 말고 학생 눈높이의 말로 바꾼다.\n"
        "4) published_examples는 기존 교과서 제목이다. 말투와 길이 감각만 참고하고, 같거나 거의 같은 "
        "제목은 쓰지 않는다. 새 교과서다운 참신한 표현을 찾는다.\n"
        "5) 성취기준(standards)의 지식·기능·태도와 어긋나지 않게 한다. 지나친 말장난·유행어·외래어는 "
        "피한다.\n"
        "6) alternatives에는 결이 다른 대안 제목 2개를 쓰고, reason에는 이 제목을 고른 까닭을 한 문장으로 쓴다.\n"
        "7) 입력의 middle_key·small_key를 그대로 돌려주고, 입력에 있는 소단원을 하나도 빼거나 더하지 않는다."
    )
    concept = str(payload.get("concept", "")).strip()
    if concept:
        instructions += f"\n8) 집필자가 남긴 추가 지침: {concept} (위 1)~7)과 상충하지 않게 반영한다.)"
    context = {
        "grade_label": payload.get("gradeLabel", ""),
        "band": payload.get("band", ""),
        "standards": payload.get("standards", [])[:40],
        "published_examples": ELEMENTARY_PUBLISHED_TITLE_EXAMPLES,
        "middles": [
            {
                "middle_key": str(item.get("key", "")),
                "domain": item.get("domain", ""),
                "subdomain": item.get("subdomain", ""),
                "official_title": item.get("officialTitle", ""),
                "current_title": item.get("currentTitle", ""),
                "smalls": [
                    {
                        "small_key": str(small.get("key", "")),
                        "source_activity": small.get("sourceActivity", ""),
                        "current_title": small.get("currentTitle", ""),
                        "hours": small.get("hours", 0),
                    }
                    for small in (item.get("smalls") or [])
                ],
            }
            for item in middles
        ],
    }
    generated = request_structured_manuscript(
        api_key,
        instructions,
        context,
        "elementary_unit_titles",
        elementary_unit_titles_schema(len(middles)),
        len(middles),
        count_key="middles",
    )
    # AI가 키를 바꾸거나 빠뜨린 소단원은 버리고, 입력에 있던 것만 돌려준다.
    known = {str(item.get("key", "")): {str(small.get("key", "")) for small in (item.get("smalls") or [])} for item in middles}
    result = []
    for middle in generated.get("middles", []):
        key = middle.get("middle_key", "")
        if key not in known:
            continue
        result.append({
            "key": key,
            "title": str(middle.get("title", "")).strip(),
            "alternatives": [str(text).strip() for text in middle.get("alternatives", []) if str(text).strip()],
            "smalls": [
                {
                    "key": small.get("small_key", ""),
                    "title": str(small.get("title", "")).strip(),
                    "alternatives": [str(text).strip() for text in small.get("alternatives", []) if str(text).strip()],
                    "reason": str(small.get("reason", "")).strip(),
                }
                for small in middle.get("smalls", [])
                if small.get("small_key", "") in known[key] and str(small.get("title", "")).strip()
            ],
        })
    return {"middles": result, "model": manuscript_ai_config()["model"]}


def call_prototype_elementary_pe_manuscript(payload: dict) -> dict:
    if not str(payload.get("smallTitle", "")).strip():
        raise ValueError("소단원 정보가 없습니다.")
    spread = payload.get("spread")
    if not isinstance(spread, dict):
        raise ValueError("생성할 펼침면 정보가 없습니다.")
    context = {
        "page_role": payload.get("pageRole", "small-unit"),
        "grade_label": payload.get("gradeLabel", ""),
        "band": payload.get("band", ""),
        "domain": payload.get("domain", ""),
        "subdomain": payload.get("subdomain", ""),
        "middle_title": payload.get("middleTitle", ""),
        "small_unit_title": payload.get("smallTitle", ""),
        "source_activity": payload.get("sourceActivity", ""),
        "lesson_type": payload.get("lessonTypeLabel", ""),
        "lesson_flow": payload.get("lessonTypeFlow", ""),
        "standards": payload.get("standards") or [],
        "style_label": payload.get("styleLabel", "균형형"),
        "additional_concept": str(payload.get("additionalConcept", "")).strip(),
        "unit_title": payload.get("unitTitle", ""),
        "unit_outline": payload.get("unitOutline") or [],
        "corner_label": payload.get("cornerLabel", ""),
        "spread": {
            "lesson_label": spread.get("lessonLabel", ""),
            "lesson_count": spread.get("lessonCount", 0),
            "phases": spread.get("phases") or [],
            "activity_count": spread.get("activityCount", 2),
            "suggested_activity_titles": spread.get("suggestedActivityTitles") or [],
            "position": f"{int(spread.get('index', 0)) + 1}/{spread.get('count', 1)}",
            "evidence": spread.get("evidence") or [],
        },
        "field_feedback": clean_feedback_notes(payload.get("feedbackNotes")),
    }
    context["searched_evidence"] = searched_evidence_for({**context, "small_title": context["small_unit_title"]}, "elementary")
    return call_openai_for_elementary_pe_manuscript(context)


VISUAL_SIZE_TO_IMAGE_SIZE = {
    "full": "1536x1024",
    "half": "1536x1024",
    "small": "1024x1024",
}


IMAGE_AUDIENCE_STYLES = {
    "elementary": (
        "초등학교 체육 검정 교과서 편집 시안에 들어갈 삽화 초안. 밝고 친근한 초등 교과서 "
        "일러스트 스타일로, 3~6학년 어린이들이 안전하게 활동하는 모습을 그린다. 실제 인물처럼 "
        "특정인을 닮게 그리지 말고, 텍스트나 글자는 그리지 않는다."
    ),
}


def call_openai_for_sports_culture_image(description: str, size: str, audience: str = "") -> dict:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 이 컴퓨터용 키를 입력해 주세요.")
    if not description.strip():
        raise ValueError("이미지로 그릴 내용(description)이 없습니다.")
    image_size = VISUAL_SIZE_TO_IMAGE_SIZE.get(size, "1024x1024")
    style = IMAGE_AUDIENCE_STYLES.get(audience) or (
        "고등학교 스포츠 문화 인정교과서 편집 시안에 들어갈 삽화 초안. 실제 인물 "
        "사진처럼 특정인을 닮게 그리지 말고, 일반적인 편집 삽화·다이어그램 스타일로 "
        "그린다. 텍스트나 글자는 그리지 않는다."
    )
    prompt = f"{style} 장면 설명: {description}"
    request_body = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "size": image_size,
        "n": 1,
    }
    request = Request(
        "https://api.openai.com/v1/images/generations",
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
        raise ValueError(f"OpenAI 이미지 생성 오류: {message[:500]}") from exc
    except TimeoutError as exc:
        raise ValueError(
            "OpenAI 이미지 생성 제한 시간(50초)을 초과했습니다. 잠시 후 다시 시도해 주세요."
        ) from exc
    except URLError as exc:
        raise ValueError(
            "로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인하고 "
            "서버를 다시 실행해 주세요."
        ) from exc
    except (HttpClientError, ConnectionError) as exc:
        raise ValueError(
            "OpenAI 이미지 응답을 받는 중 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요."
        ) from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            "OpenAI 응답을 이미지 형식으로 해석하지 못했습니다. 다시 생성해 주세요."
        ) from exc
    items = payload.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise ValueError("OpenAI가 이미지 데이터를 반환하지 않았습니다.")
    return {"imageBase64": items[0]["b64_json"]}


# 생성된 이미지(base64, 장당 약 2~3MB)는 projectStore에 그대로 두면 localStorage 용량과
# 서버 동기화 요청 크기를 넘겨서(WORKLOG "Stop persisting AI-generated images" 참고) 클라이언트가
# 저장·동기화 시 imageBase64를 항상 제외한다. 그 대신 이미지를 여기 별도 테이블에 저장하고
# 가벼운 id만 projectStore에 남겨, 다른 컴퓨터에서도 그 id로 이미지를 다시 받아 볼 수 있게 한다.

def ensure_prototype_image_table(db) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS prototype_image (
            id TEXT PRIMARY KEY,
            image_base64 TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()


def store_prototype_image(image_base64: str) -> str:
    image_id = secrets.token_hex(16)
    with connect_db() as db:
        ensure_prototype_image_table(db)
        db.execute(
            "INSERT INTO prototype_image (id, image_base64, created_at) VALUES (?, ?, ?)",
            (image_id, image_base64, utc_now()),
        )
        db.commit()
    return image_id


def fetch_prototype_image(image_id: str) -> str | None:
    with connect_db() as db:
        ensure_prototype_image_table(db)
        row = db.execute(
            "SELECT image_base64 FROM prototype_image WHERE id = ?", (image_id,)
        ).fetchone()
    return row["image_base64"] if row else None


def call_prototype_sports_culture_image(payload: dict) -> dict:
    description = str(payload.get("description", ""))
    size = str(payload.get("size", "small"))
    audience = str(payload.get("audience", ""))
    result = call_openai_for_sports_culture_image(description, size, audience)
    image_id = store_prototype_image(result["imageBase64"])
    return {"imageBase64": result["imageBase64"], "imageId": image_id}


def call_prototype_image_get(image_id: str) -> dict:
    image_base64 = fetch_prototype_image(image_id)
    if image_base64 is None:
        raise ValueError("이미지를 찾을 수 없습니다. 다시 생성해 주세요.")
    return {"imageBase64": image_base64}


# --- DesignCraft 조판 연결(designcraft_export.py) — 각자 컴퓨터에 설치된 DesignCraft로
# 초고 펼침면을 조판한다. 프로그램 실행과 파일 열기가 따르므로 로컬 서버에서만 받는다.

DESIGNCRAFT_FILE_TYPES = {
    ".pdf": ("application/pdf", True),
    ".idml": ("application/vnd.adobe.indesign-idml-package", False),
    ".designcraft": ("application/octet-stream", False),
    ".png": ("image/png", True),
}


def designcraft_build_path(path_value: object) -> Path:
    """브라우저가 보낸 경로가 조판 결과 폴더 안의 파일인지 확인한다(다른 파일 열람·실행 방지)."""
    root = designcraft_export.output_root(APP_DIR)
    path = Path(str(path_value or ""))
    if path_value and not (designcraft_export.is_inside(root, str(path)) and path.exists()):
        # 데이터 폴더를 다른 컴퓨터·위치로 옮긴 뒤에도 예전에 적어 둔 경로의 뒷부분(조판 폴더/파일)으로 찾는다.
        parts = path.parts
        for index in range(1, len(parts)):
            candidate = root.joinpath(*parts[index:])
            if candidate.exists() and designcraft_export.is_inside(root, str(candidate)):
                path = candidate
                break
    if not path_value or not designcraft_export.is_inside(root, str(path)) or not path.exists():
        raise ValueError("조판 결과 폴더 안의 파일이 아닙니다.")
    return path


def call_designcraft_build(payload: dict) -> dict:
    return designcraft_export.build_designcraft_book(payload, APP_DIR, fetch_prototype_image)


def call_designcraft_open(payload: dict) -> dict:
    path = designcraft_build_path(payload.get("path"))
    return designcraft_export.open_in_designcraft(str(path))


def call_designcraft_reveal(payload: dict) -> dict:
    path = designcraft_build_path(payload.get("path"))
    if os.name != "nt":
        raise ValueError("폴더 열기는 Windows에서만 지원합니다.")
    target = path if path.is_dir() else path.parent
    subprocess.Popen(["explorer", str(target)])
    return {"opened": target.as_posix()}


# --- 디자인 시안 → 조판(mockup_typeset.py) — 펼침면마다 AI가 참고 시안 스타일로 완성 디자인 시안을
# 그리고(gpt-image-2), 그 시안의 배치를 읽어(Responses API) DesignCraft 문서로 옮긴다. 시안 이미지는
# prototype_image 표에, 읽어 낸 배치 명세는 아래 표에 두어 projectStore에는 id만 남긴다.
# mockup_typeset은 Pillow가 필요해 로컬 조판 요청에서만 불러온다(배포본에는 Pillow가 없다).

def mockup_reference_dir() -> Path:
    """시안 스타일 참고 이미지 폴더(mockup_typeset.reference_dir과 같은 규칙)."""
    configured = os.environ.get("MOCKUP_STYLE_DIR", "").strip()
    return Path(configured) if configured else APP_DIR / "design-references"


def ensure_mockup_layout_table(db) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS prototype_mockup_layout (
            image_id TEXT PRIMARY KEY,
            layout_json TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )
    db.commit()


def store_mockup_layout(image_id: str, layout: dict) -> None:
    with connect_db() as db:
        ensure_mockup_layout_table(db)
        db.execute("DELETE FROM prototype_mockup_layout WHERE image_id = ?", (image_id,))
        db.execute(
            "INSERT INTO prototype_mockup_layout (image_id, layout_json, created_at) VALUES (?, ?, ?)",
            (image_id, json.dumps(layout, ensure_ascii=False), utc_now()),
        )
        db.commit()


def fetch_mockup_layout(image_id: str) -> dict | None:
    with connect_db() as db:
        ensure_mockup_layout_table(db)
        row = db.execute("SELECT layout_json FROM prototype_mockup_layout WHERE image_id = ?", (image_id,)).fetchone()
    return json.loads(row["layout_json"]) if row else None


def require_openai_key() -> str:
    api_key = secret_environment_value("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API 키(OPENAI_API_KEY)가 설정되지 않았습니다. 왼쪽 아래 'AI 생성 키'에서 이 컴퓨터용 키를 입력해 주세요.")
    return api_key


def call_designcraft_mockup(payload: dict) -> dict:
    import mockup_typeset

    spread = payload.get("spread")
    if not isinstance(spread, dict) or not (spread.get("headline") or spread.get("leftSections") or spread.get("rightSections")):
        raise ValueError("시안으로 그릴 펼침면 원고가 없습니다.")
    api_key = require_openai_key()
    references = mockup_typeset.reference_images(APP_DIR)
    structure = mockup_typeset.structure_references(APP_DIR, str(spread.get("pageRole") or ""))
    # 편집자가 "디자인 기준"으로 정한 이 책의 시안(최대 2장)을 함께 보내 같은 책처럼 보이게 한다.
    standard_ids = [str(item) for item in (payload.get("standardImageIds") or []) if str(item).strip()][:2]
    with tempfile.TemporaryDirectory() as folder:
        standards = []
        for index, image_id in enumerate(standard_ids):
            data = fetch_prototype_image(image_id)
            if not data:
                continue
            path = Path(folder) / f"standard{index + 1}.png"
            path.write_bytes(base64.b64decode(data))
            standards.append(path)
        image_base64 = mockup_typeset.request_mockup_image(
            api_key, spread, references, str(payload.get("instruction") or ""), structure=structure, standards=standards,
        )
    return {"imageId": store_prototype_image(image_base64), "references": len(structure) + len(standards) + (0 if standards else len(references))}


def call_designcraft_mockup_layout(payload: dict) -> dict:
    import mockup_typeset

    image_id = str(payload.get("imageId") or "")
    image_base64 = fetch_prototype_image(image_id) if image_id else None
    if not image_base64:
        raise ValueError("배치를 읽을 시안 이미지를 찾지 못했습니다. 시안을 다시 생성해 주세요.")
    spread = payload.get("spread") if isinstance(payload.get("spread"), dict) else {}
    api_key = require_openai_key()
    layout = mockup_typeset.request_layout(api_key, manuscript_ai_config()["model"], image_base64, spread)
    if not layout["items"]:
        raise ValueError("AI가 시안에서 배치를 읽어 내지 못했습니다. 다시 시도해 주세요.")
    ensure_mockup_plate(image_id, layout, api_key, image_base64)
    store_mockup_layout(image_id, layout)
    return {"imageId": image_id, "items": len(layout["items"]), "plateMode": layout.get("plateMode")}


def ensure_mockup_plate(image_id: str, layout: dict, api_key: str = "", image_base64: str | None = None) -> dict:
    """배치 명세에 바탕판(글을 지운 시안)이 없으면 만든다. layout을 고치고 돌려준다(저장은 부르는 쪽에서)."""
    import mockup_typeset

    if layout.get("plateId") and fetch_prototype_image(layout["plateId"]):
        return layout
    image_base64 = image_base64 or fetch_prototype_image(image_id)
    if not image_base64:
        return layout
    try:
        plate_base64, mode = mockup_typeset.make_plate(image_base64, layout, api_key)
    except (OSError, ValueError):
        # 시안 그림을 읽지 못하면 바탕판 없이(상자·그림을 잘라 다시 놓는 예전 방식) 둔다.
        return layout
    layout["plateId"] = store_prototype_image(plate_base64)
    layout["plateMode"] = mode
    layout["previewId"] = store_prototype_image(mockup_typeset.render_plate_preview(plate_base64, layout))
    return layout


def call_designcraft_mockup_layout_get(payload: dict) -> dict:
    image_id = str(payload.get("imageId") or "")
    layout = fetch_mockup_layout(image_id) if image_id else None
    if not layout:
        raise ValueError("이 시안의 배치 명세가 없습니다. 배치를 먼저 읽어 주세요.")
    if not layout.get("plateId"):
        ensure_mockup_plate(image_id, layout, secret_environment_value("OPENAI_API_KEY") or "")
        store_mockup_layout(image_id, layout)
    return {"imageId": image_id, "layout": layout}


def call_designcraft_mockup_layout_save(payload: dict) -> dict:
    """화면에서 고친 시안 글상자 내용을 배치 명세에 반영한다(위치·모양은 그대로)."""
    image_id = str(payload.get("imageId") or "")
    layout = fetch_mockup_layout(image_id) if image_id else None
    if not layout:
        raise ValueError("이 시안의 배치 명세가 없습니다. 배치를 먼저 읽어 주세요.")
    texts = payload.get("texts")
    if not isinstance(texts, dict) or not texts:
        raise ValueError("고친 글이 없습니다.")
    items = layout.get("items") or []
    changed = 0
    for key, value in texts.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        if 0 <= index < len(items) and items[index].get("kind") == "text":
            items[index]["text"] = str(value)[:4000]
            changed += 1
    if not changed:
        raise ValueError("고칠 수 있는 글상자를 찾지 못했습니다.")
    plate = fetch_prototype_image(layout["plateId"]) if layout.get("plateId") else None
    if plate:
        import mockup_typeset

        layout["previewId"] = store_prototype_image(mockup_typeset.render_plate_preview(plate, layout))
    store_mockup_layout(image_id, layout)
    return {"imageId": image_id, "changed": changed, "previewId": layout.get("previewId")}


def call_designcraft_mockup_build(payload: dict) -> dict:
    import tempfile

    import mockup_typeset

    rows = [row for row in payload.get("spreads") or [] if isinstance(row, dict)]
    if not rows:
        raise ValueError("조판할 시안이 없습니다. 먼저 디자인 시안을 생성해 주세요.")
    if len(rows) > 260:
        raise ValueError("한 번에 260개 펼침면까지 조판할 수 있습니다.")
    # objects: 상자·선·글을 고칠 수 있는 개체로(삽화만 그림) · plate: 시안 그림을 바탕에 깔고 글상자만 얹음
    mode = "plate" if payload.get("mode") == "plate" else "objects"
    with tempfile.TemporaryDirectory() as folder:
        specs = []
        for index, row in enumerate(rows):
            image_id = str(row.get("imageId") or "")
            image_base64 = fetch_prototype_image(image_id) if image_id else None
            layout = fetch_mockup_layout(image_id) if image_id else None
            if not image_base64 or not layout:
                raise ValueError(f"{index + 1}번째 펼침면의 시안 또는 배치 명세가 없습니다. 배치 읽기를 다시 해 주세요.")
            path = Path(folder) / f"mockup{index:03d}.png"
            path.write_bytes(base64.b64decode(image_base64))
            if not layout.get("plateId"):
                # 바탕판이 생기기 전에 배치를 읽은 시안도 바탕판 방식으로 조판한다.
                ensure_mockup_plate(image_id, layout, secret_environment_value("OPENAI_API_KEY") or "", image_base64)
                store_mockup_layout(image_id, layout)
            spec = {**layout, "image": str(path)}
            plate_base64 = fetch_prototype_image(layout["plateId"]) if layout.get("plateId") else None
            if plate_base64:
                plate_path = Path(folder) / f"plate{index:03d}.png"
                plate_path.write_bytes(base64.b64decode(plate_base64))
                if mode == "plate":
                    spec["plate"] = str(plate_path)
                else:
                    # 개체 조판: 상자·선·글은 DesignCraft 개체로 만들고, 삽화만 글자를 지운 바탕판에서 오려 낸다
                    # (원본에서 오리면 삽화 위 글이 그림에 남아 글상자와 겹친다).
                    spec["artSource"] = str(plate_path)
            specs.append(spec)
        start_page = int(payload.get("startPage") or 2)
        title = str(payload.get("title") or "디자인 시안 조판")
        return mockup_typeset.build_mockup_book(specs, APP_DIR, title=title, start_page=start_page)


# --- 프로토타입(static/prototype.js) 전체 상태 저장 — 지금까지 브라우저 localStorage에만
# 있던 프로젝트·초안 데이터를 서버 DB에도 동기화해, 다른 컴퓨터에서 열어도 같은 내용을
# 볼 수 있게 한다. 편집자 여러 명이 아니라 한 사람이 여러 기기에서 쓰는 상황을 가정해
# 단일 공유 레코드(운영 서비스의 workflow_stages와 같은 패턴)로 저장한다.
#
# initialize_database()는 로컬 서버(main())에서만 실행되고 Vercel 배포(api/index.py)에서는
# 호출되지 않으므로, 이 테이블은 요청마다 존재를 스스로 보장한다(CREATE TABLE IF NOT EXISTS는
# 반복 실행해도 안전하고 비용이 거의 없다).

def ensure_prototype_state_table(db) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS prototype_state (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            payload TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at TEXT NOT NULL
        );
        """
    )
    db.commit()


# prototype_state는 모든 편집자가 공유하는 단 하나의 행(id = 1)이다 — 사용자별로 나뉘어
# 있지 않다. 그래서 클라이언트 쪽 버그(예: 프로젝트를 잘못 다듬어 빈 상태로 만든 뒤 그걸
# 그대로 저장)가 한 번만 발생해도 전체 사용자의 데이터가 통째로 덮어써질 수 있다. 덮어쓰기
# 전 이전 내용을 여기에 남겨 두면, 어떤 이유로든 잘못된 내용이 저장되어도 이전 시점으로
# 되돌릴 수 있다(서버가 스스로 갖는 안전망 — 개별 사용자가 수동으로 내려받아 두는 것과
# 별개로, 모든 저장 시점마다 자동으로 쌓인다).
def ensure_prototype_state_history_table(db) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS prototype_state_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            version INTEGER NOT NULL,
            payload TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT NOT NULL
        );
        """
    )
    db.commit()


def prototype_state_record() -> dict | None:
    with connect_db() as db:
        ensure_prototype_state_table(db)
        row = db.execute(
            "SELECT payload, version, updated_at FROM prototype_state WHERE id = 1"
        ).fetchone()
    if row is None:
        return None
    return {
        "payload": json.loads(row["payload"]),
        "version": row["version"],
        "updatedAt": row["updated_at"],
    }


def store_prototype_state(payload: dict, expected_version: int | None) -> dict:
    now = utc_now()
    encoded = json.dumps(payload, ensure_ascii=False)
    with connect_db() as db:
        ensure_prototype_state_table(db)
        ensure_prototype_state_history_table(db)
        current = db.execute(
            "SELECT payload, version, updated_at FROM prototype_state WHERE id = 1"
        ).fetchone()
        if current is None:
            db.execute(
                "INSERT INTO prototype_state (id, payload, version, updated_at) VALUES (1, ?, 1, ?)",
                (encoded, now),
            )
        else:
            current_version = int(current["version"])
            ensure_current_version(current_version, expected_version)
            db.execute(
                """
                INSERT INTO prototype_state_history (version, payload, updated_at, archived_at)
                VALUES (?, ?, ?, ?)
                """,
                (current_version, current["payload"], current["updated_at"], now),
            )
            next_version = current_version + 1
            updated = db.execute(
                """
                UPDATE prototype_state SET payload = ?, version = ?, updated_at = ?
                WHERE id = 1 AND version = ?
                """,
                (encoded, next_version, now, current_version),
            )
            if updated.rowcount != 1:
                raise VersionConflictError(
                    "다른 컴퓨터에서 먼저 저장했습니다. 최신 내용을 다시 불러온 뒤 저장해 주세요."
                )
        db.commit()
    return prototype_state_record()


def prototype_state_history_versions(limit: int = 50) -> list[dict]:
    with connect_db() as db:
        ensure_prototype_state_history_table(db)
        rows = db.execute(
            """
            SELECT id, version, updated_at, archived_at
            FROM prototype_state_history
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "historyId": row["id"],
            "version": row["version"],
            "updatedAt": row["updated_at"],
            "archivedAt": row["archived_at"],
        }
        for row in rows
    ]


def restore_prototype_state_history(history_id: int) -> dict:
    with connect_db() as db:
        ensure_prototype_state_table(db)
        ensure_prototype_state_history_table(db)
        history_row = db.execute(
            "SELECT payload FROM prototype_state_history WHERE id = ?", (history_id,)
        ).fetchone()
        if history_row is None:
            raise ValueError("해당 이력을 찾을 수 없습니다.")
        current = db.execute(
            "SELECT payload, version, updated_at FROM prototype_state WHERE id = 1"
        ).fetchone()
        now = utc_now()
        if current is not None:
            current_version = int(current["version"])
            db.execute(
                """
                INSERT INTO prototype_state_history (version, payload, updated_at, archived_at)
                VALUES (?, ?, ?, ?)
                """,
                (current_version, current["payload"], current["updated_at"], now),
            )
            next_version = current_version + 1
            db.execute(
                "UPDATE prototype_state SET payload = ?, version = ?, updated_at = ? WHERE id = 1",
                (history_row["payload"], next_version, now),
            )
        else:
            db.execute(
                "INSERT INTO prototype_state (id, payload, version, updated_at) VALUES (1, ?, 1, ?)",
                (history_row["payload"], now),
            )
        db.commit()
    return prototype_state_record()


def call_prototype_state_get() -> dict:
    record = prototype_state_record()
    return record or {"payload": None, "version": 0, "updatedAt": None}


def call_prototype_state_save(payload: dict) -> dict:
    project_store = payload.get("payload")
    if not isinstance(project_store, dict):
        raise ValueError("저장할 프로젝트 데이터가 없습니다.")
    expected_version = payload.get("expectedVersion")
    if expected_version is not None and (
        isinstance(expected_version, bool) or not isinstance(expected_version, int) or expected_version < 0
    ):
        raise ValueError("저장 기준 버전이 올바르지 않습니다.")
    return store_prototype_state(project_store, expected_version or None)


def _lesson_stage_minutes(count: int) -> list[int]:
    # 실제 차시별 배정 시간 데이터가 없어 50분 수업 기준의 통상적인 도입·전개·정리 배분을
    # 기본값으로 제공한다 — 편집자가 실제 수업 상황에 맞게 표에서 바로 고쳐 쓰는 것을 전제한다.
    total = 50
    if count <= 0:
        return []
    if count == 1:
        return [total]
    if count == 2:
        return [10, total - 10]
    first, last = 5, 8
    remaining = total - first - last
    middle_count = count - 2
    base = remaining // middle_count
    extra = remaining - base * middle_count
    middles = [base + (1 if i < extra else 0) for i in range(middle_count)]
    return [first, *middles, last]


TABLE_EXPORT_TYPES = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "hwpx": "application/hwp+zip",
}


def build_table_export(payload: dict) -> tuple[bytes, str, str]:
    """화면의 표(단원명 제안 이력 등)를 엑셀·워드·한글 파일로 만든다. PDF는 화면에서 만든다."""
    file_format = str(payload.get("format", "")).lower()
    if file_format not in TABLE_EXPORT_TYPES:
        raise ValueError("지원하지 않는 파일 형식입니다.")
    columns = [str(item) for item in payload.get("columns") or []]
    rows = [[str(value) for value in row] for row in payload.get("rows") or [] if isinstance(row, list)]
    if not columns:
        raise ValueError("내려받을 표가 없습니다.")
    if len(rows) > 2000 or len(columns) > 20:
        raise ValueError("표가 너무 큽니다.")
    title = str(payload.get("title") or "표").strip()[:80]
    subtitle = str(payload.get("subtitle") or "").strip()[:300]
    widths = payload.get("widths")
    widths = [float(value) for value in widths] if isinstance(widths, list) and len(widths) == len(columns) else None
    filename = re.sub(r'[\\/:*?"<>|]', "_", str(payload.get("filename") or title)).strip() or "표"
    if file_format == "xlsx":
        content = build_xlsx(title, columns, rows, widths)
    elif file_format == "docx":
        content = build_docx(title, columns, rows, widths, subtitle)
    else:
        blocks = ([("paragraph", subtitle, 0)] if subtitle else []) + [
            ("table", {"rows": [columns, *rows], "column_weights": widths}, 0)
        ]
        content = build_hwpx(title, blocks, cell_margin_mm=1.2)
    return content, f"{filename}.{file_format}", TABLE_EXPORT_TYPES[file_format]


def build_lesson_plan_hwpx(payload: dict) -> tuple[bytes, str]:
    spreads = payload.get("spreads")
    if not isinstance(spreads, list) or not spreads:
        raise ValueError("교수학습과정안을 만들 차시 정보가 없습니다.")
    unit_label = str(payload.get("unitLabel") or "")
    framework_name = str(payload.get("frameworkName") or "")
    carrier_sport = str(payload.get("carrierSport") or "").strip() or "특정 종목 없음"
    standard_codes = ", ".join(payload.get("standardCodes") or [])
    title = f"{unit_label} · 교수학습과정안" if unit_label else "교수학습과정안"

    blocks: list[tuple[str, object, int]] = []
    for spread_index, spread in enumerate(spreads):
        spread_label = str(spread.get("spreadLabel") or f"{spread_index + 1}차시")
        blocks.append(("heading", f"{spread_label} 교수학습과정안", 1))
        blocks.append((
            "table",
            {
                "rows": [
                    ["교과(군)", "체육 · 스포츠 문화"],
                    ["단원", unit_label],
                    ["체제안", framework_name],
                    ["차시", spread_label],
                    ["종목", carrier_sport],
                    ["성취기준", standard_codes],
                ],
                "column_weights": [1, 3],
            },
            2,
        ))

        lesson_goals = [str(item) for item in (spread.get("lessonGoals") or []) if str(item).strip()]
        if lesson_goals:
            blocks.append(("heading", "학습 목표", 2))
            for goal in lesson_goals:
                blocks.append(("bullet", goal, 3))

        lesson_flow = [item for item in (spread.get("lessonFlow") or []) if isinstance(item, dict)]
        if lesson_flow:
            blocks.append(("heading", "교수·학습 과정", 2))
            minutes = _lesson_stage_minutes(len(lesson_flow))
            rows = [["단계", "교수·학습 활동", "시간(분)"]]
            for item, minute in zip(lesson_flow, minutes):
                stage = str(item.get("stage") or "")
                guidance = str(item.get("guidance") or "")
                rows.append([stage, guidance, str(minute)])
            blocks.append(("table", {"rows": rows, "column_weights": [1, 5, 0.8]}, 3))
            blocks.append(("paragraph", "※ 시간(분)은 50분 수업 기준 기본 배분값입니다. 실제 수업 상황에 맞게 수정해 사용하세요.", 3))

        questions = [str(item) for item in (spread.get("questions") or [])]
        expected_responses = [str(item) for item in (spread.get("expectedResponses") or [])]
        if questions or expected_responses:
            blocks.append(("heading", "핵심 발문과 예상 답변", 2))
            rows = [["발문", "예상 답변"]]
            for index in range(max(len(questions), len(expected_responses))):
                rows.append([
                    questions[index] if index < len(questions) else "",
                    expected_responses[index] if index < len(expected_responses) else "",
                ])
            blocks.append(("table", {"rows": rows, "column_weights": [1, 1]}, 3))

        preparation = [str(item) for item in (spread.get("preparation") or [])]
        teaching_notes = [str(item) for item in (spread.get("teachingNotes") or [])]
        differentiation = [str(item) for item in (spread.get("differentiation") or [])]
        safety = str(spread.get("safety") or "")
        blocks.append(("heading", "준비물 및 유의점", 2))
        blocks.append((
            "table",
            {
                "rows": [
                    ["준비물", " · ".join(preparation)],
                    ["지도상의 유의점", "\n".join(teaching_notes)],
                    ["개별화·대체 참여", "\n".join(differentiation)],
                    ["안전·포용", safety],
                ],
                "column_weights": [1, 3],
            },
            3,
        ))

        assessment = [str(item) for item in (spread.get("assessment") or [])]
        if assessment:
            blocks.append(("heading", "평가 계획", 2))
            rows = [["번호", "평가 내용"]]
            for index, item in enumerate(assessment):
                rows.append([str(index + 1), item])
            blocks.append(("table", {"rows": rows, "column_weights": [0.5, 6]}, 3))

    content = build_hwpx(
        title,
        blocks,
        title_size=13,
        heading_sizes={1: 13, 2: 12, 3: 11},
        cell_margin_mm=3,
    )
    date_stamp = datetime.now().strftime("%Y%m%d")
    safe_title = (unit_label or "교수학습과정안").replace("/", "_").replace("·", "_").strip() or "교수학습과정안"
    filename = f"{safe_title}_교수학습과정안_{date_stamp}.hwpx"
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
        extension = Path(filename).suffix.lower() if Path(filename).suffix.isascii() else ""
        ascii_name = f"textbook-studio-export{extension or '.bin'}"
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

    def is_local_request(self) -> bool:
        host = (self.headers.get("Host", "").rsplit(":", 1)[0]).strip("[]").lower()
        return self.client_address[0] in ("127.0.0.1", "::1") and host in ("127.0.0.1", "localhost", "::1")

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
        if parsed.path == "/api/prototype/state":
            self.send_json({"result": call_prototype_state_get()})
            return
        if parsed.path == "/api/settings/openai-key":
            self.send_json({"result": {**openai_key_status(), "local": self.is_local_request()}})
            return
        if parsed.path == "/api/settings/data-folder":
            status = data_folder_status()
            status["name"] = work_folder_root().name if status["custom"] else ""
            self.send_json({"result": {**status, "local": self.is_local_request(), "editable": not os.environ.get("VERCEL") and not os.environ.get("TEXTBOOK_STUDIO_DB")}})
            return
        if parsed.path in ("/api/folder/list", "/api/folder/file"):
            try:
                if not self.is_local_request():
                    raise AuthorizationError("작업 폴더는 도구를 실행 중인 그 컴퓨터에서만 쓸 수 있습니다.")
                query = parse_qs(parsed.query)
                relative = query.get("path", [""])[0]
                if parsed.path == "/api/folder/list":
                    self.send_json({"result": work_folder_list(relative, query.get("kind", [""])[0])})
                else:
                    path = work_folder_path(relative)
                    if not path.is_file():
                        self.send_json({"error": "파일이 없습니다."}, HTTPStatus.NOT_FOUND)
                        return
                    content = path.read_bytes()
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(content)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/prototype/designcraft/status":
            references = [path.name for path in sorted(mockup_reference_dir().glob("*")) if path.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")][:4] if mockup_reference_dir().is_dir() else []
            self.send_json({"result": {**designcraft_export.designcraft_status(), "local": self.is_local_request(), "mockupReferences": references}})
            return
        mockup_image_prefix = "/api/prototype/designcraft/mockup-image/"
        if parsed.path.startswith(mockup_image_prefix):
            # 시안 갤러리의 <img>가 바로 쓰는 PNG. 같은 id의 이미지는 바뀌지 않으므로 오래 캐시한다.
            image_base64 = fetch_prototype_image(unquote(parsed.path[len(mockup_image_prefix):]))
            if not image_base64:
                self.send_json({"error": "시안 이미지를 찾을 수 없습니다."}, HTTPStatus.NOT_FOUND)
                return
            content = base64.b64decode(image_base64)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "private, max-age=86400")
            self.end_headers()
            self.wfile.write(content)
            return
        if parsed.path == "/api/prototype/designcraft/file":
            try:
                if not self.is_local_request():
                    raise AuthorizationError("조판 파일은 도구를 실행 중인 그 컴퓨터에서만 열 수 있습니다.")
                path = designcraft_build_path(parse_qs(parsed.query).get("path", [""])[0])
                content_type, inline = DESIGNCRAFT_FILE_TYPES.get(path.suffix.lower(), (None, False))
                if not content_type or not path.is_file():
                    raise ValueError("내려받을 수 없는 파일입니다.")
                content = path.read_bytes()
                if inline:
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(content)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(content)
                else:
                    self.send_download(content, path.name, content_type)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            return
        if parsed.path == "/api/prototype/state/history":
            try:
                require_owner(self.current_user)
                self.send_json({"result": prototype_state_history_versions()})
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            return
        prototype_image_prefix = "/api/prototype/image/"
        if parsed.path.startswith(prototype_image_prefix):
            try:
                image_id = unquote(parsed.path[len(prototype_image_prefix) :])
                self.send_json({"result": call_prototype_image_get(image_id)})
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
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
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/login":
            try:
                self.send_json(login_user(self.read_json()))
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/auth/logout":
            logout_user(self.headers.get("Authorization", ""))
            self.send_json({"result": "ok"})
            return
        if parsed.path == "/api/auth/change-password":
            try:
                user = self.require_user()
                change_password(user, self.read_json())
                self.send_json({"result": "ok"})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path.startswith("/api/editors/") and parsed.path.endswith("/reset-password"):
            try:
                self.require_user()
                require_owner(self.current_user)
                email = unquote(parsed.path[len("/api/editors/"):-len("/reset-password")])
                self.send_json({"editor": reset_editor_password(email)})
            except KeyError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.NOT_FOUND)
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
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
        if parsed.path == "/api/settings/openai-key":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                if not self.is_local_request():
                    raise AuthorizationError("API 키는 도구를 실행 중인 그 컴퓨터에서만 저장할 수 있습니다.")
                if "json" not in self.headers.get("Content-Type", ""):
                    raise ValueError("JSON 요청만 받습니다.")
                payload = self.read_json()
                self.send_json({"result": save_openai_key(payload.get("key"))})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {type(exc).__name__}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/folder/file":
            try:
                if not self.is_local_request():
                    raise AuthorizationError("작업 폴더는 도구를 실행 중인 그 컴퓨터에서만 쓸 수 있습니다.")
                length = int(self.headers.get("Content-Length", "0") or 0)
                if length > FOLDER_FILE_LIMIT:
                    raise ValueError("파일이 너무 큽니다.")
                work_folder_write(parse_qs(parsed.query).get("path", [""])[0], self.rfile.read(length))
                self.send_json({"result": {"saved": True}})
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except OSError as exc:
                self.send_json({"error": f"파일을 쓰지 못했습니다: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/server/shutdown":
            # 화면의 "도구 끄기" 버튼. 이 컴퓨터에서 연 화면만 끌 수 있고, JSON 요청만 받는다(다른 사이트가 몰래 못 끄게).
            try:
                if not self.is_local_request() or os.environ.get("VERCEL"):
                    raise AuthorizationError("도구는 도구를 실행 중인 그 컴퓨터에서만 끌 수 있습니다.")
                if "json" not in self.headers.get("Content-Type", ""):
                    raise ValueError("JSON 요청만 받습니다.")
                self.send_json({"result": {"stopping": True}})
                server = self.server
                threading.Thread(target=server.shutdown, daemon=True).start()
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/settings/data-folder":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                if not self.is_local_request() or os.environ.get("VERCEL"):
                    raise AuthorizationError("작업 데이터 폴더는 도구를 실행 중인 그 컴퓨터에서만 바꿀 수 있습니다.")
                if os.environ.get("TEXTBOOK_STUDIO_DB"):
                    raise ValueError("시험용 데이터베이스로 실행 중이라 폴더를 바꿀 수 없습니다.")
                if "json" not in self.headers.get("Content-Type", ""):
                    raise ValueError("JSON 요청만 받습니다.")
                current = configured_data_dir()
                picked = pick_folder_dialog(str(current.parent if current else APP_DIR))
                if not picked:
                    self.send_json({"result": {**data_folder_status(), "mode": "cancelled"}})
                else:
                    self.send_json({"result": switch_data_folder(Path(picked))})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/elementary-unit-titles":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json({"result": call_prototype_elementary_unit_titles(self.read_json())})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/elementary-pe-manuscript":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json(
                    {"result": call_prototype_elementary_pe_manuscript(self.read_json())}
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
        designcraft_actions = {
            "/api/prototype/designcraft/build": call_designcraft_build,
            "/api/prototype/designcraft/open": call_designcraft_open,
            "/api/prototype/designcraft/reveal": call_designcraft_reveal,
            "/api/prototype/designcraft/mockup": call_designcraft_mockup,
            "/api/prototype/designcraft/mockup-layout": call_designcraft_mockup_layout,
            "/api/prototype/designcraft/mockup-build": call_designcraft_mockup_build,
            "/api/prototype/designcraft/mockup-layout-get": call_designcraft_mockup_layout_get,
            "/api/prototype/designcraft/mockup-layout-save": call_designcraft_mockup_layout_save,
        }
        if parsed.path in designcraft_actions:
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                if not self.is_local_request():
                    raise AuthorizationError("DesignCraft 조판은 도구를 실행 중인 그 컴퓨터에서만 할 수 있습니다.")
                if "json" not in self.headers.get("Content-Type", ""):
                    raise ValueError("JSON 요청만 받습니다.")
                self.send_json({"result": designcraft_actions[parsed.path](self.read_json())})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/table-export":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                content, filename, content_type = build_table_export(self.read_json())
                self.send_download(content, filename, content_type)
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/lesson-plan-hwpx":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                content, filename = build_lesson_plan_hwpx(self.read_json())
                self.send_download(content, filename, "application/hwp+zip")
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        studio_ai_actions = {
            "/api/prototype/feedback/analyze": call_feedback_analyze,
            "/api/prototype/feedback/revisions": call_feedback_revisions,
            "/api/prototype/derived": call_derived_material,
            "/api/prototype/evidence/search": call_evidence_search,
        }
        if parsed.path in studio_ai_actions:
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json({"result": studio_ai_actions[parsed.path](self.read_json())})
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/derived/hwpx":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                import studio_ai

                content, filename = studio_ai.build_derived_hwpx(self.read_json())
                self.send_download(content, filename, "application/hwp+zip")
            except AuthenticationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.UNAUTHORIZED)
            except AuthorizationError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.FORBIDDEN)
            except ValueError as exc:
                self.send_json({"error": str(exc)}, HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # pragma: no cover - last-resort boundary
                self.send_json({"error": f"서버 오류: {exc}"}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/prototype/sports-culture-image":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json(
                    {"result": call_prototype_sports_culture_image(self.read_json())}
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
        if parsed.path == "/api/prototype/state":
            try:
                if auth_config()["enabled"]:
                    self.require_user()
                self.send_json({"result": call_prototype_state_save(self.read_json())})
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
            return
        if parsed.path == "/api/prototype/state/restore":
            try:
                self.require_user()
                require_owner(self.current_user)
                body = self.read_json()
                history_id = body.get("historyId")
                if not isinstance(history_id, int) or isinstance(history_id, bool):
                    raise ValueError("복원할 이력 id가 올바르지 않습니다.")
                self.send_json({"result": restore_prototype_state_history(history_id)})
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
            "": "prototype.html",
            "/": "prototype.html",
            "/login": "login.html",
            "/reset-password": "login.html",
            "/editors": "editors.html",
        }
        relative = route_files.get(request_path, unquote(request_path.lstrip("/")))
        candidate = (STATIC_DIR / relative).resolve()
        try:
            candidate.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not candidate.is_file():
            candidate = STATIC_DIR / "prototype.html"
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

    # 작업 데이터 폴더를 정해 두었으면 그 폴더의 DB·조판 결과를 쓴다(시험용 TEXTBOOK_STUDIO_DB가 우선).
    data_dir = configured_data_dir()
    if data_dir and not os.environ.get("TEXTBOOK_STUDIO_DB"):
        data_dir.mkdir(parents=True, exist_ok=True)
        apply_data_dir(data_dir)
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
