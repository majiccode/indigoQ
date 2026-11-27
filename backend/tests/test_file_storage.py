import base64
import hashlib
import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def graph_with_file(raw: bytes) -> dict:
    return {
        "workspaces": [{
            "id": "files", "name": "Files", "x": 0, "y": 0, "width": 300, "height": 200,
            "type": "content-source", "contents": [{
                "id": "doc", "name": "report.pdf", "mimeType": "application/pdf", "size": len(raw),
                "dataUrl": "data:application/pdf;base64," + base64.b64encode(raw).decode(),
            }],
        }],
        "wires": [],
    }


def test_existing_graph_migrates_and_exports_portably(tmp_path: Path) -> None:
    raw = b"%PDF-1.7\nexisting document"
    path = tmp_path / "graph.json"
    path.write_text(json.dumps({"graph": graph_with_file(raw), "updatedAt": "old"}))
    client = TestClient(create_app(path))
    response = client.get("/api/graph")
    assert response.status_code == 200
    entry = response.json()["workspaces"][0]["contents"][0]
    assert entry["dataUrl"] == f"/api/files/ws-files/{hashlib.sha256(raw).hexdigest()}"
    assert "base64" not in path.read_text()
    assert (tmp_path / "files" / "ws-files" / hashlib.sha256(raw).hexdigest()).read_bytes() == raw
    assert client.get(entry["dataUrl"]).headers["content-type"] == "application/pdf"
    partial = client.get(entry["dataUrl"], headers={"Range": "bytes=0-7"})
    assert partial.status_code == 206
    assert partial.content == raw[:8]
    exported = client.get("/api/graph/export")
    assert exported.status_code == 200
    assert exported.json()["workspaces"][0]["contents"][0]["dataUrl"].startswith("data:")
    other = TestClient(create_app(tmp_path / "other" / "graph.json"))
    imported = other.post("/api/graph/import", json=exported.json())
    assert imported.status_code == 200
    assert other.get(imported.json()["workspaces"][0]["contents"][0]["dataUrl"]).content == raw


def test_shared_binaries_survive_until_last_reference_removed(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    graph = graph_with_file(b"shared document")
    original = graph["workspaces"][0]["contents"][0]
    graph["workspaces"][0]["contents"].append({**original, "id": "copy", "name": "copy.pdf"})
    imported = client.post("/api/graph/import", json=graph)
    reference = imported.json()["workspaces"][0]["contents"][0]["dataUrl"]
    assert len(list((tmp_path / "files" / "ws-files").iterdir())) == 1
    assert client.delete("/api/workspaces/files/contents/doc").status_code == 200
    assert client.get(reference).content == b"shared document"
    assert client.delete("/api/workspaces/files/contents/copy").status_code == 200
    assert list((tmp_path / "files").iterdir()) == []
    assert client.get(reference).status_code == 404


def test_deleting_workspace_removes_its_files_only(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    graph = graph_with_file(b"same bytes, independent ownership")
    graph["workspaces"].append({**graph["workspaces"][0], "id": "other"})
    response = client.post("/api/graph/import", json=graph)
    assert response.status_code == 200
    snapshot = response.json()
    first, second = [workspace["contents"][0]["dataUrl"] for workspace in snapshot["workspaces"]]
    assert first != second
    assert (tmp_path / "files" / "ws-files").is_dir()
    assert (tmp_path / "files" / "ws-other").is_dir()
    snapshot["workspaces"].pop(0)
    snapshot.pop("updatedAt")
    assert client.put("/api/graph", json=snapshot).status_code == 200
    assert not (tmp_path / "files" / "ws-files").exists()
    assert client.get(first).status_code == 404
    assert client.get(second).content == b"same bytes, independent ownership"
    assert client.post("/api/graph/import", json={"workspaces": [], "wires": []}).status_code == 200
    assert not (tmp_path / "files" / "ws-other").exists()


def test_generated_tool_files_are_externalized_and_clear_removes_binaries(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    graph = graph_with_file(b"generated")
    file = graph["workspaces"][0]["contents"].pop()
    graph["workspaces"][0].update(
        type="image-studio", tool={"kind": "image-studio", "files": [file]}
    )
    response = client.post("/api/graph/import", json=graph)
    assert response.status_code == 200
    assert response.json()["workspaces"][0]["tool"]["files"][0]["dataUrl"].startswith("/api/files/")
    assert "base64" not in (tmp_path / "graph.json").read_text()
    assert client.delete("/api/graph").status_code == 204
    assert list((tmp_path / "files").iterdir()) == []


def test_invalid_file_import_preserves_graph(tmp_path: Path) -> None:
    client = TestClient(create_app(tmp_path / "graph.json"))
    assert client.post("/api/graph/import", json=graph_with_file(b"keep")).status_code == 200
    before = client.get("/api/graph").json()
    references = ["/api/files/" + "0" * 64, "/etc/passwd", "data:application/pdf;base64,invalid!"]
    for reference in references:
        graph = graph_with_file(b"")
        graph["workspaces"][0]["contents"][0]["dataUrl"] = reference
        assert client.post("/api/graph/import", json=graph).status_code == 422
        assert client.get("/api/graph").json() == before
