"""HTTP requests and isolated, in-memory SQL over connected tables."""

import sqlite3
import time
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import Field

from .models import ApiModel, TableState

router = APIRouter(prefix="/api/studio")


class HttpRequest(ApiModel):
    url: str = Field(max_length=8192)
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] = "GET"
    headers: dict[str, str] = Field(default_factory=dict, max_length=100)
    body: str = Field(default="", max_length=1_000_000)


@router.post("/http")
async def http_request(body: HttpRequest) -> dict:
    if urlparse(body.url).scheme not in ("http", "https"):
        raise HTTPException(422, "Use an HTTP or HTTPS URL")
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=False) as client:
            async with client.stream(
                body.method, body.url, headers=body.headers, content=body.body or None
            ) as response:
                chunks, size = [], 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > 5_000_000:
                        raise HTTPException(413, "Response exceeds 5 MB")
                    chunks.append(chunk)
                text = b"".join(chunks).decode("utf-8", errors="replace")
                return {
                    "status": response.status_code,
                    "headers": dict(response.headers),
                    "text": text,
                    "durationMs": round((time.monotonic() - start) * 1000),
                }
    except httpx.HTTPError as error:
        raise HTTPException(502, str(error)) from error


class SqlRequest(ApiModel):
    query: str = Field(min_length=1, max_length=100_000)
    tables: list[TableState] = Field(max_length=20)


@router.post("/sql")
def query_tables(body: SqlRequest) -> dict:
    connection = sqlite3.connect(":memory:")
    deadline = time.monotonic() + 3
    connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 1000)
    try:
        for i, table in enumerate(body.tables):
            if not table.columns or len(set(table.columns)) != len(table.columns):
                raise HTTPException(422, "SQL tables need non-empty, unique column names")
            names = [name.replace('"', '""') for name in table.columns]
            columns = ",".join(f'"{name}" NUMERIC' for name in names)
            connection.execute(f"CREATE TABLE input{i + 1} ({columns})")
            placeholders = ",".join("?" for _ in names)
            connection.executemany(f"INSERT INTO input{i + 1} VALUES ({placeholders})", table.rows)
        connection.execute("PRAGMA query_only=ON")
        allowed = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION}
        if hasattr(sqlite3, "SQLITE_RECURSIVE"):
            allowed.add(sqlite3.SQLITE_RECURSIVE)
        connection.set_authorizer(
            lambda action, *_args: sqlite3.SQLITE_OK if action in allowed else sqlite3.SQLITE_DENY
        )
        cursor = connection.execute(body.query)
        columns = [column[0] for column in cursor.description or []]
        rows = cursor.fetchmany(10001)
        truncated = len(rows) > 10000
        table = TableState(
            kind="data-table",
            columns=columns,
            rows=[["" if value is None else str(value) for value in row] for row in rows[:10000]],
        )
        return {"table": table.model_dump(), "truncated": truncated}
    except sqlite3.Error as error:
        raise HTTPException(422, str(error)) from error
    finally:
        connection.close()
