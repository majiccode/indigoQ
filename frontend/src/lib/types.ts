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

export interface Workspace extends Rect {
  id: string;
  name: string;
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
