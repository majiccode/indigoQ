"use client";

import { useState } from "react";

import FileViewer from "./FileViewer";
import FileDropArea from "./FileDropArea";
import type { ContentEntry, Workspace } from "@/lib/types";

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
}: {
  entry: ContentEntry;
  onDoubleClick: (entry: ContentEntry) => void;
}) {
  const color = mimeColor(entry.mimeType);

  return (
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
  );
}

interface FileWorkspaceProps {
  workspace: Workspace;
  onFilesDrop: (files: File[]) => void;
}

export default function FileWorkspace({
  workspace,
  onFilesDrop,
}: FileWorkspaceProps) {
  const [viewing, setViewing] = useState<ContentEntry | null>(null);

  return (
    <FileDropArea onFilesDrop={onFilesDrop}>
      {viewing ? <FileViewer entry={viewing} onClose={() => setViewing(null)} /> : (
      <div className="fs-workspace-body">
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
          <div className="fs-grid">
            {workspace.contents.map((entry) => (
              <FileCard
                key={entry.id}
                entry={entry}
                onDoubleClick={setViewing}
              />
            ))}
          </div>
        )}
      </div>
      )}
    </FileDropArea>
  );
}
