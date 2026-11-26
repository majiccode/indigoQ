"""Production static hosting must not shadow the API or expose adjacent files."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_static_hosting(tmp_path, monkeypatch):
    public = tmp_path / "public"
    public.mkdir()
    (public / "index.html").write_text("canvas")
    (public / "workspace").mkdir()
    (public / "workspace" / "index.html").write_text("fullscreen")
    (tmp_path / "secret.txt").write_text("private")
    monkeypatch.setenv("INDIGOQ_STATIC_DIR", str(public))
    client = TestClient(create_app(tmp_path / "graph.json"))
    assert client.get("/").text == "canvas"
    assert client.get("/workspace?id=example").text == "fullscreen"
    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get("/api/not-a-route").json() == {"detail": "Unknown API route"}
    assert client.get("/missing").status_code == 404
    assert client.get("/%2e%2e/secret.txt").status_code == 404
    assert client.put("/api/graph", json={"workspaces": [], "wires": []}).status_code == 200
    assert (tmp_path / "graph.json").exists()
