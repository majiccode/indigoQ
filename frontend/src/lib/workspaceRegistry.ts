import type { ComponentType } from "react";
import type { Graph, Workspace } from "./types";
import type { WorkspaceOperation } from "./graphApi";

export type WorkspaceCapability = "files" | "text" | "table" | "controls";

export interface TypedWorkspaceProps {
  workspace: Workspace;
  graph: Graph;
  onFilesDrop: (files: File[]) => void;
  onOperation: (operation: WorkspaceOperation) => Promise<Workspace>;
}

export interface WorkspaceDefinition {
  type: string;
  name: string;
  description: string;
  inputs: WorkspaceCapability[];
  outputs: WorkspaceCapability[];
  component: ComponentType<TypedWorkspaceProps>;
}

const registry = new Map<string, WorkspaceDefinition>();

export function registerWorkspaceType(definition: WorkspaceDefinition) {
  registry.set(definition.type, definition);
}

export function getWorkspaceTypes() { return Array.from(registry.values()); }
export function getWorkspaceType(type: string | null) {
  return type ? registry.get(type === "FileWorkspace" ? "content-source" : type) : undefined;
}

export function connectedWorkspaces(graph: Graph, id: string, direction: "incoming" | "outgoing", capability: WorkspaceCapability) {
  const wires = graph.wires.filter((wire) => direction === "incoming" ? wire.target === id : wire.source === id);
  const ids = new Set(wires.map((wire) => direction === "incoming" ? wire.source : wire.target));
  return graph.workspaces.filter((workspace) => {
    const definition = getWorkspaceType(workspace.type);
    return ids.has(workspace.id) && (direction === "incoming" ? definition?.outputs : definition?.inputs)?.includes(capability);
  });
}
