from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def postgres_url() -> str:
    configured_url = (
        os.environ.get("POSTGRES_URL")
        or os.environ.get("DATABASE_URL")
        or ""
    ).strip()
    if not configured_url:
        return ""
    parsed = urlsplit(configured_url)
    supported_query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "supa"
    ]
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            urlencode(supported_query),
            parsed.fragment,
        )
    )


def using_postgres() -> bool:
    return bool(postgres_url())


def _postgres_sql(sql: str) -> str:
    return sql.replace("?", "%s")


class DatabaseConnection:
    def __init__(self, raw_connection: object, backend: str):
        self.raw_connection = raw_connection
        self.backend = backend

    def execute(self, sql: str, parameters: tuple | list = ()):
        if self.backend == "postgres":
            return self.raw_connection.execute(_postgres_sql(sql), parameters)
        return self.raw_connection.execute(sql, parameters)

    def executescript(self, script: str) -> None:
        if self.backend == "sqlite":
            self.raw_connection.executescript(script)
            return
        postgres_script = script.replace(
            "INTEGER PRIMARY KEY AUTOINCREMENT",
            "BIGSERIAL PRIMARY KEY",
        )
        for statement in postgres_script.split(";"):
            statement = statement.strip()
            if statement:
                self.raw_connection.execute(statement)

    def table_columns(self, table_name: str) -> set[str]:
        if self.backend == "sqlite":
            return {
                row["name"]
                for row in self.raw_connection.execute(
                    f"PRAGMA table_info({table_name})"
                )
            }
        rows = self.raw_connection.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s
            """,
            (table_name,),
        ).fetchall()
        return {row["column_name"] for row in rows}

    def commit(self) -> None:
        self.raw_connection.commit()

    def rollback(self) -> None:
        self.raw_connection.rollback()

    def close(self) -> None:
        self.raw_connection.close()


@contextmanager
def connect_database(sqlite_path: Path):
    if using_postgres():
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "Postgres 사용에는 psycopg 패키지가 필요합니다."
            ) from exc
        connection = psycopg.connect(
            postgres_url(),
            row_factory=dict_row,
            prepare_threshold=None,
        )
        wrapped = DatabaseConnection(connection, "postgres")
    else:
        sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(sqlite_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        wrapped = DatabaseConnection(connection, "sqlite")
    try:
        yield wrapped
    except Exception:
        try:
            wrapped.rollback()
        except Exception:
            pass
        raise
    finally:
        try:
            wrapped.close()
        except Exception:
            pass
