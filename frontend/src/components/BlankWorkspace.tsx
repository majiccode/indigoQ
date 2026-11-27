"use client";

import FileDropArea from "./FileDropArea";

export default function BlankWorkspace({ onFilesDrop }: { onFilesDrop: (files: File[]) => void }) {
  return (
    <FileDropArea onFilesDrop={onFilesDrop} />
  );
}
