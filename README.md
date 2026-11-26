# indigoQ

An infinite, pannable and zoomable canvas for composing data pipelines. Draw
workspaces anywhere, connect them with animated dataflow wires, and the graph is
persisted locally and to a small FastAPI service.

- **Frontend** — Next.js 16, React 19, TypeScript, canvas 2D rendering (`frontend/`)
- **Backend** — FastAPI + Pydantic, atomic JSON store (`backend/`)
- **Tooling** — [moon](https://moonrepo.dev) task runner, [uv](https://docs.astral.sh/uv/) for Python, pnpm for Node

## Prerequisites

- moon `>= 2`
- uv `>= 0.11` (Python 3.11+; pinned to 3.13 via `backend/.python-version`)
- Node.js 20+ and pnpm (backend and frontend toolchains are invoked via moon)

## Run

```bash
moon run :setup   # install dependencies for both projects
moon run :dev     # start frontend + backend together
```

- Frontend: <http://localhost:3000>
- API: <http://127.0.0.1:8787>

Run a single side:

```bash
moon run backend:dev    # uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
moon run frontend:dev   # pnpm dev
```

Port `8787` is used for the API because `8000` may already be taken on this
machine. Change it in `backend/moon.yml` and `frontend/next.config.ts`
(`INDIGOQ_API_URL`) if needed.

## Checks

```bash
moon run :build              # next build + python byte-compile
moon run frontend:lint       # eslint
moon run frontend:typecheck  # tsc --noEmit
moon run backend:test        # pytest
moon run backend:lint        # ruff check
moon run backend:format      # ruff format
```

## Controls

| Action                    | Gesture                                       |
| ------------------------- | --------------------------------------------- |
| Create workspace          | Drag on empty canvas                          |
| Move workspace            | Drag its header                               |
| Connect workspaces        | Drag from a workspace border onto another      |
| Rename                    | Double-click header, or select + `Enter`       |
| Delete selected           | `Delete` / `Backspace`                         |
| Pan                       | `Space` + drag, middle-drag, or plain scroll   |
| Zoom                      | `⌘`/`Ctrl` + scroll, `+` / `-`, `0` to fit     |
| Cancel current gesture    | `Escape`                                       |

## Workspace types and connections

Blank workspaces offer a **Choose workspace type** toolbar. Types register their
React component and input/output capabilities in `workspaceTypes.ts`. A type is
immutable once assigned. Dropping files onto a blank workspace selects FileWorkspace.

- **FileWorkspace** collects files and exposes a `files` input/output.
- **TextEditor** is a syntax-colored editor with undo/redo, inline numeric knobs,
  and selection-driven curve/wave visualizations. Select a number to adjust it.
  **Example** inserts a sample document; visualizations do not execute code.
- Wire **FileWorkspace → TextEditor** to expose files under **File → Open**.
- Wire **TextEditor → FileWorkspace** to expose a **File → Save** destination.
  Both directions can coexist; overwrite requires explicitly choosing a file.
- Editor drafts are saved independently of files. Open/Save require the API and
  validate directed connections server-side. TextEditor opens UTF-8 text files.
- The workspace toolbar's fullscreen button opens `/workspace?id=…`; double-click
  the workspace toolbar to expand while leaving editor double-click text selection intact.
- File drops remain available on graph previews below the interaction zoom threshold.

## Persistence

The graph is stored in `localStorage` immediately and debounced (~550 ms) to
`PUT /api/graph`, which writes `backend/data/graph.json` atomically. If the API
is unreachable the UI keeps working offline from local state. On first load,
with no local or remote graph, a sample pipeline (`Ingest → Enrich → Publish`) is
seeded.

Reset the stored graph:

```bash
rm -f backend/data/graph.json
curl -X DELETE http://127.0.0.1:8787/api/graph
```

## API

| Method   | Path           | Description                    |
| -------- | -------------- | ------------------------------ |
| `GET`    | `/api/health`  | Health probe                   |
| `GET`    | `/api/graph`   | Current graph snapshot         |
| `PUT`    | `/api/graph`   | Replace the graph              |
| `DELETE` | `/api/graph`   | Clear the stored graph         |

## Layout

```
backend/
  app/        FastAPI app, models, JSON store
  tests/      API tests
frontend/
  src/app/            page, layout, global styles
  src/components/     IndigoQApp (top bar), CanvasBoard (canvas + HUD)
  src/lib/            geometry, interaction, graph model, API/local persistence, renderer
```
