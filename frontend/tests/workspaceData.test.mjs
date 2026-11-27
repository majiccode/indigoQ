import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function load(name) {
  const source = fs.readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "require", compiled)(exports, (name) => load(name.replace("./", "")));
  return exports;
}
const { compileExpression, parseMath } = load("mathEngine");
const { parseTable, tableCSV, workspaceTable, workspaceText } = load("workspaceData");
const { documentSource, isPdf, pdfPageText } = load("documentData");
const { parseGraphFile, serializeGraph } = load("graphFile");
const { registerWorkspaceFlush, flushWorkspaces } = load("workspaceFlush");
const { parseControls, savedControls, selectPath, searchPassages } = load("studio");
const { simulate } = load("simulation");
const { diffLines } = load("textDiff");
const { workspaceResizeAt, resizeCursor } = load("geometry");
const { detectSelectionTokens, parseColour, formatColour, replaceTokenValues } = load("selectionEditors");
const { chartPoints, chartBounds, selectedChartRows } = load("chart");
const { speechResults, appendSpeech } = load("speech");
const { transformInput } = load("transform");
const { autoUpdateEnabled, incomingSnapshot } = load("autoUpdate");

test("document previews select different shared files and publish text for comparison", () => {
  const first = { id: "first", name: "original.pdf", mimeType: "application/octet-stream", dataUrl: "data:application/pdf;base64,one" };
  const second = { id: "second", name: "revision.PDF", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,two" };
  const source = { id: "files", type: "FileWorkspace", contents: [first, second] };
  assert.equal(documentSource([source], "file|files|first", "").file, first);
  assert.equal(documentSource([source], "file|files|second", "").file, second);
  assert.equal(documentSource([source], "", "").file, first);
  assert.equal(documentSource([source], "file|files|removed", "").missing, true);
  assert.equal(documentSource([], "file|files|first", "").missing, true);
  assert.equal(documentSource([source], "local", "Local document").text, "Local document");
  assert.ok(isPdf(first));
  assert.ok(isPdf(second));
  assert.equal(isPdf({ name: "note.md", mimeType: "text/markdown" }), false);
  const original = pdfPageText([{ type: "beginMarkedContent" }, { str: "Invoice", hasEOL: true }, { str: "Amount:" }, { str: "10", hasEOL: true }]);
  const revision = pdfPageText([{ str: "Invoice", hasEOL: true }, { str: "Amount:" }, { str: "20", hasEOL: true }]);
  assert.equal(original, "Invoice\nAmount: 10");
  const previews = [original, revision].map((output, i) => ({ id: `preview-${i}`, contents: [], tool: { kind: "document-preview", output } }));
  const left = documentSource(previews, "text|preview-0", "").text;
  const right = documentSource(previews, "text|preview-1", "").text;
  assert.equal(left, workspaceText(previews[0]));
  assert.deepEqual(diffLines(left, right).filter((line) => line.kind !== "same"), [{ kind: "add", text: "Amount: 20" }, { kind: "remove", text: "Amount: 10" }]);
});

test("auto-update policy preserves explicit flags and legacy preview defaults", () => {
  assert.equal(autoUpdateEnabled({ type: "sql" }), false);
  assert.equal(autoUpdateEnabled({ type: "chart-studio" }), true);
  assert.equal(autoUpdateEnabled({ type: "transform", autoUpdate: true }), true);
  assert.equal(autoUpdateEnabled({ type: "chart-studio", autoUpdate: false }), false);
  const source = { id: "source", type: "ollama", tool: { output: "one" } };
  const graph = { workspaces: [source, { id: "target" }], wires: [{ source: "source", target: "target" }] };
  assert.equal(incomingSnapshot(graph, "target"), incomingSnapshot({ ...graph, workspaces: [{ ...source, x: 999 }, { id: "target", tool: { output: "other" } }] }, "target"));
});

test("transform accepts fenced Ollama JSON and clears tables for empty extraction", async () => {
  const state = { kind: "transform", settings: { mode: "path", path: "$.expenses" }, text: "", table: { kind: "data-table", columns: ["item", "amount"], rows: [] } };
  const result = await transformInput('```json\n{"expenses":[{"item":"coffee","amount":5}]}\n```', state);
  assert.deepEqual(result.table.rows, [["coffee", "5"]]);
  assert.deepEqual((await transformInput('{"expenses":[]}', state)).table.rows, []);
  await assert.rejects(transformInput('{"wrong":[]}', state), /Missing path/);
});

test("speech output separates interim hypotheses and appends only new final phrases", () => {
  const result = (text, isFinal) => ({ 0: { transcript: text }, length: 1, isFinal });
  const event = { resultIndex: 1, results: { length: 4, 0: result("already sent", true), 1: result("hello world", true), 2: result("next phrase", true), 3: result("still thinking", false) } };
  assert.deepEqual(speechResults(event), { final: "hello world next phrase", interim: "still thinking" });
  assert.equal(appendSpeech("Existing note", "hello world"), "Existing note hello world");
  assert.equal(appendSpeech("Line\n", "hello"), "Line\nhello");
  assert.equal(appendSpeech("", "  hello  "), "hello");
  assert.equal(appendSpeech("Keep me", ""), "Keep me");
});

test("charts omit invalid cells, preserve series, brush original rows and bin endpoints", () => {
  const table = { kind: "data-table", columns: ["x", "y", "group"], rows: [["1", "2", "A"], ["2", "4", "B"], ["", "5", "A"], ["3", "", "B"], ["4", "-2", "B"]] };
  const options = { kind: "scatter", x: "x", y: "y", series: "group", bins: 2, logX: false, logY: false };
  const points = chartPoints(table, options);
  assert.deepEqual(points.map((point) => point.rows[0]), [0, 1, 4]);
  assert.deepEqual(selectedChartRows(points, [2.5, 0, 5, 0]), [0, 1]);
  assert.deepEqual(selectedChartRows(points, [10, 20, 10, 20]), []);
  assert.equal(chartPoints(table, { ...options, logY: true }).length, 2);
  const bins = chartPoints(table, { ...options, kind: "histogram" });
  assert.equal(bins.reduce((sum, bin) => sum + bin.y, 0), 4);
  assert.deepEqual(bins.flatMap((bin) => bin.rows).sort(), [0, 1, 3, 4]);
  assert.deepEqual(selectedChartRows(bins, [-100, 100, -100, 100]), [0, 1, 3, 4]);
  assert.ok(chartBounds(points, "scatter").every(Number.isFinite));
  const categorical = { ...table, rows: [["Jan", "2", "A"], ["Feb", "3", "A"]] };
  assert.deepEqual(chartPoints(categorical, { ...options, kind: "bar" }).map((point) => point.label), ["Jan", "Feb"]);
});

test("selection editors detect whole structured literals without nested number knobs", () => {
  const text = 'const colour = "rgba(200, 164, 255, 0.8)"; const enabled = true; const angle = "45deg"; const size = "24px"; const xy = { x: 10, y: -20 }; const points = [0.2, 0.8, 0.4];';
  const tokens = detectSelectionTokens(text, 0, 0, text.length);
  assert.deepEqual(tokens.map((token) => token.kind), ["colour", "boolean", "angle", "unit", "xy", "array"]);
  assert.equal(tokens[0].label, "colour");
  assert.equal(replaceTokenValues(tokens[2], [90]), "90deg");
  assert.equal(replaceTokenValues(tokens[4], [30, 40]), "{ x: 30, y: 40 }");
  assert.deepEqual(detectSelectionTokens("[1, 2]", 0, 1, 2).map((token) => token.kind), ["xy"]);
  assert.deepEqual(detectSelectionTokens(text, 0, 0, 0), []);
});

test("colour notation roundtrips hex, alpha, percentages and hue units", () => {
  for (const raw of ["#abc", "#abcd", "#AABBCC", "#aabbcc80", "rgba(200, 164, 255, 0.8)", "rgb(100% 0% 0% / 50%)", "hsl(240 100% 50%)", "hsla(120, 50%, 40%, 0.7)", "hsv(120, 50%, 80%)", "hsv(120, 0.5, 0.8)", "hsb(120, 50%, 80%)", "hsl(0.5turn 100% 50%)"]) {
    const colour = parseColour(raw);
    assert.ok(colour, raw);
    const again = parseColour(formatColour(raw, colour));
    for (const key of ["h", "s", "v", "a"]) assert.ok(Math.abs(colour[key] - again[key]) < 0.02, `${raw}: ${key}`);
  }
  assert.equal(parseColour("#nope"), null);
  assert.equal(parseColour("rgb(1, 2)"), null);
  assert.equal(formatColour("#ff0000", { h: 0, s: 1, v: 1, a: 0.5 }), "#ff000080");
});

test("resize corners remain reachable outside borders and across zoom levels", () => {
  const workspace = { id: "back", x: 100, y: 100, width: 300, height: 200 };
  for (const scale of [0.25, 1, 4]) {
    assert.equal(workspaceResizeAt([workspace], { x: 100 - 5 / scale, y: 100 }, scale)?.corner, "top-left");
    assert.equal(workspaceResizeAt([workspace], { x: 400 + 5 / scale, y: 300 }, scale)?.corner, "bottom-right");
    assert.equal(workspaceResizeAt([workspace], { x: 250, y: 100 }, scale), null);
  }
  const front = { id: "front", x: 50, y: 50, width: 400, height: 300 };
  assert.equal(workspaceResizeAt([workspace, front], { x: 100, y: 100 }, 1), null);
  assert.equal(resizeCursor("top-left"), "nwse-resize");
  assert.equal(resizeCursor("bottom-right"), "nwse-resize");
  assert.equal(resizeCursor("top-right"), "nesw-resize");
  assert.equal(resizeCursor("bottom-left"), "nesw-resize");
});

test("math precedence, powers, functions, and named parameters", () => {
  assert.equal(compileExpression("-2^2 + 2^3^2")({}), 508);
  assert.equal(compileExpression("max(1, sqrt(9)) + cos(0)")({}), 4);
  const parsed = parseMath("amplitude = 2\nfrequency = 1.5\ny = amplitude * sin(frequency * x)");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.curves[0].evaluate({ ...parsed.parameters, x: Math.PI / 3 }), 2);
  assert.equal(parsed.curves[0].evaluate({ ...parsed.parameters, amplitude: 4, x: Math.PI / 3 }), 4);
});

test("invalid expressions cannot invoke JavaScript and errors stay on their line", () => {
  for (const expression of ["globalThis.alert(1)", "constructor(1)", "x = 2", "2x", "sin("]) {
    assert.throws(() => compileExpression(expression)({ x: 1 }));
  }
  const result = parseMath("a = 1\ny = unknown(x)\ny = a * x");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Line 2/);
  assert.equal(result.curves.length, 1);
});

test("CSV roundtrips quotes, Unicode, commas, multiline cells, and empty cells", () => {
  const table = { kind: "data-table", columns: ["name", "note"], rows: [["café", 'a,b "quoted"\nsecond line'], ["empty", ""]] };
  assert.deepEqual(parseTable(tableCSV(table)), table);
  assert.deepEqual(parseTable("\uFEFFx,y\r\n1,2\r\n3,4\r\n").rows, [["1", "2"], ["3", "4"]]);
  assert.throws(() => parseTable('x,y\n"oops,2'), /Unclosed/);
  assert.throws(() => parseTable("x\n1,2"), /more cells/);
});

test("JSON records combine keys, preserve nested values, and accept model fences", () => {
  const result = parseTable('```json\n[{"x":1,"meta":{"unit":"s"}},{"x":2,"y":3}]\n```');
  assert.deepEqual(result.columns, ["x", "meta", "y"]);
  assert.deepEqual(result.rows, [["1", '{"unit":"s"}', ""], ["2", "", "3"]]);
  assert.throws(() => parseTable("{}"), /array/);
});

test("Math Lab publishes sampled tables using connected equations and knob overrides", () => {
  const math = { id: "math", type: "math-lab", tool: { kind: "math-lab", expressions: "y=x", sourceId: "editor", parameters: { a: { value: 3, min: 0, max: 5 } }, bounds: [0, 2, -5, 5] } };
  const editor = { id: "editor", type: "text-editor", editor: { text: "a=2\ny=a*x" } };
  const graph = { workspaces: [math, editor], wires: [{ source: "editor", target: "math" }] };
  const table = workspaceTable(math, graph);
  assert.deepEqual(table.columns, ["x", "y1"]);
  assert.equal(table.rows.length, 201);
  assert.deepEqual(table.rows[200], ["2", "6"]);
  assert.deepEqual(workspaceTable(math, { ...graph, wires: [] }).rows[200], ["2", "2"]);
});

test("graph files roundtrip complete examples and accept raw API/store JSON", () => {
  for (const name of ["oscillator-lab", "measurements", "local-ai", "interactive-studio", "data-workbench", "research-media", "chart-studio", "voice-to-ollama", "voice-expense-detective"]) {
    const text = fs.readFileSync(new URL(`../public/examples/${name}.json`, import.meta.url), "utf8");
    const graph = parseGraphFile(text);
    assert.deepEqual(parseGraphFile(serializeGraph(graph)), graph);
    assert.deepEqual(parseGraphFile(JSON.stringify(graph)), graph);
    assert.deepEqual(parseGraphFile(JSON.stringify({ graph, updatedAt: "now" })), graph);
    for (const workspace of graph.workspaces.filter((item) => item.type === "math-lab")) {
      const source = graph.workspaces.find((item) => item.id === workspace.tool.sourceId);
      assert.deepEqual(parseMath(source?.editor?.text ?? workspace.tool.expressions).errors, []);
      assert.ok(workspaceTable(workspace, graph).rows.length > 0);
    }
  }
  assert.throws(() => parseGraphFile("{"), /valid JSON/);
  assert.throws(() => parseGraphFile('{"format":"indigoq","version":99}'), /Unsupported/);
  assert.throws(() => parseGraphFile('{"workspaces":[]}'), /workspaces and wires/);
});

test("shared control definitions, timeline overrides, and cyclic connections", () => {
  assert.throws(() => parseControls('[{"name":"x","type":"number","value":1,"min":2,"max":1}]'), /min/);
  assert.throws(() => parseControls('[{"name":"a","type":"text","value":"x"},{"name":"a","type":"text","value":"y"}]'), /unique/);
  const graph = { workspaces: [
    { id: "timeline", tool: { kind: "timeline", output: '{"amplitude":4}' } },
    { id: "controls", tool: { kind: "controls", text: '[{"name":"amplitude","type":"number","value":2,"min":0,"max":5}]' } },
    { id: "plot", type: "math-lab", tool: { kind: "math-lab", expressions: "amplitude=1\ny=amplitude*x", sourceId: "", parameters: {}, bounds: [0, 1, -5, 5] } },
  ], wires: [{ source: "timeline", target: "controls" }, { source: "controls", target: "plot" }, { source: "controls", target: "controls" }] };
  assert.equal(savedControls(graph, "plot").amplitude, 4);
  assert.deepEqual(workspaceTable(graph.workspaces[2], graph).rows[200], ["1", "4"]);
});

test("simulations remain finite and damping removes spring energy", () => {
  const rows = simulate("spring", 20, { amplitude: 2, frequency: 1.5, damping: 0.5 });
  assert.ok(Math.abs(rows.at(-1)[1]) < 0.1);
  for (const mode of ["pendulum", "orbit", "population", "epidemic"]) {
    const result = simulate(mode, 20, {});
    assert.ok(result.every((row) => row.every(Number.isFinite)));
    assert.equal(result[0][0], 0);
    assert.equal(result.at(-1)[0], 20);
  }
});

test("JSON paths, ranked source passages, and line diffs", () => {
  assert.equal(selectPath({ results: [{ value: 3 }] }, "$.results[0].value"), 3);
  assert.throws(() => selectPath({}, "constructor"), /Missing/);
  const passages = searchPassages([{ name: "physics", workspaceId: "one", text: "Damping affects resonance." }, { name: "other", workspaceId: "two", text: "A cooking recipe." }], "damping resonance");
  assert.equal(passages[0].workspaceId, "one");
  assert.equal(passages[0].score, 2);
  assert.deepEqual(diffLines("a\nb", "a\nc").filter((line) => line.kind !== "same").map((line) => [line.kind, line.text]), [["add", "c"], ["remove", "b"]]);
});

test("graph export flush waits for all registered pending drafts", async () => {
  const calls = [];
  const unregisterA = registerWorkspaceFlush(async () => { await Promise.resolve(); calls.push("editor"); });
  const unregisterB = registerWorkspaceFlush(async () => { calls.push("knob"); });
  await flushWorkspaces();
  assert.deepEqual(calls.sort(), ["editor", "knob"]);
  unregisterA(); unregisterB();
  await flushWorkspaces();
  assert.equal(calls.length, 2);
});
