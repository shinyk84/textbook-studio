from __future__ import annotations

import argparse
import os
import sqlite3
import sys
from pathlib import Path

import psycopg
from psycopg import sql


PROJECT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_DIR))

from database import postgres_url  # noqa: E402


TABLES = (
    ("project", "id"),
    ("sources", "document_id"),
    ("audit_log", "id"),
    ("curriculum_standards", "code"),
    ("curriculum_analysis", "id"),
    ("curriculum_analysis_versions", "id"),
    ("development_direction", "id"),
    ("development_direction_versions", "id"),
    ("grade_allocation", "id"),
    ("grade_allocation_versions", "id"),
    ("content_selection", "id"),
    ("content_selection_versions", "id"),
    ("workflow_stages", "stage_key"),
    ("workflow_stage_versions", "id"),
)


def sqlite_rows(connection: sqlite3.Connection, table_name: str):
    columns = [
        row["name"]
        for row in connection.execute(f"PRAGMA table_info({table_name})")
    ]
    rows = connection.execute(f'SELECT * FROM "{table_name}"').fetchall()
    return columns, rows


def migrate(source_path: Path) -> dict[str, int]:
    if not source_path.is_file():
        raise FileNotFoundError(f"SQLite DB를 찾을 수 없습니다: {source_path}")
    if not postgres_url():
        raise RuntimeError("POSTGRES_URL 또는 DATABASE_URL이 필요합니다.")

    source = sqlite3.connect(source_path)
    source.row_factory = sqlite3.Row
    counts: dict[str, int] = {}
    try:
        with psycopg.connect(
            postgres_url(),
            prepare_threshold=None,
        ) as destination:
            with destination.transaction():
                for table_name, _ in reversed(TABLES):
                    destination.execute(
                        sql.SQL("DELETE FROM {}").format(sql.Identifier(table_name))
                    )

                for table_name, primary_key in TABLES:
                    columns, rows = sqlite_rows(source, table_name)
                    if rows:
                        insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                            sql.Identifier(table_name),
                            sql.SQL(", ").join(map(sql.Identifier, columns)),
                            sql.SQL(", ").join(sql.Placeholder() * len(columns)),
                        )
                        with destination.cursor() as cursor:
                            cursor.executemany(
                                insert,
                                [
                                    tuple(row[column] for column in columns)
                                    for row in rows
                                ],
                            )
                    counts[table_name] = len(rows)

                    if primary_key == "id" and table_name not in {
                        "project",
                        "curriculum_analysis",
                        "development_direction",
                        "grade_allocation",
                        "content_selection",
                    }:
                        destination.execute(
                            sql.SQL(
                                """
                                SELECT setval(
                                    pg_get_serial_sequence(%s, 'id'),
                                    COALESCE(MAX(id), 1),
                                    MAX(id) IS NOT NULL
                                )
                                FROM {}
                                """
                            ).format(sql.Identifier(table_name)),
                            (table_name,),
                        )
    finally:
        source.close()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="교과서 제작 스튜디오 SQLite 데이터를 Supabase Postgres로 이전"
    )
    parser.add_argument(
        "--source",
        type=Path,
        default=PROJECT_DIR / "data" / "studio.db",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="대상 Supabase 데이터를 현재 SQLite 내용으로 교체",
    )
    args = parser.parse_args()
    if not args.confirm:
        raise SystemExit("실행하려면 --confirm을 지정하세요.")
    counts = migrate(args.source.resolve())
    for table_name, count in counts.items():
        print(f"{table_name}: {count}")
    print(f"총 {sum(counts.values())}개 행 이전 완료")


if __name__ == "__main__":
    main()
