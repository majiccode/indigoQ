from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

GRAPH = {
    "workspaces": [
        {"id": "ingest", "name": "Ingest", "x": 0, "y": 0, "width": 300, "height": 200},
        {"id": "publish", "name": "Publish", "x": 500, "y": 120, "width": 300, "height": 200},
    ],
    "wires": [
        {
            "id": "wire-1",
            "source": "ingest",
            "sourcePort": {"side": "right", "t": 0.5},
            "target": "publish",
            "targetPort": {"side": "left", "t": 0.4},
        }
    ],
}


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    return TestClient(create_app(tmp_path / "graph.json"))


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_graph_roundtrip(client: TestClient) -> None:
    empty = client.get("/api/graph").json()
    assert empty["workspaces"] == []
    assert empty["wires"] == []
    assert empty["updatedAt"] is None

    saved = client.put("/api/graph", json=GRAPH)
    assert saved.status_code == 200
    assert saved.json()["updatedAt"] is not None

    loaded = client.get("/api/graph").json()
    assert loaded["workspaces"] == GRAPH["workspaces"]
    assert loaded["wires"] == GRAPH["wires"]


def test_graph_rejects_dangling_wire(client: TestClient) -> None:
    payload = {
        "workspaces": GRAPH["workspaces"],
        "wires": [{**GRAPH["wires"][0], "target": "missing"}],
    }
    response = client.put("/api/graph", json=payload)
    assert response.status_code == 422


def test_graph_rejects_self_connection(client: TestClient) -> None:
    payload = {
        "workspaces": GRAPH["workspaces"],
        "wires": [{**GRAPH["wires"][0], "target": "ingest"}],
    }
    response = client.put("/api/graph", json=payload)
    assert response.status_code == 422


def test_delete_clears_graph(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)
    assert client.delete("/api/graph").status_code == 204
    assert client.get("/api/graph").json()["workspaces"] == []
