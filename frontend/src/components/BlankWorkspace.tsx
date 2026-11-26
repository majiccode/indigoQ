"use client";

import FileDropArea from "./FileDropArea";

export default function BlankWorkspace({ onFilesDrop }: { onFilesDrop: (files: File[]) => void }) {
  return (
    <FileDropArea onFilesDrop={onFilesDrop}>
      <div className="workspace-empty">
        <span>Drop files here</span>
        <small>Create a FileWorkspace by importing content.</small>
      </div>
    </FileDropArea>
  );
}
