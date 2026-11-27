"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import FullscreenWorkspaceView from "@/components/FullscreenWorkspaceView";
import Link from "next/link";

import type { Graph, Workspace } from "@/lib/types";
import { fetchGraph } from "@/lib/graphApi";

export default function WorkspacePage() {
  return <Suspense fallback={<div className="app-shell">Loading workspace…</div>}><WorkspacePageContent /></Suspense>;
}

function WorkspacePageContent() {
  const workspaceId = useSearchParams().get("id") ?? "";
  const [snapshot, setSnapshot] = useState<{ id: string; graph: Graph } | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const graph = snapshot?.id === workspaceId ? snapshot.graph : { workspaces: [], wires: [] };
  const workspace: Workspace | null = graph.workspaces.find((item) => item.id === workspaceId) ?? null;
  const loading = Boolean(workspaceId) && snapshot?.id !== workspaceId && failedId !== workspaceId;

  useEffect(() => {
    let active = true;
    if (workspaceId) {
      void fetchGraph().then((next) => {
        if (active) setSnapshot({ id: workspaceId, graph: next });
      }).catch(() => {
        if (active) setFailedId(workspaceId);
      });
    }
    return () => { active = false; };
  }, [workspaceId]);

  return (
    <div className="app-shell">
      <header className="ws-topbar">
        <Link href="/" className="ws-back" aria-label="Back to canvas" title="Back to canvas">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path
              d="m10 5-7 7 7 7M3 12h18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="ws-title">{workspace?.name ?? workspaceId}</div>
        <div className="ws-toolbar">
          <Link href="/" className="ws-toolbar-button" aria-label="Return to canvas" title="Return to canvas">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden>
              <circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10 10l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </header>

      {workspace ? (
        <FullscreenWorkspaceView
          key={workspace.id}
          initialWorkspace={workspace}
          initialGraph={graph}
        />
      ) : (
        <div className="fs-main">
          <div className="fs-card">
            <div className="fs-card-header">
              <span className="fs-card-name">{loading ? "Loading workspace…" : failedId === workspaceId ? "Could not load workspace. Check the API connection and reload." : "Workspace not found"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
