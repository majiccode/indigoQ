# Three first workflows

Open **Graph files → Examples**. The first three examples focus on one task each.
The header's **Start here** button opens these three starters directly. The
first-run hint can be dismissed; the button remains available. The starter
dialog includes **Save current graph first** before replacing the canvas.
Save your existing graph before loading an example. Open a workspace fullscreen
with its magnifying glass to work comfortably.

## 1. PDF Read-aloud

Includes a small PDF, selected Document Preview, and connected Text to Speech.
Wait for extraction, choose a voice, and press **Speak it all**. Try **Pause**,
**Resume**, and **Stop**. Then add your own PDF to PDF Files and select it in
Document Preview.

Long documents are read in short sequential chunks. Voice/rate settings apply
to the next chunk. Follow reads appended text; replacing a document establishes
a new baseline. Loading a graph never starts Follow or speech automatically.
Switching sources and removing the speech workspace stops its playback.
Browser speech synthesis is shared within a page, so use one speech player at a
time. Voices depend on your browser/system; scanned PDFs require OCR.

## 2. Chart Studio

Open Weekly Sales Chart. Edit a value in Weekly Sales, wait for the saved update,
and confirm the chart changes. Choose line, bar, scatter, or histogram. Brush
points and publish selected rows, then import them into Selected Rows. Export PNG
downloads an image and saves it in Chart Exports.

To use your CSV, choose **Open file** in Weekly Sales. Select X/Y and optional
series in the chart. Empty/non-numeric values are omitted; logarithmic axes
require positive values. Invalid imports preserve the current table.

## 3. Notes to Structured Data

The starter contains notes, a sample completed Ollama response, a Transform, and
an empty Data Table. Inspect the response, run **Validate JSON**, then select
**Validate JSON — table** in Records' **Import connected input**. Edit or export
the resulting rows.

To generate new records, start Ollama, install a model (e.g. `ollama pull
llama3.2`), select it in Extract Records, edit Source Notes, and press **Run**.
Repeat validation and import. Generation and table imports are explicit.
Invalid JSON reports an error without replacing the table. Check the records
against the source notes: valid JSON is not a guarantee of factual accuracy.

## First-user feedback session

Ask three to five people who have not used the app to try **one** of these tasks.
Give them the download and task, then watch without directing their clicks.
Do not claim these sessions have happened until they have.

Record:

| Observation | Notes |
| --- | --- |
| Operating system / browser | |
| Task chosen | |
| Could they install and find the example? | |
| Time to the first useful result | |
| Where did they hesitate or get stuck? | |
| Did Save JSON / reload preserve their work? | |
| Did errors explain what to do next? | |
| Would they use it again, and for what? | |

For PDF speech, confirm playback starts only on a click and Stop works. For
charts, confirm an edit changes the chart and export produces a usable image.
For structured data, confirm the result matches the notes and a malformed JSON
response leaves existing records intact.

Use findings to prioritize fixes before adding more workspace types. Report
reproducible issues at https://github.com/majiccode/indigoQ/issues.

## Reading dataflow status

- **Live inputs:** incoming saved source changes are available to this tool.
  Model runs, speech playback, and explicit imports still require their buttons.
- **Input snapshot:** Auto-update is off; the tool is reading a captured input.
- **New input available:** a connected source changed since that capture. Use
  **Refresh inputs**, then Run or Import to update the result.
- **Published output:** the workspace has a saved result for consumers.

Transform reports when input/operation settings differ from its last successful
run. A failed run retains the previous output. Data Table reports the source of
manual imports during the current session and tells you when that source changes.
With Auto-update enabled, incoming updates can replace table edits.

## Repeatable browser checks

From `frontend/`, after installing dependencies:

```sh
pnpm exec playwright install chromium
INDIGOQ_STATIC_EXPORT=1 NEXT_PUBLIC_API_URL="" pnpm run build
pnpm run test:browser
```

Install backend development dependencies with `uv sync --directory backend`
from the repository root first. Tests launch the exported app on port 8897 with
a temporary graph directory; they do not use the normal saved graph. Chromium
checks starter discovery, sample PDF extraction, speech controls with a mock,
structured record imports/error preservation, table edits, and PNG export.

Speech mocks check behavior, not audible quality. Use the feedback sessions above
to listen on real browsers and test additional operating systems.
