"use client";

import { useState } from "react";

import BlankWorkspace from "./BlankWorkspace";
import "./workspaceTypes";
import { getWorkspaceType, getWorkspaceTypes } from "@/lib/workspaceRegistry";
import { uploadContents, workspaceOperation, type WorkspaceOperation } from "@/lib/graphApi";
import type { Graph, Workspace as WorkspaceModel } from "@/lib/types";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  onWorkspaceChange: (workspace: WorkspaceModel) => void;
  onUpload?: (id: string, files: File[]) => Promise<WorkspaceModel>;
  graph: Graph;
  onGraphChange: (graph: Graph) => void;
  onBeforeOperation?: () => Promise<void>;
  onExpand?: () => void;
}

export default function Workspace({ workspace, graph, onGraphChange, onWorkspaceChange, onUpload, onBeforeOperation, onExpand }: WorkspaceProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosingType, setChoosingType] = useState(false);
  const definition = getWorkspaceType(workspace.type);

  const operate = async (operation: WorkspaceOperation) => {
    await onBeforeOperation?.();
    const updated = await workspaceOperation(workspace.id, operation);
    onGraphChange(updated);
    const next = updated.workspaces.find((item) => item.id === workspace.id);
    if (!next) throw new Error("Workspace missing from response");
    return next;
  };

  const importFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    setUploading(true);
    setError(null);
    try {
      const next = onUpload
        ? await onUpload(workspace.id, files)
        : (await uploadContents(workspace.id, files)).workspaces.find((item) => item.id === workspace.id);
      if (!next) throw new Error("Workspace missing from upload response");
      onWorkspaceChange(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to import files");
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="workspace-content" data-workspace-id={workspace.id} aria-label={`${workspace.name} contents`}>
      <div className="workspace-type-toolbar" onDoubleClick={(event) => { event.stopPropagation(); onExpand?.(); }}>
        <button type="button" className="workspace-type-button" aria-label="Choose workspace type"
          disabled={workspace.type !== null} onClick={() => setChoosingType(!choosingType)}>
          <span aria-hidden>◇</span> {definition?.name ?? "Choose workspace type"}
        </button>
        <span className="workspace-io-label">{definition ? `${definition.inputs.join(", ") || "—"} → ${definition.outputs.join(", ") || "—"}` : "Untyped"}</span>
        {onExpand && <button type="button" aria-label="Open workspace fullscreen" title="Open workspace fullscreen" onClick={onExpand}>⛶</button>}
      </div>
      {choosingType && workspace.type === null && (
        <div className="workspace-type-picker" role="menu" aria-label="Workspace types" onDoubleClick={(event) => event.stopPropagation()}>
          {getWorkspaceTypes().map((type) => <button key={type.type} type="button" role="menuitem" onClick={async () => {
            try { await operate({ kind: "type", type: type.type }); setChoosingType(false); }
            catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to set type"); }
          }}><strong>{type.name}</strong><small>{type.description}</small></button>)}
        </div>
      )}
      <div className="workspace-typed-content">
      {workspace.type == null ? (
        <BlankWorkspace onFilesDrop={importFiles} />
      ) : definition ? (
        <definition.component workspace={workspace} graph={graph} onFilesDrop={importFiles} onOperation={operate} />
      ) : (
        <p>Unsupported workspace type: {workspace.type}</p>
      )}
      </div>
      {uploading && <div className="workspace-status" role="status">Importing files…</div>}
      {error && <div className="workspace-status workspace-status-error" role="alert">{error}</div>}
    </section>
  );
}
