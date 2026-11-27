from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import CONTENT_SOURCE_TYPE, create_app

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

TYPED_GRAPH = {
    "workspaces": [
        {
            "id": "ingest",
            "name": "Ingest",
            "x": 0,
            "y": 0,
            "width": 300,
            "height": 200,
            "type": "viewer",
        },
        {"id": "publish", "name": "Publish", "x": 500, "y": 120, "width": 300, "height": 200},
    ],
    "wires": [],
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
    assert len(loaded["workspaces"]) == len(GRAPH["workspaces"])
    for loaded_ws, expected_ws in zip(loaded["workspaces"], GRAPH["workspaces"], strict=True):
        assert loaded_ws["id"] == expected_ws["id"]
        assert loaded_ws["name"] == expected_ws["name"]
        assert loaded_ws["x"] == expected_ws["x"]
        assert loaded_ws["y"] == expected_ws["y"]
        assert loaded_ws["width"] == expected_ws["width"]
        assert loaded_ws["height"] == expected_ws["height"]
        assert loaded_ws["type"] is None
        assert loaded_ws["contents"] == []
    assert len(loaded["wires"]) == len(GRAPH["wires"])


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


def test_upload_to_untyped_workspace_sets_content_source(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)

    response = client.post(
        "/api/workspaces/ingest/contents",
        files=[("files", ("hello.txt", b"hello world", "text/plain"))],
    )
    assert response.status_code == 200

    graph = client.get("/api/graph").json()
    workspace = next(w for w in graph["workspaces"] if w["id"] == "ingest")
    assert workspace["type"] == CONTENT_SOURCE_TYPE
    assert len(workspace["contents"]) == 1
    entry = workspace["contents"][0]
    assert entry["name"] == "hello.txt"
    assert entry["mimeType"] == "text/plain"
    assert entry["size"] == 11
    assert entry["dataUrl"].startswith("/api/files/")
    assert client.get(entry["dataUrl"]).content == b"hello world"


def test_upload_to_content_source_adds_files(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)
    client.post(
        "/api/workspaces/ingest/contents",
        files=[("files", ("a.txt", b"aaa", "text/plain"))],
    )

    response = client.post(
        "/api/workspaces/ingest/contents",
        files=[
            ("files", ("b.png", b"\x89PNG\r\n\x1a\n", "image/png")),
            ("files", ("c.mp3", b"ID3", "audio/mpeg")),
        ],
    )
    assert response.status_code == 200

    graph = client.get("/api/graph").json()
    workspace = next(w for w in graph["workspaces"] if w["id"] == "ingest")
    assert workspace["type"] == CONTENT_SOURCE_TYPE
    assert len(workspace["contents"]) == 3
    names = {entry["name"] for entry in workspace["contents"]}
    assert names == {"a.txt", "b.png", "c.mp3"}
    png = next(e for e in workspace["contents"] if e["name"] == "b.png")
    assert png["mimeType"] == "image/png"
    mp3 = next(e for e in workspace["contents"] if e["name"] == "c.mp3")
    assert mp3["mimeType"] == "audio/mpeg"


def test_upload_rejects_non_content_source_typed_workspace(client: TestClient) -> None:
    client.put("/api/graph", json=TYPED_GRAPH)

    response = client.post(
        "/api/workspaces/ingest/contents",
        files=[("files", ("x.txt", b"x", "text/plain"))],
    )
    assert response.status_code == 409

    graph = client.get("/api/graph").json()
    workspace = next(w for w in graph["workspaces"] if w["id"] == "ingest")
    assert workspace["type"] == "viewer"
    assert workspace["contents"] == []


def test_upload_rejects_unknown_workspace(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)

    response = client.post(
        "/api/workspaces/missing/contents",
        files=[("files", ("x.txt", b"x", "text/plain"))],
    )
    assert response.status_code == 404


def test_large_pdf_upload_and_remove_preserves_other_files(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)
    pdf = b"%PDF-1.7\n" + b"x" * 15_000_000
    response = client.post(
        "/api/workspaces/ingest/contents",
        files=[
            ("files", ("document.pdf", pdf, "application/pdf")),
            ("files", ("keep.txt", b"keep", "text/plain")),
        ],
    )
    assert response.status_code == 200
    entry = response.json()["workspaces"][0]["contents"][0]
    assert entry["mimeType"] == "application/pdf"
    assert client.get(entry["dataUrl"]).content == pdf
    assert len(response.content) < 5000
    removed = client.delete(f"/api/workspaces/ingest/contents/{entry['id']}")
    assert removed.status_code == 200
    assert client.get(entry["dataUrl"]).status_code == 404
    assert [item["name"] for item in removed.json()["workspaces"][0]["contents"]] == ["keep.txt"]
    assert client.delete(f"/api/workspaces/ingest/contents/{entry['id']}").status_code == 404
    assert client.delete("/api/workspaces/missing/contents/1").status_code == 404
    assert len(client.get("/api/graph").json()["workspaces"][0]["contents"]) == 1


def test_put_rejects_type_change(client: TestClient) -> None:
    client.put("/api/graph", json=GRAPH)

    mutated = {
        "workspaces": [
            {**GRAPH["workspaces"][0], "type": "content-source"},
            GRAPH["workspaces"][1],
        ],
        "wires": [],
    }
    response = client.put("/api/graph", json=mutated)
    assert response.status_code == 409

    graph = client.get("/api/graph").json()
    workspace = next(w for w in graph["workspaces"] if w["id"] == "ingest")
    assert workspace["type"] is None


def editor_graph(client: TestClient, reverse: bool = True) -> dict:
    client.put("/api/graph", json=GRAPH)
    assert (
        client.post("/api/workspaces/ingest/type", json={"type": "content-source"}).status_code
        == 200
    )
    assert (
        client.post("/api/workspaces/publish/type", json={"type": "text-editor"}).status_code == 200
    )
    client.post(
        "/api/workspaces/ingest/contents",
        files=[("files", ("signal.txt", b"gain = 0.65", "text/plain"))],
    )
    graph = client.get("/api/graph").json()
    graph.pop("updatedAt")
    if reverse:
        graph["wires"].append(
            {**GRAPH["wires"][0], "id": "return", "source": "publish", "target": "ingest"}
        )
    assert client.put("/api/graph", json=graph).status_code == 200
    return graph


def test_editor_connected_open_and_save(client: TestClient) -> None:
    editor_graph(client)
    opened = client.post(
        "/api/workspaces/publish/editor/open", json={"workspaceId": "ingest", "fileId": "1"}
    )
    assert opened.status_code == 200
    document = opened.json()["workspaces"][1]["editor"]
    assert document["text"] == "gain = 0.65"
    assert document["sourceWorkspaceId"] == "ingest"
    assert (
        client.put(
            "/api/workspaces/publish/editor", json={**document, "text": "gain = 0.8"}
        ).status_code
        == 200
    )
    saved = client.post(
        "/api/workspaces/publish/editor/save",
        json={"workspaceId": "ingest", "name": "edited.txt", "text": "gain = 0.8"},
    )
    assert saved.status_code == 200
    file = saved.json()["workspaces"][0]["contents"][-1]
    assert file["name"] == "edited.txt"
    assert client.get(file["dataUrl"]).content == b"gain = 0.8"
    assert (
        client.post(
            "/api/workspaces/publish/editor/save",
            json={
                "workspaceId": "ingest",
                "fileId": file["id"],
                "name": "edited.txt",
                "text": "updated",
            },
        ).status_code
        == 200
    )
    assert len(client.get("/api/graph").json()["workspaces"][0]["contents"]) == 2


def test_editor_requires_directional_connections(client: TestClient) -> None:
    editor_graph(client, reverse=False)
    assert (
        client.post(
            "/api/workspaces/publish/editor/open", json={"workspaceId": "ingest", "fileId": "1"}
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/workspaces/publish/editor/save",
            json={"workspaceId": "ingest", "name": "x.txt", "text": "x"},
        ).status_code
        == 403
    )
    graph = client.get("/api/graph").json()
    graph.pop("updatedAt")
    graph["wires"] = []
    client.put("/api/graph", json=graph)
    assert (
        client.post(
            "/api/workspaces/publish/editor/open", json={"workspaceId": "ingest", "fileId": "1"}
        ).status_code
        == 403
    )


def test_editor_rejects_binary_and_type_reassignment(client: TestClient) -> None:
    editor_graph(client)
    client.post(
        "/api/workspaces/ingest/contents",
        files=[("files", ("binary.bin", b"\x00\xff", "application/octet-stream"))],
    )
    assert (
        client.post(
            "/api/workspaces/publish/editor/open", json={"workspaceId": "ingest", "fileId": "2"}
        ).status_code
        == 415
    )
    assert (
        client.post("/api/workspaces/publish/type", json={"type": "content-source"}).status_code
        == 409
    )
    assert (
        client.post("/api/workspaces/publish/type", json={"type": "not-registered"}).status_code
        == 422
    )


def image_file_graph(
    client: TestClient, *, target_type: str = CONTENT_SOURCE_TYPE, wired: bool = True
) -> None:
    client.delete("/api/graph")
    wire = {
        "id": "image-file-wire",
        "source": "image",
        "sourcePort": {"side": "right", "t": 0.5},
        "target": "files",
        "targetPort": {"side": "left", "t": 0.5},
    }
    response = client.put(
        "/api/graph",
        json={
            "workspaces": [
                {
                    "id": "image",
                    "name": "Image Studio",
                    "x": 0,
                    "y": 0,
                    "width": 300,
                    "height": 200,
                    "type": "image-studio",
                },
                {
                    "id": "files",
                    "name": "Files",
                    "x": 500,
                    "y": 0,
                    "width": 300,
                    "height": 200,
                    "type": target_type,
                },
            ],
            "wires": [wire] if wired else [],
        },
    )
    assert response.status_code == 200


def png_data_url(payload: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(payload).decode("ascii")


def test_published_image_saves_to_connected_file_workspace(client: TestClient) -> None:
    image_file_graph(client)
    first = b"\x89PNG\r\n\x1a\nfirst"
    saved = client.post(
        "/api/workspaces/image/file/save",
        json={
            "workspaceId": "files",
            "name": "edited.png",
            "mimeType": "image/png",
            "dataUrl": png_data_url(first),
        },
    )
    assert saved.status_code == 200, saved.text
    contents = next(w for w in saved.json()["workspaces"] if w["id"] == "files")["contents"]
    assert len(contents) == 1
    assert contents[0]["name"] == "edited.png"
    assert contents[0]["mimeType"] == "image/png"
    assert client.get(contents[0]["dataUrl"]).content == first
    file_id = contents[0]["id"]

    second = b"\x89PNG\r\n\x1a\nsecond"
    saved = client.post(
        "/api/workspaces/image/file/save",
        json={
            "workspaceId": "files",
            "name": "edited.png",
            "mimeType": "image/png",
            "dataUrl": png_data_url(second),
        },
    )
    assert saved.status_code == 200
    contents = next(w for w in saved.json()["workspaces"] if w["id"] == "files")["contents"]
    assert len(contents) == 1
    assert contents[0]["id"] == file_id
    assert client.get(contents[0]["dataUrl"]).content == second


def test_file_save_requires_wire_and_content_source(client: TestClient) -> None:
    image_file_graph(client, wired=False)
    response = client.post(
        "/api/workspaces/image/file/save",
        json={
            "workspaceId": "files",
            "name": "edited.png",
            "mimeType": "image/png",
            "dataUrl": png_data_url(b"x"),
        },
    )
    assert response.status_code == 403

    image_file_graph(client, target_type="text-editor")
    response = client.post(
        "/api/workspaces/image/file/save",
        json={
            "workspaceId": "files",
            "name": "edited.png",
            "mimeType": "image/png",
            "dataUrl": png_data_url(b"x"),
        },
    )
    assert response.status_code == 409


def test_file_save_rejects_malformed_data_url(client: TestClient) -> None:
    image_file_graph(client)
    for data_url in (
        "data:text/plain;base64,aGk=",
        "data:image/png;base64,!!!",
        "not-a-data-url",
    ):
        response = client.post(
            "/api/workspaces/image/file/save",
            json={
                "workspaceId": "files",
                "name": "edited.png",
                "mimeType": "image/png",
                "dataUrl": data_url,
            },
        )
        assert response.status_code == 422
