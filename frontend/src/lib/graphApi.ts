import { normalizeGraph } from "./graph";
import type { EditorDocument, Graph, GraphSnapshot } from "./types";

const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 4000;

async function request(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${API_BASE}${path}`, {
      ...init,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function fetchGraph(): Promise<GraphSnapshot> {
  const response = await request("/api/graph");
  if (!response.ok) {
    throw new Error(`Graph request failed with ${response.status}`);
  }

  const payload: unknown = await response.json();
  const graph = normalizeGraph(payload);
  if (!graph) {
    throw new Error("Graph response was not valid");
  }

  const updatedAt =
    typeof payload === "object" &&
    payload !== null &&
    "updatedAt" in payload &&
    typeof (payload as { updatedAt?: unknown }).updatedAt === "string"
      ? (payload as { updatedAt: string }).updatedAt
      : null;

  return { ...graph, updatedAt };
}

export async function saveGraph(graph: Graph): Promise<GraphSnapshot> {
  const response = await request("/api/graph", {
    method: "PUT",
    body: JSON.stringify(graph),
  });
  if (!response.ok) {
    throw new Error(`Graph save failed with ${response.status}`);
  }

  const payload: unknown = await response.json();
  const normalized = normalizeGraph(payload);
  if (!normalized) {
    throw new Error("Saved graph response was not valid");
  }

  return { ...normalized, updatedAt: null };
}

export async function clearGraph(): Promise<void> {
  const response = await request("/api/graph", { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Graph reset failed with ${response.status}`);
  }
}

export async function uploadContents(
  workspaceId: string,
  files: FileList | File[],
): Promise<GraphSnapshot> {
  const formData = new FormData();
  for (const file of Array.from(files)) {
    formData.append("files", file);
  }
  const response = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/contents`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : `Upload failed (${response.status})`);
  }
  const payload: unknown = await response.json();
  const graph = normalizeGraph(payload);
  if (!graph) {
    throw new Error("Upload response was not valid");
  }
  const updatedAt =
    typeof payload === "object" &&
    payload !== null &&
    "updatedAt" in payload &&
    typeof (payload as { updatedAt?: unknown }).updatedAt === "string"
      ? (payload as { updatedAt: string }).updatedAt
      : null;
  return { ...graph, updatedAt };
}

export type WorkspaceOperation =
  | { kind: "type"; type: string }
  | { kind: "draft"; document: EditorDocument }
  | { kind: "open"; workspaceId: string; fileId: string }
  | { kind: "save"; workspaceId: string; fileId?: string; name: string; text: string };

export async function workspaceOperation(id: string, operation: WorkspaceOperation): Promise<Graph> {
  let path: string;
  let method = "POST";
  let body: unknown;
  switch (operation.kind) {
    case "type": path = "type"; body = { type: operation.type }; break;
    case "draft": path = "editor"; method = "PUT"; body = operation.document; break;
    case "open": path = "editor/open"; body = { workspaceId: operation.workspaceId, fileId: operation.fileId }; break;
    case "save": path = "editor/save"; body = { workspaceId: operation.workspaceId, fileId: operation.fileId, name: operation.name, text: operation.text }; break;
  }
  const response = await request(`/api/workspaces/${encodeURIComponent(id)}/${path}`, { method, body: JSON.stringify(body) });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.detail === "string" ? error.detail : `Operation failed (${response.status})`);
  }
  const graph = normalizeGraph(await response.json());
  if (!graph) throw new Error("Invalid workspace response");
  return graph;
}
