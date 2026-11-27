# indigoQ

An infinite, pannable and zoomable canvas for composing data pipelines. Draw
workspaces anywhere, connect them with animated dataflow wires, and the graph is
persisted locally and to a small FastAPI service.

- **Frontend** — Next.js 16, React 19, TypeScript, canvas 2D rendering (`frontend/`)
- **Backend** — FastAPI + Pydantic, atomic JSON store (`backend/`)
- **Tooling** — [moon](https://moonrepo.dev) task runner, [uv](https://docs.astral.sh/uv/) for Python, pnpm for Node

## Prerequisites

For the **pre-built portable bundle**, see
[installation instructions](docs/INSTALL.md) and
[GitHub Releases](https://github.com/majiccode/indigoQ/releases). The bundle
includes Python, the backend, and the frontend; no runtime dependencies are
needed. The prerequisites below are only for source development.

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

Run the frontend expression/data-flow tests with `pnpm --dir frontend test`.

## Build and release

```bash
# Build the portable bundle for the current machine:
node scripts/build-release.mjs --build-only

# From clean, up-to-date main: bump patch, check, commit, tag, push, and publish:
./release.sh

# Optional: larger bump, explicit version, preview, or don't wait for Actions:
./release.sh minor
./release.sh 1.0.0
./release.sh --dry-run
./release.sh --no-wait
```

The tag workflow builds macOS arm64/x64, Windows x64, and Linux x64 bundles.
The self-contained bundles, one-line installers, checksums, and installation
instructions are published together after checks pass.
`./release.sh` reads the current version, increments the patch version (for example,
`0.1.4` → `0.1.5`), and waits for Actions to finish before printing the release URL.
Commit your application changes first; the script commits the version bump for you.
See [the release guide](docs/INSTALL.md#build-and-publish-from-source) for prerequisites.

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

Workspaces with inputs expose a persisted **Auto-update** toggle in their toolbar.
When disabled, connected data stays at a snapshot until **Refresh inputs** is
pressed. Live previews keep their existing auto-update defaults; Transform, SQL,
and Data Table default to manual processing. Enable the toggle on these processors
to rerun when input data changes. Data Table follows the first connected table,
then text source, then file source. Turn it off to keep independent table edits.
Ollama generation, model comparisons, microphone recording, playback, and HTTP
requests retain their explicit Run/Start/Send controls.

Blank workspaces offer a **Choose workspace type** toolbar. Types register their
React component and input/output capabilities in `workspaceTypes.ts`. A type is
immutable once assigned. Dropping files onto a blank workspace selects FileWorkspace.

- **FileWorkspace** collects files and exposes a `files` input/output.
- **TextEditor** is a syntax-colored editor with undo/redo, inline numeric knobs,
  and selection-driven curve/wave visualizations. Select a number to adjust it.
  **Example** inserts a sample document; visualizations do not execute code.
  Select colours (hex, RGB, HSL, HSV/HSB) for a colour wheel and alpha controls,
  booleans for a toggle, unit-bearing numbers for a unit-preserving knob, and
  angles for a circular dial. Two-number arrays or `{ x, y }` literals open an XY
  pad; longer numeric arrays open a draggable curve with individual value controls.
  All visual edits participate in the editor's undo/redo history.
- Wire **FileWorkspace → TextEditor** to expose files under **File → Open**.
- Wire **TextEditor → FileWorkspace** to expose a **File → Save** destination.
  Both directions can coexist; overwrite requires explicitly choosing a file.
- Wire **Image Studio → FileWorkspace** to save published PNGs into that workspace's
  files. Publishing again overwrites `edited.png` in each connected FileWorkspace.
- Editor drafts are saved independently of files. Open/Save require the API and
  validate directed connections server-side. TextEditor opens UTF-8 text files.
- The workspace toolbar's fullscreen button opens `/workspace?id=…`; double-click
  the workspace toolbar to expand while leaving editor double-click text selection intact.
- File drops remain available on graph previews below the interaction zoom threshold.

### Math Lab, Data Table, and local AI

Choose these types from any blank workspace. Use fullscreen for a larger editing
surface. Their settings and completed outputs are saved with the graph.

- **Math Lab** plots one expression per line, with named parameters such as
  `amplitude = 2` and curves such as `y = amplitude * sin(x)`. Parameters get
  live knobs with editable values and ranges. Multiple curves, visibility toggles,
  drag-to-pan, zoom buttons, coordinate inspection, and sampled CSV export are
  included. The expression language supports `+ - * / ^`, parentheses, `pi`, `e`,
  and common math functions; it does not execute JavaScript. Use explicit `*`
  for multiplication. **Equations from** selects an incoming TextEditor or Ollama
  output and updates the plot when that source is saved.
- **Data Table** imports CSV or JSON from a local file, pasted text, or a connected
  workspace. JSON can be an array of objects or an array of rows (first row is the
  header). Edit cells and headers, add/delete rows, add columns, sort/filter,
  inspect numeric summaries, or add a computed column using a math expression.
  CSV and JSON exports include the whole table. Imports are snapshots by default;
  sorting and filtering are view-only. Tables support up to 100 columns and
  10,000 rows, displaying the first 500 matching rows.
- **Ollama** lists installed local models and streams responses through the backend.
  Choose a model, enter instructions and a prompt, select incoming context sources,
  and press **Run**. Temperature, JSON output, presets, cancellation, output
  download/copy, and the last context snapshot are available. Connected files must
  be UTF-8 text. Generation is manual; changes to inputs never launch model calls.

Ollama defaults to `http://127.0.0.1:11434`. Start it before refreshing models.
To use another server, set `OLLAMA_BASE_URL` in the backend environment.

Try these connections:

1. **Ollama → Math Lab:** choose the **equations** preset, Run, then select that
   Ollama workspace under Math Lab's **Equations from**.
2. **Ollama → TextEditor → Math Lab:** import the generated text into the editor,
   then select the editor as the equation source. Adjusting editor numbers updates
   the plot after the draft is saved.
3. **FileWorkspace → Data Table → Math Lab:** import a connected CSV/JSON file;
   Math Lab overlays the first connected table as scatter points with X/Y selectors.
4. **Math Lab → Data Table:** import **sampled curves** to capture 201 samples across
   the current X range, including current parameter-knob values.
5. **Data Table → Ollama:** select the table as context and use **summarize**, or
   **Ollama → Data Table:** use **extract** and import its completed JSON response.

The TextEditor toolbar also offers **Import text…** for incoming text connections.
This explicitly replaces the current draft with a snapshot of the chosen output.

## Studio workspace collection

Sixteen additional mini-apps are available from the workspace type picker:

| Workspace | Working features and connections |
|---|---|
| **Shared Controls** | Named numeric sliders, toggles, selects, colors, text, and trigger buttons. Edit definitions as JSON. Connect to Math Lab, Simulation, Audio, Playground, Dashboard, or a recording Timeline. |
| **Simulation Lab** | Spring, pendulum, orbit, predator/prey, and epidemic simulations; play/pause, time scrubber, draggable initial displacement for spring/pendulum. **Capture data** publishes a table. |
| **Timeline / Sequencer** | Linear numeric parameter tracks, looping, scrubbing, and 10 Hz recording of incoming controls into a table. **Reset / release controls** returns control to connected manual knobs. |
| **HTML Playground** | HTML/CSS/JavaScript editor and sandboxed iframe. **Run preview** executes the current document. Import generated HTML from Ollama/TextEditor. Connected controls/data arrive as `indigoq:input` events. `indigoQ.publish({text, table: {columns, rows}})` offers output; **Accept output** publishes it to the graph. |
| **Audio / Signal Lab** | Sine/square/triangle/sawtooth and connected-equation waveforms, live frequency/gain/cutoff, enabled toggle, low-pass filter, oscilloscope/spectrum, synth recording, and connected audio-file playback. Start and recording require explicit clicks. |
| **HTTP / API Client** | HTTP methods, headers/body, response status/headers/timing, cancellation, and explicitly started periodic refresh. Responses publish text and, where possible, a table. Requests run through the backend; redirects are returned rather than followed. |
| **Transform** | JSON-path extraction (`$.items[0].name`), array filtering by field substring, per-record templates (`{{field}}`), regex extraction in a time-limited worker. Run explicitly to publish text/table results. |
| **SQL Explorer** | Read-only SQLite queries against connected `input1`, `input2`, … tables. Joins, grouping, and aggregates. Isolated backend memory database, 3-second query limit, 10,000 output rows. |
| **Document Preview** | Markdown, GFM tables, fenced code, inline/display mathematics, connected live source, Markdown download, print/PDF, and explicit published text snapshots. |
| **Diff / Compare** | Two local or connected text sources, JSON formatting, line-level additions/removals, and publish-right-side action. |
| **Image Studio** | Local/connected images, percentage crop, resize, brightness/contrast/saturation, text annotation, RGBA pixel inspection. **Publish PNG** exposes edited images to other workspaces and saves `edited.png` into any connected FileWorkspace; connect to a vision-capable Ollama model. |
| **Model Bench** | Sequential model × temperature comparisons with shared connected context, streaming progress, timings, stop, 1–5 ratings, and a published results table. |
| **Knowledge Library** | Local keyword-ranked passage search across connected text and UTF-8 files, source workspace links and character offsets. Search output can be selected as Ollama context. This first version uses lexical retrieval rather than embeddings. |
| **Dashboard** | Connected control metrics, numerical charts, table previews, Markdown, images, and audio; title, card visibility, print/PDF. |
| **Chart Studio** | Connected tables as line, scatter, grouped bar, or histogram charts; X/Y/series mapping, hover values, log axes, reference line, zoom/pan, and brush selection. Publish all or selected rows as a table snapshot; export SVG or PNG, with PNG saved to outgoing FileWorkspaces. |
| **Speech to Text** | Full-workspace live microphone FFT, red recording toggle, language selection, interim transcription preview, and persistent transcript with text download. Wire → TextEditor to append finalized phrases or → Ollama to dictate its prompt; other studio text consumers can read the live output. Uses browser Web Speech recognition, which may require internet. |

Speech to Text starts microphone access only after **Enable mic** or **Record**.
Stopping recording leaves the microphone spectrum running; **Mic off** releases
the microphone. Neither microphone access nor recognition starts on graph load.
Speech delivery is live within the current page, and does not auto-run Ollama.
Load **Examples → Voice to Ollama** for a ready-wired microphone workspace and
Ollama assistant. Dictate a question, choose an installed model, then press Run.
For a complete voice-to-data pipeline, load **Voice Expense Detective**: dictate
purchases, extract structured records with Ollama, aggregate them with SQL, and
explore spending in Chart Studio. Sample results are preloaded so the chart works
before you record or run a model; PNG exports go into Evidence Files.

The **Chart Studio** example in the Examples menu uses a small weekly-sales table
with two regions. Brush points and publish them, import the result in Selected
Rows, or export a PNG into Chart Exports.

### Live controls and saved outputs

Live controls travel immediately within the current page; they do not wait for an
API roundtrip. Saved control values are included in graph JSON. Matching control
names override local parameters. Timeline playback overrides connected control
values until released. Frame-by-frame playback is transient; Save JSON captures
the timeline position. Playback, sound, polling, model calls, and SQL/HTTP requests
never auto-start on graph load.

Manual result-producing actions (simulation capture, SQL, transform, model runs,
image publish, playground accept) publish persistent snapshots. Downstream Data
Table imports remain explicit unless Auto-update is enabled. Live control updates across separate browser tabs
are not synchronized frame-by-frame.

Three additional header examples cover the collection:

- **Interactive Studio:** shared controls → simulation, Math Lab, and HTML spring;
  timeline animation, captured samples, audio synth, and dashboard.
- **Data Workbench:** JSON → Transform → SQL aggregation → Dashboard, plus HTTP,
  a Markdown/math report, and JSON comparison.
- **Research & Media:** notes → Knowledge Library → Ollama, model benchmarking,
  image editing → vision model, and a research dashboard.

Each includes a Start here workspace. Use workspace fullscreen for comfortable editing.

## Persistence

### Save, load, and examples

The app header provides **Save JSON**, **Load JSON**, and **Examples**:

- **Save JSON** downloads the complete graph, including connections, embedded files,
  editor drafts, tool settings, table data, and completed AI outputs. Pending editor
  and knob changes are flushed before export. The file uses a versioned JSON envelope:
  `{ "format": "indigoq", "version": 1, "graph": { "workspaces": [], "wires": [] } }`.
- **Load JSON** replaces the current canvas and fits it into view. The whole graph
  is validated before replacement; invalid files leave the existing graph intact.
  Raw graph/API JSON and the backend's `{ "graph": …, "updatedAt": … }` files also
  load. Loading requires the backend API. Save your current graph before switching.
- **Examples** loads a prewired graph or downloads its JSON. Each example includes
  a **Start here** editor with instructions:
  - **Oscillator Lab:** equation editor → live parameter knobs and plots → sampled table.
  - **Measured vs. Model:** embedded CSV → editable measurements → model/scatter comparison.
  - **Local AI Studio:** Ollama → equation editor → plot, and context → JSON extraction → table.
    Sample completed outputs are included; choose an installed model to generate new ones.

Example files live in `frontend/public/examples/` and are served at `/examples/*.json`.
Model generation never runs automatically when loading a graph.

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
| `POST`   | `/api/graph/import` | Validate and replace the entire graph |
| `PUT`    | `/api/workspaces/{id}/tool` | Save typed tool settings/output |
| `GET`    | `/api/ollama/models` | List locally installed models |
| `POST`   | `/api/ollama/generate` | Stream a model response as NDJSON |

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
