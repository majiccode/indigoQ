import FileWorkspace from "./FileWorkspace";
import TextEditorWorkspace from "./TextEditorWorkspace";
import MathLabWorkspace from "./MathLabWorkspace";
import DataTableWorkspace from "./DataTableWorkspace";
import OllamaWorkspace from "./OllamaWorkspace";
import ControlsWorkspace from "./ControlsWorkspace";
import SimulationWorkspace from "./SimulationWorkspace";
import TimelineWorkspace from "./TimelineWorkspace";
import PlaygroundWorkspace from "./PlaygroundWorkspace";
import AudioWorkspace from "./AudioWorkspace";
import HttpWorkspace from "./HttpWorkspace";
import TransformWorkspace from "./TransformWorkspace";
import SqlWorkspace from "./SqlWorkspace";
import DocumentWorkspace from "./DocumentWorkspace";
import DiffWorkspace from "./DiffWorkspace";
import ImageWorkspace from "./ImageWorkspace";
import ModelBenchWorkspace from "./ModelBenchWorkspace";
import KnowledgeWorkspace from "./KnowledgeWorkspace";
import DashboardWorkspace from "./DashboardWorkspace";
import { STUDIO_NAMES } from "@/lib/studio";
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
  inputs: ["text", "table", "controls"], outputs: ["text", "table"], component: MathLabWorkspace,
});

registerWorkspaceType({ type: "controls", name: STUDIO_NAMES.controls, description: "Named sliders, toggles, colors, choices, and triggers.", inputs: ["controls"], outputs: ["controls", "text"], component: ControlsWorkspace });
registerWorkspaceType({ type: "simulation", name: STUDIO_NAMES.simulation, description: "Animate springs, pendulums, orbits, populations, and epidemics.", inputs: ["controls"], outputs: ["table", "text"], component: SimulationWorkspace });
registerWorkspaceType({ type: "timeline", name: STUDIO_NAMES.timeline, description: "Animate parameters and record incoming knob movements.", inputs: ["controls"], outputs: ["controls", "table", "text"], component: TimelineWorkspace });
registerWorkspaceType({ type: "playground", name: STUDIO_NAMES.playground, description: "Sandboxed HTML/CSS/JS apps with live connected data.", inputs: ["text", "table", "controls"], outputs: ["text", "table"], component: PlaygroundWorkspace });
registerWorkspaceType({ type: "audio-lab", name: STUDIO_NAMES["audio-lab"], description: "Synthesis, filters, oscilloscope, spectrum, and recording.", inputs: ["files", "text", "controls"], outputs: ["files"], component: AudioWorkspace });
registerWorkspaceType({ type: "http-client", name: STUDIO_NAMES["http-client"], description: "Make HTTP requests and publish responses to the graph.", inputs: [], outputs: ["text", "table"], component: HttpWorkspace });
registerWorkspaceType({ type: "transform", name: STUDIO_NAMES.transform, description: "JSON paths, filtering, templates, and regex extraction.", inputs: ["text", "table"], outputs: ["text", "table"], component: TransformWorkspace });
registerWorkspaceType({ type: "sql", name: STUDIO_NAMES.sql, description: "Join and aggregate connected tables using read-only SQL.", inputs: ["table"], outputs: ["text", "table"], component: SqlWorkspace });
registerWorkspaceType({ type: "document-preview", name: STUDIO_NAMES["document-preview"], description: "Render Markdown, tables, code, and mathematical notation.", inputs: ["text"], outputs: ["text"], component: DocumentWorkspace });
registerWorkspaceType({ type: "diff", name: STUDIO_NAMES.diff, description: "Compare local text, connected text, or files side by side.", inputs: ["text", "files"], outputs: ["text"], component: DiffWorkspace });
registerWorkspaceType({ type: "image-studio", name: STUDIO_NAMES["image-studio"], description: "Crop, resize, adjust, annotate, and publish images.", inputs: ["files"], outputs: ["files", "text"], component: ImageWorkspace });
registerWorkspaceType({ type: "model-bench", name: STUDIO_NAMES["model-bench"], description: "Compare local models and temperatures, then rate results.", inputs: ["text", "table"], outputs: ["text", "table"], component: ModelBenchWorkspace });
registerWorkspaceType({ type: "knowledge", name: STUDIO_NAMES.knowledge, description: "Retrieve relevant document passages with source references.", inputs: ["files", "text"], outputs: ["text"], component: KnowledgeWorkspace });
registerWorkspaceType({ type: "dashboard", name: STUDIO_NAMES.dashboard, description: "Compose connected charts, tables, documents, and media.", inputs: ["text", "table", "files", "controls"], outputs: [], component: DashboardWorkspace });

registerWorkspaceType({
  type: "data-table", name: "Data Table", description: "Explore, edit, and transform CSV and JSON data.",
  inputs: ["files", "text", "table"], outputs: ["text", "table"], component: DataTableWorkspace,
});

registerWorkspaceType({
  type: "ollama", name: "Ollama", description: "Local AI with connected context and streaming output.",
  inputs: ["files", "text", "table"], outputs: ["text"], component: OllamaWorkspace,
});
