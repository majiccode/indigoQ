"use client";

import { useState, type ReactNode } from "react";

export default function FileDropArea({ children, onFilesDrop }: {
  children?: ReactNode;
  onFilesDrop: (files: File[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={`workspace-drop-area${dragging ? " is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        onFilesDrop(Array.from(event.dataTransfer.files));
      }}
    >
      {children}
      {dragging && <div className="workspace-drop-indicator">Release to import files</div>}
    </div>
  );
}
