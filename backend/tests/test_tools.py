from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from app import ollama
from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path / "graph.json"))


@pytest.mark.parametrize(
    ("kind", "state"),
    [
        ("math-lab", {"expressions": "a=2\ny=a*x", "bounds": [-10, 10, -5, 5]}),
        ("data-table", {"columns": ["x", "y"], "rows": [["1", "2"]]}),
        ("ollama", {"model": "local", "prompt": "hello", "system": "", "temperature": 0.7}),
        (
            "chart-studio",
            {
                "settings": {"chart": "scatter", "x": "week", "y": "sales"},
                "table": {
                    "kind": "data-table", "columns": ["week", "sales"], "rows": [["1", "12"]]
                },
                "output": "week,sales\n1,12",
            },
        ),
    ],
)
def test_tool_persistence_and_type_matching(client: TestClient, kind: str, state: dict) -> None:
    client.put(
        "/api/graph",
        json={
            "workspaces": [
                {"id": "tool", "name": "Tool", "x": 0, "y": 0, "width": 600, "height": 500}
            ],
            "wires": [],
        },
    )
    assert client.post("/api/workspaces/tool/type", json={"type": kind}).status_code == 200
    response = client.put("/api/workspaces/tool/tool", json={"kind": kind, **state})
    assert response.status_code == 200, response.text
    saved = response.json()["workspaces"][0]["tool"]
    assert saved["kind"] == kind
    assert client.get("/api/graph").json()["workspaces"][0]["tool"] == saved
    if kind != "data-table":
        response = client.put(
            "/api/workspaces/tool/tool", json={"kind": "data-table", "columns": [], "rows": []}
        )
        assert response.status_code == 409


def mock_ollama(monkeypatch, handler):
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        ollama.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_ollama_models_and_stream(client: TestClient, monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "local:test"}]})
        body = json.loads(request.content)
        assert body["format"] == "json"
        assert body["options"]["temperature"] == 0.3
        assert body["stream"] is True
        return httpx.Response(
            200,
            text='{"response":"hello","done":false}\n{"response":"!","done":true}\n',
        )

    mock_ollama(monkeypatch, handler)
    assert client.get("/api/ollama/models").json()["models"][0]["name"] == "local:test"
    response = client.post(
        "/api/ollama/generate",
        json={"model": "local:test", "prompt": "hello", "temperature": 0.3, "jsonOutput": True},
    )
    assert response.status_code == 200
    events = [json.loads(line) for line in response.text.splitlines()]
    assert "".join(event["response"] for event in events) == "hello!"
    assert events[-1]["done"]


def test_ollama_unavailable(client: TestClient, monkeypatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    mock_ollama(monkeypatch, handler)
    assert client.get("/api/ollama/models").status_code == 502
    response = client.post("/api/ollama/generate", json={"model": "missing", "prompt": "hello"})
    assert response.status_code == 502


def test_tool_invalid_bounds_and_ragged_rows(client: TestClient) -> None:
    response = client.put(
        "/api/workspaces/missing/tool",
        json={"kind": "math-lab", "expressions": "y=x", "bounds": [1, -1, -5, 5]},
    )
    assert response.status_code == 422
    response = client.put(
        "/api/workspaces/missing/tool",
        json={"kind": "data-table", "columns": ["x"], "rows": [["1", "2"]]},
    )
    assert response.status_code == 422
