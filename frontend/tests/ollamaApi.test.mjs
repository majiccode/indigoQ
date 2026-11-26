import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/ollamaApi.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const api = {};
new Function("exports", compiled)(api);

test("Ollama streams report thinking, assemble split answer chunks and reject empty answers", async (t) => {
  const encoder = new TextEncoder();
  const response = (chunks) => new Response(new ReadableStream({ start(controller) {
    chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
    controller.close();
  } }));
  t.mock.method(globalThis, "fetch", async () => response([
    '{"thinking":"working","response":"","done":false}\n{"res',
    'ponse":"Hello","done":false}\n{"response":" world","done":true}',
  ]));
  const phases = [], chunks = [];
  const body = { model: "test", prompt: "hello", system: "", temperature: 0.7, jsonOutput: false };
  const output = await api.generateText(body, new AbortController().signal, (text) => chunks.push(text), (phase) => phases.push(phase));
  assert.equal(output, "Hello world");
  assert.deepEqual(chunks, ["Hello", "Hello world"]);
  assert.deepEqual(phases, ["thinking", "answer", "answer"]);
  globalThis.fetch.mock.mockImplementation(async () => response(['{"thinking":"working","done":true}\n']));
  await assert.rejects(api.generateText(body, new AbortController().signal, () => {}), /without an answer/);
  globalThis.fetch.mock.mockImplementation(async () => response(['{"error":"model unavailable"}\n']));
  await assert.rejects(api.generateText(body, new AbortController().signal, () => {}), /model unavailable/);
});
