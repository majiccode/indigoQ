"use client";

import { useState } from "react";

import BlankWorkspace from "./BlankWorkspace";
import FileWorkspace from "./FileWorkspace";
import { uploadContents } from "@/lib/graphApi";
import type { Workspace as WorkspaceModel } from "@/lib/types";

interface WorkspaceProps {
  workspace: WorkspaceModel;
  onWorkspaceChange: (workspace: WorkspaceModel) => void;
  onUpload?: (id: string, files: File[]) => Promise<WorkspaceModel>;
}

export default function Workspace({ workspace, onWorkspaceChange, onUpload }: WorkspaceProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      {workspace.type == null ? (
        <BlankWorkspace onFilesDrop={importFiles} />
      ) : workspace.type === "content-source" || workspace.type === "FileWorkspace" ? (
        <FileWorkspace workspace={workspace} onFilesDrop={importFiles} />
      ) : (
        <p>Unsupported workspace type: {workspace.type}</p>
      )}
      {uploading && <div className="workspace-status" role="status">Importing files…</div>}
      {error && <div className="workspace-status workspace-status-error" role="alert">{error}</div>}
    </section>
  );
}
