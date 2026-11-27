"use client";

import { useState } from "react";

import BlankWorkspace from "./BlankWorkspace";
import "./workspaceTypes";
import { getWorkspaceType } from "@/lib/workspaceRegistry";
import { enqueueWorkspaceOperation, uploadContents, workspaceOperation, type WorkspaceOperation } from "@/lib/graphApi";
import type { Graph, Workspace as WorkspaceModel } from "@/lib/types";
import { autoUpdateEnabled } from "@/lib/autoUpdate";

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
  const definition = getWorkspaceType(workspace.type);
  const [inputSnapshot, setInputSnapshot] = useState(graph);
  const autoUpdate = autoUpdateEnabled(workspace);
  const inputGraph = autoUpdate ? graph : {
    ...inputSnapshot,
    workspaces: inputSnapshot.workspaces.map((item) => item.id === workspace.id ? { ...workspace, autoUpdate } : item),
  };

  const operate = (operation: WorkspaceOperation) => {
    return enqueueWorkspaceOperation(async () => {
      await onBeforeOperation?.();
      const updated = await workspaceOperation(workspace.id, operation);
      onGraphChange(updated);
      const next = updated.workspaces.find((item) => item.id === workspace.id);
      if (!next) throw new Error("Workspace missing from response");
      return next;
    });
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
    <section className={`workspace-content${workspace.type === null ? " workspace-untyped" : ""}`} data-workspace-id={workspace.id} aria-label={`${workspace.name} contents`}>
      {workspace.type !== null && (
        <div className="workspace-type-toolbar" onDoubleClick={(event) => { event.stopPropagation(); onExpand?.(); }}>
          {definition && <span className="workspace-io-label">{definition.inputs.join(", ") || "—"} → ${definition.outputs.join(", ") || "—"}</span>}
          {!!definition?.inputs.length && <><label className="workspace-auto-update" title="Follow incoming data. Ollama Run, recording and playback remain manual."><input type="checkbox" aria-label="Auto-update connected inputs" checked={autoUpdate} onChange={(event) => {
            const enabled = event.target.checked;
            setInputSnapshot(graph);
            void operate({ kind: "autoUpdate", enabled }).catch((reason) => setError((reason as Error).message));
          }} />Auto-update</label>{!autoUpdate && <button type="button" onClick={() => setInputSnapshot(graph)}>Refresh inputs</button>}</>}
          {onExpand && <button type="button" aria-label="Open workspace fullscreen" title="Open workspace fullscreen" onClick={onExpand}>⛶</button>}
        </div>
      )}
      <div className="workspace-typed-content">
      {workspace.type == null ? (
        <BlankWorkspace onFilesDrop={importFiles} />
      ) : definition ? (
        <definition.component workspace={{ ...workspace, autoUpdate }} graph={inputGraph} onFilesDrop={importFiles} onOperation={operate} />
      ) : (
        <p>Unsupported workspace type: {workspace.type}</p>
      )}
      </div>
      {uploading && <div className="workspace-status" role="status">Importing files…</div>}
      {error && <div className="workspace-status workspace-status-error" role="alert">{error}</div>}
    </section>
  );
}
