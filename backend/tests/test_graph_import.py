import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app

EXAMPLES = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples"


def test_examples_import_roundtrip_and_replacement(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    for path in sorted(EXAMPLES.glob("*.json")):
        graph = json.loads(path.read_text())["graph"]
        response = client.post("/api/graph/import", json=graph)
        assert response.status_code == 200, response.text
        loaded = client.get("/api/graph").json()
        for expected, actual in zip(graph["workspaces"], loaded["workspaces"], strict=True):
            for key, value in expected.items():
                assert actual[key] == value
        assert loaded["wires"] == graph["wires"]
        assert client.post("/api/graph/import", json=graph).status_code == 200

    # Import explicitly replaces the document, even when IDs have different types.
    replacement = {
        "workspaces": [
            {
                "id": "osc-editor",
                "name": "Now a table",
                "type": "data-table",
                "x": 0,
                "y": 0,
                "width": 500,
                "height": 500,
            }
        ],
        "wires": [],
    }
    assert client.post("/api/graph/import", json=replacement).status_code == 200
    assert len(client.get("/api/graph").json()["workspaces"]) == 1


def test_invalid_import_preserves_current_graph(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    graph = json.loads((EXAMPLES / "oscillator-lab.json").read_text())["graph"]
    assert client.post("/api/graph/import", json=graph).status_code == 200
    before = client.get("/api/graph").json()
    graph["wires"][0]["target"] = "missing"
    assert client.post("/api/graph/import", json=graph).status_code == 422
    assert client.get("/api/graph").json() == before
    assert client.post("/api/graph/import", json={"workspaces": [], "wires": []}).status_code == 200
    assert client.get("/api/graph").json()["workspaces"] == []
