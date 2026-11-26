"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject, type PointerEventHandler, type DragEventHandler } from "react";
import { HEADER_HEIGHT, worldToScreen } from "@/lib/geometry";
import type { Graph, Viewport, Workspace } from "@/lib/types";

// Below this scale, render the same live React tree as a read-only preview.
const INTERACTION_SCALE = 0.35;

export default function GraphWorkspace({ workspace, graphRef, viewportRef, onOpen, onPointerDown, onDrop, children }: {
  workspace: Workspace;
  graphRef: RefObject<Graph>;
  viewportRef: RefObject<Viewport>;
  onOpen: () => void;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interactive, setInteractive] = useState(true);

  useEffect(() => {
    let frame = 0;
    let previousInteractive = true;
    const update = () => {
      const container = containerRef.current;
      const current = graphRef.current.workspaces.find((item) => item.id === workspace.id);
      const viewport = viewportRef.current;
      if (container && current) {
        const screen = worldToScreen(viewport, { x: current.x, y: current.y + HEADER_HEIGHT });
        container.style.transform = `translate(${screen.x}px, ${screen.y}px) scale(${viewport.scale})`;
        container.style.width = `${current.width}px`;
        container.style.height = `${Math.max(0, current.height - HEADER_HEIGHT)}px`;
        const nextInteractive = viewport.scale >= INTERACTION_SCALE;
        if (nextInteractive !== previousInteractive) {
          previousInteractive = nextInteractive;
          setInteractive(nextInteractive);
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [workspace.id, graphRef, viewportRef]);

  return (
    <div ref={containerRef} className="graph-workspace-content" data-workspace-id={workspace.id}
      data-detail={interactive ? "interactive" : "preview"}
      style={{ width: workspace.width, height: workspace.height - HEADER_HEIGHT }}
      onPointerDown={onPointerDown} onDoubleClick={onOpen}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={onDrop}>
      <div className="workspace-live-surface" inert={!interactive}>{children}</div>
      {!interactive && (
        <button type="button" className="workspace-preview-cover" aria-label={`Open ${workspace.name}`}
          onDoubleClick={(event) => { event.stopPropagation(); onOpen(); }}
          onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }} />
      )}
    </div>
  );
}
