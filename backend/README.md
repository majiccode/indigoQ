# indigoQ API

FastAPI service that persists the workspace graph to `data/graph.json`.

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8787
```

Endpoints: `GET /api/health`, `GET/PUT/DELETE /api/graph`.
