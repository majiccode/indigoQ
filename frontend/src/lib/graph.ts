import type {
  ContentEntry,
  Graph,
  Port,
  PortSide,
  Wire,
  Workspace,
} from "./types";

const PORT_SIDES: readonly PortSide[] = ["top", "right", "bottom", "left"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPort(value: unknown): value is Port {
  if (!isRecord(value)) return false;
  return (
    typeof value.side === "string" &&
    (PORT_SIDES as readonly string[]).includes(value.side) &&
    isFiniteNumber(value.t)
  );
}

function isContentEntry(value: unknown): value is ContentEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    typeof value.mimeType === "string" &&
    isFiniteNumber(value.size) &&
    typeof value.dataUrl === "string"
  );
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    isFiniteNumber(value.height)
  );
}

function isWire(value: unknown): value is Wire {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.source === "string" &&
    typeof value.target === "string" &&
    isPort(value.sourcePort) &&
    isPort(value.targetPort)
  );
}

export function normalizeGraph(value: unknown): Graph | null {
  if (!isRecord(value)) return null;
  if (!Array.isArray(value.workspaces) || !Array.isArray(value.wires)) return null;

  const workspaces: Workspace[] = [];
  const workspaceIds = new Set<string>();
  for (const raw of value.workspaces) {
    if (!isWorkspace(raw) || workspaceIds.has(raw.id)) continue;
    workspaceIds.add(raw.id);
    const rawContents = Array.isArray(raw.contents)
      ? raw.contents.filter(isContentEntry)
      : [];
    workspaces.push({
      id: raw.id,
      name: raw.name.trim().slice(0, 80) || "Untitled workspace",
      x: raw.x,
      y: raw.y,
      width: Math.max(120, raw.width),
      height: Math.max(80, raw.height),
      type: typeof raw.type === "string" ? raw.type : null,
      contents: rawContents,
      editor: raw.editor && typeof raw.editor.text === "string" && typeof raw.editor.name === "string"
        ? { text: raw.editor.text, name: raw.editor.name,
            sourceWorkspaceId: raw.editor.sourceWorkspaceId ?? null,
            sourceFileId: raw.editor.sourceFileId ?? null } : null,
    });
  }

  const wires: Wire[] = [];
  const wireIds = new Set<string>();
  for (const raw of value.wires) {
    if (!isWire(raw) || wireIds.has(raw.id)) continue;
    if (raw.source === raw.target) continue;
    if (!workspaceIds.has(raw.source) || !workspaceIds.has(raw.target)) continue;
    wireIds.add(raw.id);
    wires.push({
      id: raw.id,
      source: raw.source,
      sourcePort: {
        side: raw.sourcePort.side,
        t: Math.min(1, Math.max(0, raw.sourcePort.t)),
      },
      target: raw.target,
      targetPort: {
        side: raw.targetPort.side,
        t: Math.min(1, Math.max(0, raw.targetPort.t)),
      },
    });
  }

  return { workspaces, wires };
}

export function createSampleGraph(): Graph {
  return {
    workspaces: [
      { id: "ws-ingest", name: "Ingest", x: -620, y: -180, width: 300, height: 200, type: null, contents: [] },
      { id: "ws-enrich", name: "Enrich", x: -160, y: 40, width: 320, height: 210, type: null, contents: [] },
      { id: "ws-publish", name: "Publish", x: 340, y: -200, width: 300, height: 200, type: null, contents: [] },
    ],
    wires: [
      {
        id: "wire-ingest-enrich",
        source: "ws-ingest",
        sourcePort: { side: "right", t: 0.55 },
        target: "ws-enrich",
        targetPort: { side: "left", t: 0.4 },
      },
      {
        id: "wire-enrich-publish",
        source: "ws-enrich",
        sourcePort: { side: "right", t: 0.5 },
        target: "ws-publish",
        targetPort: { side: "left", t: 0.55 },
      },
    ],
  };
}
