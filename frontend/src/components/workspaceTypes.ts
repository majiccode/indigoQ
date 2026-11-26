import FileWorkspace from "./FileWorkspace";
import TextEditorWorkspace from "./TextEditorWorkspace";
import { registerWorkspaceType } from "@/lib/workspaceRegistry";

registerWorkspaceType({
  type: "content-source", name: "FileWorkspace", description: "Collect, preview, and share files.",
  inputs: ["files"], outputs: ["files"], component: FileWorkspace,
});

registerWorkspaceType({
  type: "text-editor", name: "TextEditor", description: "A living text editor with inline controls and visualizations.",
  inputs: ["files"], outputs: ["text", "files"], component: TextEditorWorkspace,
});
