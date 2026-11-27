"use client";

import { useState } from "react";

import FileViewer from "./FileViewer";
import FileDropArea from "./FileDropArea";
import type { ContentEntry, Workspace } from "@/lib/types";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";

function mimeColor(mimeType: string): string {
  let hash = 0;
  for (let index = 0; index < mimeType.length; index += 1) {
    hash = (hash << 5) - hash + mimeType.charCodeAt(index);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsla(${hue}, 70%, 55%, 0.9)`;
}

function mimeIcon(mimeType: string): React.ReactNode {
  const lower = mimeType.toLowerCase();
  if (lower.startsWith("image/")) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          d="M5 5h14v14H5zM9 17l3-3 3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (lower.startsWith("audio/")) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          d="M5 3v18l12-6V3zM9 10l3 3-3 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (lower.includes("pdf")) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M14 8v6h6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (lower.includes("video")) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path
          d="M15 5l6 4v11l-6 4V5zM9 17l6-4 6 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M14 8v6h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileCard({
  entry,
  onDoubleClick,
  onRemove,
  removing,
}: {
  entry: ContentEntry;
  onDoubleClick: (entry: ContentEntry) => void;
  onRemove: () => void;
  removing: boolean;
}) {
  const color = mimeColor(entry.mimeType);

  return (
    <div className="fs-file-item">
    <button
      type="button"
      className="fs-file-card"
      title={`${entry.name} · ${entry.mimeType} · ${formatSize(entry.size)}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onDoubleClick(entry);
      }}
      onKeyDown={(event) => { if (event.key === "Enter") onDoubleClick(entry); }}
      aria-label={`Open ${entry.name}`}
    >
      <div className="fs-file-icon">
        <span style={{ color }}>
          {mimeIcon(entry.mimeType)}
        </span>
      </div>
      <div className="fs-file-name" title={entry.name}>
        {entry.name}
      </div>
      <div className="fs-file-size">{formatSize(entry.size)}</div>
      <div className="fs-file-kind">{entry.mimeType.split("/").pop()?.toUpperCase()}</div>
    </button>
    <button type="button" className="fs-file-remove" aria-label={`Remove ${entry.name}`} title={`Remove ${entry.name}`} disabled={removing}
      onDoubleClick={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onRemove(); }}>
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 4.5h10M6 4.5V2.5h4v2M4.5 4.5l.5 9h6l.5-9M6.5 7v4M9.5 7v4" /></svg>
    </button>
    </div>
  );
}

interface FileWorkspaceProps {
  workspace: Workspace;
  onFilesDrop: (files: File[]) => void;
  onOperation: TypedWorkspaceProps["onOperation"];
}

export default function FileWorkspace({
  workspace,
  onFilesDrop,
  onOperation,
}: FileWorkspaceProps) {
  const [viewing, setViewing] = useState<ContentEntry | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const remove = async (entry: ContentEntry) => {
    setRemoving(true); setError("");
    try { await onOperation({ kind: "removeFile", fileId: entry.id }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to remove file"); }
    finally { setRemoving(false); }
  };

  return (
    <FileDropArea onFilesDrop={onFilesDrop}>
      {error && <div role="alert" className="tool-error">{error}</div>}
      {viewing ? <FileViewer entry={viewing} onClose={() => setViewing(null)} /> : (
      <div className="fs-workspace-body">
        <div className="fs-files-toolbar">
          <span>{workspace.contents.length} file{workspace.contents.length === 1 ? "" : "s"} · {formatSize(workspace.contents.reduce((total, file) => total + file.size, 0))}</span>
          <div role="group" aria-label="File view">
            <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>Grid</button>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>List</button>
          </div>
        </div>
        {workspace.contents.length === 0 ? (
          <div className="fs-empty">
            <div className="fs-empty-icon" aria-hidden>
              <svg viewBox="0 0 24 24" width="32" height="32">
                <path
                  d="M10 20v-6l4-4 4 4v6M3 17v-6l4-4 4 4v6M16 3v16l-4-4z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="fs-empty-title">No files yet</span>
            <span className="fs-empty-hint">Drag files onto this workspace to add them.</span>
          </div>
        ) : (
          <div className={view === "grid" ? "fs-grid" : "fs-list"} aria-label={`${view === "grid" ? "Grid" : "List"} of files`}>
            {view === "list" && <div className="fs-list-head" aria-hidden><span>Name</span><span>Type</span><span>Size</span></div>}
            {workspace.contents.map((entry) => (
              <FileCard
                key={entry.id}
                entry={entry}
                onDoubleClick={setViewing}
                onRemove={() => void remove(entry)}
                removing={removing}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </FileDropArea>
  );
}
