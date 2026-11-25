import { normalizeGraph } from "./graph";
import type { Graph, Viewport } from "./types";

const GRAPH_KEY = "indigoq.graph.v1";
const CLEARED_KEY = "indigoq.cleared.v1";
const VIEWPORT_KEY = "indigoq.viewport.v1";

export function readLocalGraph(): Graph | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GRAPH_KEY);
    if (!raw) return null;
    return normalizeGraph(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeLocalGraph(graph: Graph): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GRAPH_KEY, JSON.stringify(graph));
  } catch {
    // Storage can be unavailable (private mode, quota); the canvas still works.
  }
}

export function readCleared(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(CLEARED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCleared(cleared: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (cleared) {
      window.localStorage.setItem(CLEARED_KEY, "1");
    } else {
      window.localStorage.removeItem(CLEARED_KEY);
    }
  } catch {
    // Ignore storage failures.
  }
}

export function readLocalViewport(): Viewport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { x?: unknown }).x === "number" &&
      typeof (parsed as { y?: unknown }).y === "number" &&
      typeof (parsed as { scale?: unknown }).scale === "number"
    ) {
      return parsed as Viewport;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeLocalViewport(viewport: Viewport): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
  } catch {
    // Storage can be unavailable (private mode, quota); the canvas still works.
  }
}
