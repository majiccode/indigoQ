"use client";

import { useEffect, useState } from "react";
import Workspace from "./Workspace";
import { writeLocalGraph } from "@/lib/localGraph";
import { fetchGraph } from "@/lib/graphApi";
import type { Graph, Workspace as WorkspaceModel } from "@/lib/types";

export default function FullscreenWorkspaceView({ initialWorkspace, initialGraph }: { initialWorkspace: WorkspaceModel; initialGraph: Graph }) {
  const [graph, setGraph] = useState(initialGraph);
  const workspace = graph.workspaces.find((item) => item.id === initialWorkspace.id) ?? initialWorkspace;
  const updateGraph = (next: Graph) => { setGraph(next); writeLocalGraph(next); };
  useEffect(() => {
    let active = true;
    const timer = window.setInterval(() => {
      void fetchGraph().then((next) => { if (active) setGraph(next); }).catch(() => {});
    }, 2000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return (
    <main className="workspace-fullscreen">
      <Workspace workspace={workspace} graph={graph} onGraphChange={updateGraph} onWorkspaceChange={(next) => {
        updateGraph({ ...graph, workspaces: graph.workspaces.map((item) => item.id === next.id ? next : item) });
      }} />
    </main>
  );
}
