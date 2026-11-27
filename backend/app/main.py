"""indigoQ graph API."""

from __future__ import annotations

import base64
import os
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .models import (
    AutoUpdateRequest,
    ContentEntry,
    EditorDocument,
    Graph,
    GraphSnapshot,
    MathState,
    OllamaState,
    OpenDocumentRequest,
    SaveDocumentRequest,
    SaveFileRequest,
    StudioState,
    TableState,
    Workspace,
    WorkspaceTypeRequest,
)
from .ollama import router as ollama_router
from .store import GraphStore
from .studio import router as studio_router

APP_VERSION = "0.1.2"
CONTENT_SOURCE_TYPE = "content-source"
DEFAULT_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "graph.json"
DEFAULT_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
)


def create_app(data_file: Path | None = None) -> FastAPI:
    store = GraphStore(data_file or Path(os.environ.get("INDIGOQ_DATA_FILE", DEFAULT_DATA_FILE)))
    origins = [
        origin.strip()
        for origin in os.environ.get("INDIGOQ_CORS_ORIGINS", ",".join(DEFAULT_ORIGINS)).split(",")
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
    app.include_router(ollama_router)
    app.include_router(studio_router)

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
    def upload_contents(
        workspace_id: str, files: Annotated[list[UploadFile], File()]
    ) -> GraphSnapshot:
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
        next_index = max(
            [int(entry.id) for entry in workspace.contents if entry.id.isdigit()] or [0]
        )

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

    @app.post("/api/graph/import", response_model=GraphSnapshot)
    def import_graph(graph: Graph) -> GraphSnapshot:
        """Replace the entire graph, validating it before any stored data changes."""
        return store.save(graph)

    def find_workspace(graph: Graph, workspace_id: str) -> Workspace:
        workspace = next((item for item in graph.workspaces if item.id == workspace_id), None)
        if workspace is None:
            raise HTTPException(404, "Workspace not found")
        return workspace

    def editor_workspace(graph: Graph, workspace_id: str) -> Workspace:
        workspace = find_workspace(graph, workspace_id)
        if workspace.type != "text-editor":
            raise HTTPException(409, "Workspace is not a TextEditor")
        return workspace

    def require_file_connection(graph: Graph, source: str, target: str) -> None:
        if not any(wire.source == source and wire.target == target for wire in graph.wires):
            raise HTTPException(403, "A directed wire is required for this operation")

    @app.post("/api/workspaces/{workspace_id}/type", response_model=GraphSnapshot)
    def set_workspace_type(workspace_id: str, request: WorkspaceTypeRequest) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            workspace = find_workspace(graph, workspace_id)
            if workspace.type is not None and workspace.type != request.type:
                raise HTTPException(409, "Workspace type is immutable")
            workspace.type = request.type
            if request.type == "text-editor" and workspace.editor is None:
                workspace.editor = EditorDocument()

        return store.update(change)

    @app.put("/api/workspaces/{workspace_id}/auto-update", response_model=GraphSnapshot)
    def set_auto_update(workspace_id: str, request: AutoUpdateRequest) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            find_workspace(graph, workspace_id).autoUpdate = request.enabled

        return store.update(change)

    @app.put("/api/workspaces/{workspace_id}/editor", response_model=GraphSnapshot)
    def update_document(workspace_id: str, document: EditorDocument) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            editor_workspace(graph, workspace_id).editor = document

        return store.update(change)

    @app.put("/api/workspaces/{workspace_id}/tool", response_model=GraphSnapshot)
    def update_tool(
        workspace_id: str, state: MathState | TableState | OllamaState | StudioState
    ) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            workspace = find_workspace(graph, workspace_id)
            if workspace.type != state.kind:
                raise HTTPException(409, "Settings must match the workspace type")
            workspace.tool = state

        return store.update(change)

    @app.post("/api/workspaces/{workspace_id}/editor/open", response_model=GraphSnapshot)
    def open_document(workspace_id: str, request: OpenDocumentRequest) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            editor = editor_workspace(graph, workspace_id)
            source = find_workspace(graph, request.workspaceId)
            require_file_connection(graph, source.id, editor.id)
            if source.type != CONTENT_SOURCE_TYPE:
                raise HTTPException(409, "Source does not expose files")
            entry = next((item for item in source.contents if item.id == request.fileId), None)
            if entry is None:
                raise HTTPException(404, "File not found")
            try:
                raw = base64.b64decode(entry.dataUrl.split(",", 1)[1], validate=True)
                text = raw.decode("utf-8-sig")
                if "\x00" in text:
                    raise ValueError("Binary file")
            except (ValueError, UnicodeError, IndexError) as error:
                raise HTTPException(415, "TextEditor opens UTF-8 text files") from error
            editor.editor = EditorDocument(
                text=text,
                name=entry.name,
                sourceWorkspaceId=source.id,
                sourceFileId=entry.id,
            )

        return store.update(change)

    @app.post("/api/workspaces/{workspace_id}/editor/save", response_model=GraphSnapshot)
    def save_document(workspace_id: str, request: SaveDocumentRequest) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            editor = editor_workspace(graph, workspace_id)
            target = find_workspace(graph, request.workspaceId)
            require_file_connection(graph, editor.id, target.id)
            if target.type != CONTENT_SOURCE_TYPE:
                raise HTTPException(409, "Destination does not accept files")
            entry = (
                next((item for item in target.contents if item.id == request.fileId), None)
                if request.fileId
                else None
            )
            if request.fileId and entry is None:
                raise HTTPException(404, "Destination file not found")
            if any(item.name == request.name and item is not entry for item in target.contents):
                raise HTTPException(
                    409, "A file with this name already exists; choose it to overwrite"
                )
            raw = request.text.encode("utf-8")
            saved = ContentEntry(
                id=entry.id if entry else str(uuid4()),
                name=request.name,
                mimeType="text/plain",
                size=len(raw),
                dataUrl="data:text/plain;base64," + base64.b64encode(raw).decode("ascii"),
            )
            if entry:
                target.contents[target.contents.index(entry)] = saved
            else:
                target.contents.append(saved)
            editor.editor = EditorDocument(
                text=request.text,
                name=request.name,
                sourceWorkspaceId=target.id,
                sourceFileId=saved.id,
            )

        return store.update(change)

    @app.post("/api/workspaces/{workspace_id}/file/save", response_model=GraphSnapshot)
    def save_file(workspace_id: str, request: SaveFileRequest) -> GraphSnapshot:
        def change(graph: Graph) -> None:
            source = find_workspace(graph, workspace_id)
            target = find_workspace(graph, request.workspaceId)
            require_file_connection(graph, source.id, target.id)
            if target.type != CONTENT_SOURCE_TYPE:
                raise HTTPException(409, "Destination does not accept files")
            expected = f"data:{request.mimeType};base64"
            header, separator, payload = request.dataUrl.partition(",")
            if not separator or header != expected:
                raise HTTPException(422, "Data URL must match the declared MIME type")
            try:
                raw = base64.b64decode(payload, validate=True)
            except ValueError as error:
                raise HTTPException(422, "Invalid base64 data URL") from error
            if len(raw) > 100_000_000:
                raise HTTPException(413, "File is too large")
            entry = next((item for item in target.contents if item.name == request.name), None)
            if entry is None and len(target.contents) >= 1000:
                raise HTTPException(409, "Destination already has the maximum number of files")
            saved = ContentEntry(
                id=entry.id if entry else str(uuid4()),
                name=request.name,
                mimeType=request.mimeType,
                size=len(raw),
                dataUrl=request.dataUrl,
            )
            if entry:
                target.contents[target.contents.index(entry)] = saved
            else:
                target.contents.append(saved)

        return store.update(change)

    @app.delete("/api/graph", status_code=204)
    def delete_graph() -> Response:
        store.clear()
        return Response(status_code=204)

    # Mount last so unknown API routes still return JSON rather than the UI.
    static_dir = os.environ.get("INDIGOQ_STATIC_DIR")
    if static_dir:

        @app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
        def unknown_api(path: str) -> None:
            raise HTTPException(404, "Unknown API route")

        app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()
