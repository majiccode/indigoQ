import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.models import Graph

EXAMPLES = Path(__file__).resolve().parents[2] / "frontend" / "public" / "examples"


def test_examples_import_roundtrip_and_replacement(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    for path in sorted(EXAMPLES.glob("*.json")):
        graph = json.loads(path.read_text())["graph"]
        response = client.post("/api/graph/import", json=graph)
        assert response.status_code == 200, response.text
        loaded = client.get("/api/graph").json()
        normalized = Graph.model_validate(graph).model_dump(mode="json")
        assert loaded["workspaces"] == normalized["workspaces"]
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


def test_voice_expense_example_pipeline(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    graph = json.loads((EXAMPLES / "voice-expense-detective.json").read_text())["graph"]
    workspaces = {workspace["id"]: workspace for workspace in graph["workspaces"]}
    assert workspaces["expense-transform"]["autoUpdate"] is True
    assert workspaces["expense-sql"]["autoUpdate"] is True
    assert workspaces["expense-selection"]["autoUpdate"] is True
    records = json.loads(workspaces["expense-ai"]["tool"]["output"])["expenses"]
    table = workspaces["expense-transform"]["tool"]["table"]
    assert [[str(record[column]) for column in table["columns"]] for record in records] == table[
        "rows"
    ]
    response = client.post(
        "/api/studio/sql",
        json={"query": workspaces["expense-sql"]["tool"]["text"], "tables": [table]},
    )
    assert response.status_code == 200
    assert response.json()["table"] == workspaces["expense-sql"]["tool"]["table"]


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
