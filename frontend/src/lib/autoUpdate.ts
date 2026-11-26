import type { Graph, Workspace } from "./types";

const LIVE_TYPES = new Set(["text-editor", "ollama", "math-lab", "controls", "simulation", "timeline", "audio-lab", "playground", "document-preview", "diff", "image-studio", "dashboard", "chart-studio"]);
export function autoUpdateEnabled(workspace: Workspace): boolean {
  if (typeof workspace.autoUpdate === "boolean") return workspace.autoUpdate;
  if (workspace.tool && "settings" in workspace.tool && typeof workspace.tool.settings.autoUpdate === "boolean") return workspace.tool.settings.autoUpdate;
  return LIVE_TYPES.has(workspace.type ?? "");
}
export function incomingSnapshot(graph: Graph, id: string): string {
  const ids = new Set(graph.wires.filter((wire) => wire.target === id).map((wire) => wire.source));
  return JSON.stringify(graph.workspaces.filter((workspace) => ids.has(workspace.id)).map(({ id, type, editor, tool, contents }) => ({ id, type, editor, tool, contents })));
}
