import type {
  Point,
  Port,
  PortSide,
  Rect,
  Viewport,
  Workspace,
} from "./types";

export const TAU = Math.PI * 2;
export const BASE_GRID = 28;
export const HEADER_HEIGHT = 42;
export const CORNER_RADIUS = 16;
export const MIN_WORKSPACE_WIDTH = 220;
export const MIN_WORKSPACE_HEIGHT = 140;
export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function screenToWorld(viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function worldToScreen(viewport: Viewport, point: Point): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  };
}

export function pointInRect(point: Point, rect: Rect, padding = 0): boolean {
  return (
    point.x >= rect.x - padding &&
    point.x <= rect.x + rect.width + padding &&
    point.y >= rect.y - padding &&
    point.y <= rect.y + rect.height + padding
  );
}

export function pointInHeader(workspace: Workspace, point: Point): boolean {
  return (
    point.x >= workspace.x &&
    point.x <= workspace.x + workspace.width &&
    point.y >= workspace.y &&
    point.y <= workspace.y + HEADER_HEIGHT
  );
}

export function pointInWorkspaceMagnify(workspace: Workspace, point: Point, scale: number): boolean {
  // Match the rightmost 13px icon and its padding in paintWorkspaceHeader.
  return scale > 0.5 && workspace.width > 240 &&
    Math.abs(point.x - (workspace.x + workspace.width - 24.5)) <= 12 &&
    Math.abs(point.y - (workspace.y + HEADER_HEIGHT / 2)) <= 12;
}

export function normalizeRect(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

export function portNormal(side: PortSide): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
}

export function portPoint(workspace: Workspace, port: Port): Point {
  const t = clamp(port.t, 0.04, 0.96);
  switch (port.side) {
    case "top":
      return { x: workspace.x + workspace.width * t, y: workspace.y };
    case "right":
      return { x: workspace.x + workspace.width, y: workspace.y + workspace.height * t };
    case "bottom":
      return { x: workspace.x + workspace.width * t, y: workspace.y + workspace.height };
    case "left":
      return { x: workspace.x, y: workspace.y + workspace.height * t };
  }
}

export interface BorderHit {
  port: Port;
  point: Point;
  distance: number;
}

export function closestBorderPoint(workspace: Workspace, point: Point): BorderHit {
  const rawCandidates: { side: PortSide; t: number }[] = [
    { side: "top", t: (point.x - workspace.x) / workspace.width },
    { side: "right", t: (point.y - workspace.y) / workspace.height },
    { side: "bottom", t: (point.x - workspace.x) / workspace.width },
    { side: "left", t: (point.y - workspace.y) / workspace.height },
  ];

  let best: BorderHit | null = null;
  for (const candidate of rawCandidates) {
    const port: Port = {
      side: candidate.side,
      t: clamp(Number.isFinite(candidate.t) ? candidate.t : 0.5, 0.04, 0.96),
    };
    const borderPoint = portPoint(workspace, port);
    const distance = Math.hypot(borderPoint.x - point.x, borderPoint.y - point.y);
    if (!best || distance < best.distance) {
      best = { port, point: borderPoint, distance };
    }
  }

  return best ?? {
    port: { side: "top", t: 0.5 },
    point: { x: workspace.x + workspace.width / 2, y: workspace.y },
    distance: Number.POSITIVE_INFINITY,
  };
}

export interface Route {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

export function cubicPoint(route: Route, t: number): Point {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * route.p0.x + b * route.c1.x + c * route.c2.x + d * route.p1.x,
    y: a * route.p0.y + b * route.c1.y + c * route.c2.y + d * route.p1.y,
  };
}

export function cubicTangent(route: Route, t: number): Point {
  const mt = 1 - t;
  return {
    x:
      3 * mt * mt * (route.c1.x - route.p0.x) +
      6 * mt * t * (route.c2.x - route.c1.x) +
      3 * t * t * (route.p1.x - route.c2.x),
    y:
      3 * mt * mt * (route.c1.y - route.p0.y) +
      6 * mt * t * (route.c2.y - route.c1.y) +
      3 * t * t * (route.p1.y - route.c2.y),
  };
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sampleRoute(route: Route, segments: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= segments; index += 1) {
    points.push(cubicPoint(route, index / segments));
  }
  return points;
}

function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const first = cross(c, d, a);
  const second = cross(c, d, b);
  const third = cross(a, b, c);
  const fourth = cross(a, b, d);
  return (
    ((first > 0 && second < 0) || (first < 0 && second > 0)) &&
    ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))
  );
}

function polylinesCross(left: Point[], right: Point[]): boolean {
  for (let a = 0; a < left.length - 1; a += 1) {
    for (let b = 0; b < right.length - 1; b += 1) {
      if (segmentsCross(left[a], left[a + 1], right[b], right[b + 1])) {
        return true;
      }
    }
  }
  return false;
}

const BOW_CANDIDATES = [0, 1, -1, 2, -2, 3, -3];

export function computeRoute(
  source: Workspace,
  sourcePort: Port,
  target: Workspace,
  targetPort: Port,
  obstacles: Rect[],
  seed: string,
  existingRoutes: Route[] = [],
): Route {
  const p0 = portPoint(source, sourcePort);
  const p1 = portPoint(target, targetPort);
  const normal0 = portNormal(sourcePort.side);
  const normal1 = portNormal(targetPort.side);

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const distance = Math.hypot(dx, dy) || 1;
  const directionX = dx / distance;
  const directionY = dy / distance;
  const perpendicularX = -directionY;
  const perpendicularY = directionX;

  const reach = clamp(distance * 0.48, 48, 270);
  const bowStep = clamp(distance * 0.34, 64, 220);
  const lane = ((hashString(seed) % 5) - 2) * 7;
  const existingSamples = existingRoutes.map((route) => sampleRoute(route, 14));

  let bestRoute: Route | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of BOW_CANDIDATES) {
    const offset = lane + candidate * bowStep;
    const route: Route = {
      p0,
      c1: {
        x: p0.x + normal0.x * reach + perpendicularX * offset,
        y: p0.y + normal0.y * reach + perpendicularY * offset,
      },
      c2: {
        x: p1.x + normal1.x * reach + perpendicularX * offset,
        y: p1.y + normal1.y * reach + perpendicularY * offset,
      },
      p1,
    };

    const samples = sampleRoute(route, 26);
    let obstacleHits = 0;
    for (const sample of samples) {
      for (const obstacle of obstacles) {
        if (pointInRect(sample, obstacle, 3)) {
          obstacleHits += 1;
          break;
        }
      }
    }

    let crossings = 0;
    for (const other of existingSamples) {
      if (polylinesCross(samples, other)) {
        crossings += 1;
      }
    }

    const score = obstacleHits * 100 + crossings * 14 + Math.abs(offset) * 0.02;
    if (score < bestScore) {
      bestScore = score;
      bestRoute = route;
    }
    if (score === 0) {
      break;
    }
  }

  return bestRoute ?? {
    p0,
    c1: { x: p0.x + normal0.x * reach, y: p0.y + normal0.y * reach },
    c2: { x: p1.x + normal1.x * reach, y: p1.y + normal1.y * reach },
    p1,
  };
}

export function previewRoute(p0: Point, normal: Point, p1: Point): Route {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const distance = Math.hypot(dx, dy) || 1;
  const reach = clamp(distance * 0.45, 24, 180);
  const approach = clamp(distance * 0.2, 12, 90);

  return {
    p0,
    c1: { x: p0.x + normal.x * reach, y: p0.y + normal.y * reach },
    c2: {
      x: p1.x - (dx / distance) * approach,
      y: p1.y - (dy / distance) * approach,
    },
    p1,
  };
}

export const RESIZE_HANDLE_PX = 10;

export type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export function workspaceCornerAt(
  workspace: Workspace,
  point: Point,
  scale: number,
): ResizeCorner | null {
  const handle = RESIZE_HANDLE_PX / scale;
  const candidates: { corner: ResizeCorner; x: number; y: number }[] = [
    { corner: "top-left", x: workspace.x, y: workspace.y },
    { corner: "top-right", x: workspace.x + workspace.width, y: workspace.y },
    { corner: "bottom-left", x: workspace.x, y: workspace.y + workspace.height },
    { corner: "bottom-right", x: workspace.x + workspace.width, y: workspace.y + workspace.height },
  ];

  let best: ResizeCorner | null = null;
  let bestDistance = handle;
  for (const candidate of candidates) {
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate.corner;
    }
  }
  return best;
}

export function collapseButtonRect(workspace: Workspace): { x: number; y: number; width: number; height: number } {
  const size = 22;
  return {
    x: workspace.x + workspace.width - size - 10,
    y: workspace.y + 10,
    width: size,
    height: size,
  };
}

export function gridStep(scale: number): number {
  let step = BASE_GRID;
  while (step * scale < 22) {
    step *= 2;
  }
  while (step * scale > 88) {
    step /= 2;
  }
  return step;
}

export const FILE_ICON_SIZE = 24;
export const FILE_ICON_GAP = 8;
export const FILE_NAME_HEIGHT = 14;
export const FILE_ROW_HEIGHT = FILE_ICON_SIZE + FILE_NAME_HEIGHT + FILE_ICON_GAP;
export const FILE_PADDING = 16;

export interface FileIconRect {
  entryId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  nameRect: { x: number; y: number; width: number; height: number };
}

export function computeFileIconRects(
  workspace: Workspace,
): FileIconRect[] {
  const rects: FileIconRect[] = [];
  const size = FILE_ICON_SIZE;
  const gap = FILE_ICON_GAP;
  const startX = workspace.x + FILE_PADDING;
  const startY = workspace.y + HEADER_HEIGHT + FILE_PADDING;
  const maxX = workspace.x + workspace.width - FILE_PADDING - size;

  let cx = startX;
  let cy = startY;

  for (const entry of workspace.contents) {
    if (cx + size > maxX && cx > startX) {
      cx = startX;
      cy += FILE_ROW_HEIGHT;
    }
    rects.push({
      entryId: entry.id,
      x: cx,
      y: cy,
      width: size,
      height: size,
      nameRect: {
        x: cx - FILE_ICON_GAP,
        y: cy + size,
        width: size + FILE_ICON_GAP * 2,
        height: FILE_NAME_HEIGHT,
      },
    });
    cx += size + gap;
  }
  return rects;
}
