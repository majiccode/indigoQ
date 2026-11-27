import type { Point, Port, Viewport } from "./types";
import type { ResizeCorner } from "./geometry";

export interface WireTarget {
  workspaceId: string;
  port: Port;
  point: Point;
}

export type InteractionMode =
  | { kind: "idle" }
  | { kind: "pan"; startScreen: Point; startViewport: Viewport }
  | { kind: "create"; start: Point; current: Point }
  | { kind: "zoom-rect"; start: Point; current: Point }
  | {
      kind: "move";
      id: string;
      offset: Point;
      origin: Point;
    }
  | {
      kind: "wire";
      sourceId: string;
      sourcePort: Port;
      current: Point;
      target: WireTarget | null;
    }
  | {
      kind: "resize";
      id: string;
      corner: ResizeCorner;
      origin: { x: number; y: number; width: number; height: number };
      start: Point;
    };

export interface HoverPort {
  workspaceId: string;
  port: Port;
  point: Point;
}

export interface HoverState {
  workspaceId: string | null;
  port: HoverPort | null;
  resize?: { workspaceId: string; corner: ResizeCorner };
}
