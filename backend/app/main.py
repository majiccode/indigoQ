"""indigoQ graph API."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .models import Graph, GraphSnapshot
from .store import GraphStore

APP_VERSION = "0.1.0"
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
        allow_methods=["GET", "PUT", "DELETE", "OPTIONS"],
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
        return store.save(graph)

    @app.delete("/api/graph", status_code=204)
    def delete_graph() -> Response:
        store.clear()
        return Response(status_code=204)

    return app


app = create_app()
