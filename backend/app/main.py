"""indigoQ graph API."""

from __future__ import annotations

import base64
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import ContentEntry, Graph, GraphSnapshot, Workspace
from .store import GraphStore

APP_VERSION = "0.1.0"
CONTENT_SOURCE_TYPE = "content-source"
DEFAULT_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "graph.json"
DEFAULT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
)


def create_app(data_file: Path | None = None) -> FastAPI:
    store = GraphStore(
        data_file or Path(os.environ.get("INDIGOQ_DATA_FILE", DEFAULT_DATA_FILE))
    )
    origins = [
        origin.strip()
        for origin in os.environ.get("INDIGOQ_CORS_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(
            ","
        )
        if origin.strip()
    ]

    app = FastAPI(
        title="indigoQ API",
        description="Persists the workspace and dataflow graph behind the indigoQ canvas.",
        version=APP_VERSION,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET", "PUT", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "indigoq-api", "version": APP_VERSION}

    @app.get("/api/graph", response_model=GraphSnapshot)
    def get_graph() -> GraphSnapshot:
        return store.load() or GraphSnapshot()

    @app.put("/api/graph", response_model=GraphSnapshot)
    def put_graph(graph: Graph) -> GraphSnapshot:
        existing = store.load()
        if existing is not None:
            existing_by_id = {w.id: w for w in existing.workspaces}
            for workspace in graph.workspaces:
                previous = existing_by_id.get(workspace.id)
                if previous is not None and previous.type != workspace.type:
                    raise HTTPException(
                        status_code=409,
                        detail=f"workspace {workspace.id} type is immutable",
                    )
        return store.save(graph)

    @app.post("/api/workspaces/{workspace_id}/contents", response_model=GraphSnapshot)
    def upload_contents(workspace_id: str, files: list[UploadFile] = File(...)) -> GraphSnapshot:
        if not files:
            raise HTTPException(status_code=400, detail="no files provided")

        graph = store.load() or Graph()
        if isinstance(graph, GraphSnapshot):
            graph = Graph.model_validate(graph.model_dump(exclude={"updatedAt"}))
        workspace = next((w for w in graph.workspaces if w.id == workspace_id), None)
        if workspace is None:
            raise HTTPException(status_code=404, detail=f"workspace {workspace_id} not found")

        if workspace.type is None:
            workspace.type = CONTENT_SOURCE_TYPE
        elif workspace.type != CONTENT_SOURCE_TYPE:
            raise HTTPException(
                status_code=409,
                detail=f"workspace {workspace_id} is not a content-source workspace",
            )

        existing_names = {entry.name for entry in workspace.contents}
        next_index = max([int(entry.id) for entry in workspace.contents if entry.id.isdigit()] or [0])

        for uploaded in files:
            raw = uploaded.file.read()
            if uploaded.content_type and uploaded.content_type.startswith("image/"):
                mime = uploaded.content_type
            elif uploaded.content_type and uploaded.content_type.startswith("audio/"):
                mime = uploaded.content_type
            else:
                mime = uploaded.content_type or "application/octet-stream"

            b64 = base64.b64encode(raw).decode("ascii")
            data_url = f"data:{mime};base64,{b64}"

            next_index += 1
            entry = ContentEntry(
                id=str(next_index),
                name=uploaded.filename or f"file-{next_index}",
                mimeType=mime,
                size=len(raw),
                dataUrl=data_url,
            )
            if entry.name in existing_names:
                raise HTTPException(
                    status_code=409,
                    detail=f"file {entry.name} already exists in workspace {workspace_id}",
                )
            existing_names.add(entry.name)
            workspace.contents.append(entry)

        return store.save(graph)

    @app.delete("/api/graph", status_code=204)
    def delete_graph() -> Response:
        store.clear()
        return Response(status_code=204)

    return app


app = create_app()
