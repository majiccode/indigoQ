"""Serve the exported app against a disposable graph for browser checks."""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

import uvicorn

root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root / "backend"))
with TemporaryDirectory(prefix="indigoq-browser-") as temporary:
    os.environ["INDIGOQ_DATA_FILE"] = str(Path(temporary) / "graph.json")
    os.environ["INDIGOQ_STATIC_DIR"] = str(root / "frontend" / "out")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8897, log_level="warning")
