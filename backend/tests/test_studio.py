from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app import studio
from app.main import create_app


def test_sql_joins_aggregation_and_read_only(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    tables = [
        {"kind": "data-table", "columns": ["id", "amount"], "rows": [["1", "10"], ["1", "20"]]},
        {"kind": "data-table", "columns": ["id", "name"], "rows": [["1", "North"]]},
    ]
    response = client.post(
        "/api/studio/sql",
        json={
            "query": (
                "SELECT b.name, SUM(a.amount) AS total FROM input1 a "
                "JOIN input2 b ON a.id=b.id GROUP BY b.name"
            ),
            "tables": tables,
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["table"]["rows"] == [["North", "30"]]
    for query in [
        "DROP TABLE input1",
        "ATTACH DATABASE '/tmp/test.db' AS test",
        "PRAGMA database_list",
        "SELECT load_extension('x')",
    ]:
        response = client.post("/api/studio/sql", json={"query": query, "tables": tables})
        assert response.status_code == 422


def test_http_proxy_and_invalid_scheme(tmp_path: Path, monkeypatch) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    real_client = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.headers["X-Test"] == "value"
        assert request.content == b"hello"
        return httpx.Response(201, json=[{"x": 1}])

    monkeypatch.setattr(
        studio.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    response = client.post(
        "/api/studio/http",
        json={
            "url": "https://example.test/data",
            "method": "POST",
            "headers": {"X-Test": "value"},
            "body": "hello",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == 201
    assert response.json()["text"] == '[{"x":1}]'
    assert client.post("/api/studio/http", json={"url": "file:///etc/hosts"}).status_code == 422
