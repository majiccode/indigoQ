export type PortSide = "top" | "right" | "bottom" | "left";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Port {
  side: PortSide;
  t: number;
}

export interface ContentEntry {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

export interface Workspace extends Rect {
  id: string;
  name: string;
  type: string | null;
  contents: ContentEntry[];
  editor?: EditorDocument | null;
  tool?: ToolState | null;
}

export interface MathState {
  kind: "math-lab";
  expressions: string;
  sourceId: string;
  parameters: Record<string, { value: number; min: number; max: number }>;
  bounds: [number, number, number, number];
  xColumn: string;
  yColumn: string;
}

export interface TableState {
  kind: "data-table";
  columns: string[];
  rows: string[][];
}

export interface OllamaState {
  kind: "ollama";
  model: string;
  prompt: string;
  system: string;
  temperature: number;
  jsonOutput: boolean;
  output: string;
  context: string;
  sourceIds: string[];
}

export type ToolState = MathState | TableState | OllamaState;

export interface EditorDocument {
  text: string;
  name: string;
  sourceWorkspaceId: string | null;
  sourceFileId: string | null;
}

export interface Wire {
  id: string;
  source: string;
  sourcePort: Port;
  target: string;
  targetPort: Port;
}

export interface Graph {
  workspaces: Workspace[];
  wires: Wire[];
}

export interface GraphSnapshot extends Graph {
  updatedAt: string | null;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}
