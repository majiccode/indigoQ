"use client";

import { useState } from "react";
import Workspace from "./Workspace";
import { readLocalGraph, writeLocalGraph } from "@/lib/localGraph";
import type { Workspace as WorkspaceModel } from "@/lib/types";

export default function FullscreenWorkspaceView({ initialWorkspace }: { initialWorkspace: WorkspaceModel }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  return (
    <main className="workspace-fullscreen">
      <Workspace workspace={workspace} onWorkspaceChange={(next) => {
        setWorkspace(next);
        const graph = readLocalGraph();
        if (graph) writeLocalGraph({ ...graph, workspaces: graph.workspaces.map((item) => item.id === next.id ? next : item) });
      }} />
    </main>
  );
}
