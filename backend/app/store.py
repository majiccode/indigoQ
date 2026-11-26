"""Tiny, dependency-free JSON store for the canvas graph."""

from __future__ import annotations

import json
import os
import tempfile
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from .models import Graph, GraphSnapshot


class GraphStore:
    """Persist a graph to disk with atomic writes and in-process locking."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()

    @property
    def path(self) -> Path:
        return self._path

    def load(self) -> GraphSnapshot | None:
        with self._lock:
            try:
                raw = json.loads(self._path.read_text(encoding="utf-8"))
            except (FileNotFoundError, OSError, json.JSONDecodeError):
                return None

        try:
            graph_payload = raw["graph"] if isinstance(raw, dict) and "graph" in raw else raw
            graph = Graph.model_validate(graph_payload)
            updated_at = raw.get("updatedAt") if isinstance(raw, dict) else None
        except (KeyError, TypeError, ValueError):
            return None

        return GraphSnapshot(**graph.model_dump(), updatedAt=updated_at)

    def save(self, graph: Graph) -> GraphSnapshot:
        graph = Graph(workspaces=graph.workspaces, wires=graph.wires)
        updated_at = datetime.now(UTC).isoformat(timespec="seconds")
        snapshot = GraphSnapshot(**graph.model_dump(), updatedAt=updated_at)
        payload = {"graph": graph.model_dump(), "updatedAt": updated_at}

        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(
                dir=self._path.parent, prefix=".graph-", suffix=".json"
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, self._path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)

        return snapshot

    def update(self, operation: Callable[[Graph], None]) -> GraphSnapshot:
        """Apply a workspace operation atomically against the latest graph."""
        with self._lock:
            snapshot = self.load()
            graph = (
                Graph(workspaces=snapshot.workspaces, wires=snapshot.wires) if snapshot else Graph()
            )
            operation(graph)
            return self.save(graph)

    def clear(self) -> None:
        with self._lock:
            try:
                self._path.unlink()
            except FileNotFoundError:
                pass
