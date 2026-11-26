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
}

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
