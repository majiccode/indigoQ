import FileWorkspace from "./FileWorkspace";
import TextEditorWorkspace from "./TextEditorWorkspace";
import MathLabWorkspace from "./MathLabWorkspace";
import DataTableWorkspace from "./DataTableWorkspace";
import OllamaWorkspace from "./OllamaWorkspace";
import { registerWorkspaceType } from "@/lib/workspaceRegistry";

registerWorkspaceType({
  type: "content-source", name: "FileWorkspace", description: "Collect, preview, and share files.",
  inputs: ["files"], outputs: ["files"], component: FileWorkspace,
});

registerWorkspaceType({
  type: "text-editor", name: "TextEditor", description: "A living text editor with inline controls and visualizations.",
  inputs: ["files", "text"], outputs: ["text", "files"], component: TextEditorWorkspace,
});

registerWorkspaceType({
  type: "math-lab", name: "Math Lab", description: "Live equations, parameter knobs, and connected data plots.",
  inputs: ["text", "table"], outputs: ["text", "table"], component: MathLabWorkspace,
});

registerWorkspaceType({
  type: "data-table", name: "Data Table", description: "Explore, edit, and transform CSV and JSON data.",
  inputs: ["files", "text", "table"], outputs: ["text", "table"], component: DataTableWorkspace,
});

registerWorkspaceType({
  type: "ollama", name: "Ollama", description: "Local AI with connected context and streaming output.",
  inputs: ["files", "text", "table"], outputs: ["text"], component: OllamaWorkspace,
});
