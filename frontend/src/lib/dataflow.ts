import type { Graph, Workspace } from "./types";
import { incomingSnapshot } from "./autoUpdate";

export function inputState(graph: Graph, snapshot: Graph, id: string, live: boolean): string {
  const connected = graph.wires.some((wire) => wire.target === id);
  if (!connected) return "No connected inputs";
  if (live) return "Live inputs";
  return incomingSnapshot(graph, id) === incomingSnapshot(snapshot, id)
    ? "Input snapshot"
    : "New input available";
}

export function hasPublishedOutput(workspace: Workspace): boolean {
  const tool = workspace.tool;
  return !!tool && "output" in tool && (!!tool.output || ("table" in tool && !!tool.table) || ("files" in tool && !!tool.files?.length));
}

// Compact saved fingerprint: avoids copying large source documents into settings.
export function inputFingerprint(value: string): string {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `${value.length}:${a >>> 0}:${b >>> 0}`;
}
