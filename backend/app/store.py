"""Tiny, dependency-free JSON store for the canvas graph."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import shutil
import tempfile
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path

from .models import ContentEntry, Graph, GraphSnapshot


class GraphStore:
    """Persist a graph to disk with atomic writes and in-process locking."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = threading.RLock()

    @property
    def files_path(self) -> Path:
        return self._path.parent / "files"

    def file_path(self, reference: str) -> Path:
        pattern = r"/api/files/(?:ws-[A-Za-z0-9._:-]{1,64}/)?[a-f0-9]{64}"
        if not re.fullmatch(pattern, reference):
            raise ValueError("Invalid stored file reference")
        return self.files_path / reference.removeprefix("/api/files/")

    def store_file(self, raw: bytes, workspace_id: str) -> str:
        if len(raw) > 100_000_000:
            raise ValueError("File exceeds the 100 MB limit")
        digest = hashlib.sha256(raw).hexdigest()
        # Prefixing the directory also makes IDs such as '.' and '..' harmless.
        owner = f"ws-{workspace_id}"
        reference = f"/api/files/{owner}/{digest}"
        destination = self.file_path(reference)
        with self._lock:
            destination.parent.mkdir(parents=True, exist_ok=True)
            if not destination.exists():
                descriptor, temporary = tempfile.mkstemp(dir=destination.parent, prefix=".upload-")
                try:
                    with os.fdopen(descriptor, "wb") as handle:
                        handle.write(raw)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temporary, destination)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
        return reference

    def read_file(self, entry: ContentEntry) -> bytes:
        if entry.dataUrl.startswith("data:"):
            header, payload = entry.dataUrl.split(",", 1)
            if not header.endswith(";base64"):
                raise ValueError("Expected a base64 file")
            return base64.b64decode(payload, validate=True)
        try:
            return self.file_path(entry.dataUrl).read_bytes()
        except FileNotFoundError as error:
            raise ValueError(f"Stored file is missing: {entry.name}") from error

    @staticmethod
    def entries(graph: Graph):
        for workspace in graph.workspaces:
            yield from workspace.contents
            yield from getattr(workspace.tool, "files", None) or []

    def _externalize(self, graph: Graph) -> bool:
        changed = False
        for workspace in graph.workspaces:
            entries = [*workspace.contents, *(getattr(workspace.tool, "files", None) or [])]
            for entry in entries:
                if entry.dataUrl.startswith("data:") or not entry.dataUrl.startswith(
                    f"/api/files/ws-{workspace.id}/"
                ):
                    raw = self.read_file(entry)
                    entry.dataUrl = self.store_file(raw, workspace.id)
                    entry.size = len(raw)
                    changed = True
                elif not self.file_path(entry.dataUrl).is_file():
                    raise ValueError(
                        f"Stored file is missing: {entry.name}. Import a portable graph export."
                    )
        return changed

    @property
    def path(self) -> Path:
        return self._path

    def load(self) -> GraphSnapshot | None:
        with self._lock:
            return self._load()

    def _load(self) -> GraphSnapshot | None:
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

        # Older graphs embedded file bytes. Migrate once, atomically, on first load.
        with self._lock:
            if self._externalize(graph):
                return self.save(graph)
        return GraphSnapshot(**graph.model_dump(), updatedAt=updated_at)

    def save(self, graph: Graph) -> GraphSnapshot:
        with self._lock:
            return self._save(graph)

    def _save(self, graph: Graph) -> GraphSnapshot:
        graph = graph.model_copy(deep=True)
        self._externalize(graph)
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

            referenced = {self.file_path(entry.dataUrl) for entry in self.entries(graph)}
            if self.files_path.exists():
                for path in self.files_path.iterdir():
                    if path.is_dir() and path.name.startswith("ws-"):
                        for binary in path.iterdir():
                            if (
                                re.fullmatch(r"[a-f0-9]{64}", binary.name)
                                and binary not in referenced
                            ):
                                binary.unlink(missing_ok=True)
                        if not any(path.iterdir()):
                            path.rmdir()
                    elif re.fullmatch(r"[a-f0-9]{64}", path.name) and path not in referenced:
                        path.unlink(missing_ok=True)

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
            if self.files_path.exists():
                for path in self.files_path.iterdir():
                    if path.is_dir() and path.name.startswith("ws-"):
                        shutil.rmtree(path)
                    elif re.fullmatch(r"[a-f0-9]{64}", path.name):
                        path.unlink(missing_ok=True)
