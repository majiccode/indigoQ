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
const { parseTable, tableCSV, workspaceTable } = load("workspaceData");
const { parseGraphFile, serializeGraph } = load("graphFile");
const { registerWorkspaceFlush, flushWorkspaces } = load("workspaceFlush");

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
  for (const name of ["oscillator-lab", "measurements", "local-ai"]) {
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
