import type { Graph } from "./types";

export function serializeGraph(graph: Graph): string {
  return JSON.stringify({ format: "indigoq", version: 1, graph: { workspaces: graph.workspaces, wires: graph.wires } }, null, 2) + "\n";
}

export function parseGraphFile(text: string): Graph {
  let payload;
  try { payload = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw new Error("This file is not valid JSON."); }
  if (!payload || typeof payload !== "object") throw new Error("Expected an indigoQ graph JSON object.");
  if ("format" in payload && (payload.format !== "indigoq" || payload.version !== 1)) {
    throw new Error("Unsupported graph format or version.");
  }
  const graph = payload.graph ?? payload;
  if (!graph || !Array.isArray(graph.workspaces) || !Array.isArray(graph.wires)) {
    throw new Error("A graph must contain workspaces and wires arrays.");
  }
  // Full schema and reference validation happens atomically in the import API.
  return { workspaces: graph.workspaces, wires: graph.wires };
}
