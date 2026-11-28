# indigoQ API

FastAPI service that persists the workspace graph to `data/graph.json`.

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8787
```

## Graph and tool API

- `GET /api/health`: health check.
- `GET/PUT/DELETE /api/graph`: read, replace, or clear the stored graph.
- `POST /api/graph/import`: validate and replace a complete graph.
- `GET /api/graph/export`: export a portable graph with embedded files.
- `PUT /api/workspaces/{id}/tool`: save tool settings, drafts, and published outputs.

The schema includes `ascii-art`, `ambient-mood`, `usb-debug`,
`electronic-workspace`, `model-workspace`, and `world-workspace`. They use the
shared studio state: `kind`, `settings`, `text`, `output`, optional `table`, and
`files`. Circuit/model/scene drafts live in `text`; explicit exports publish
snapshots in `output` and `files`.

Image conversion, mood analysis, circuit editing, 3D rendering, and WebUSB run in
the browser. USB device handles and animation sessions are not stored in graph
JSON. The backend validates graph types/references and persists saved state and
files. See the [workspace reference](../docs/WORKSPACES.md) for formats and behavior.

## Verification

```bash
uv run pytest
uv run ruff check .
```

Graph import tests validate and roundtrip every JSON in
`frontend/public/examples/`, including Creative Workshop.
