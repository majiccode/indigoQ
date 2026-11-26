import type { Graph, StudioKind, StudioState, Workspace } from "./types";

export const STUDIO_NAMES: Record<StudioKind, string> = {
  controls: "Shared Controls", simulation: "Simulation Lab", playground: "HTML Playground",
  "audio-lab": "Audio / Signal Lab", "http-client": "HTTP / API Client", transform: "Transform",
  "document-preview": "Document Preview", diff: "Diff / Compare", "image-studio": "Image Studio",
  sql: "SQL Explorer", "model-bench": "Model Bench", knowledge: "Knowledge Library",
  timeline: "Timeline / Sequencer", dashboard: "Dashboard", "chart-studio": "Chart Studio",
};
export const CONTROL_EXAMPLE = JSON.stringify([
  { name: "amplitude", type: "number", value: 2, min: 0, max: 5, step: 0.01 },
  { name: "frequency", type: "number", value: 1.5, min: 0.1, max: 5, step: 0.01 },
  { name: "damping", type: "number", value: 0.15, min: 0, max: 2, step: 0.01 },
  { name: "color", type: "color", value: "#c8a4ff" },
  { name: "enabled", type: "toggle", value: true },
  { name: "reset", type: "button", value: 0 },
], null, 2);
export const PLAYGROUND_EXAMPLE = `<!doctype html><html><head><style>body{background:#131b20;color:#ddd;font:16px system-ui;padding:20px}canvas{width:100%;background:#1b2731;border-radius:12px}</style></head><body><h2>Connected spring</h2><canvas width="600" height="250"></canvas><p id="values">Wire Shared Controls → here.</p><script>
let controls={amplitude:2,frequency:1.5,color:'#c8a4ff'},start=performance.now();
window.addEventListener('indigoq:input',e=>{controls={...controls,...e.detail.controls};document.querySelector('#values').textContent=JSON.stringify(controls)});
function frame(t){let x=300+Math.sin((t-start)/1000*controls.frequency)*controls.amplitude*60;let c=document.querySelector('canvas').getContext('2d');c.clearRect(0,0,600,250);c.strokeStyle=controls.color;c.beginPath();c.moveTo(20,125);for(let i=0;i<30;i++)c.lineTo(20+(x-20)*i/30,125+(i%2?12:-12));c.lineTo(x,125);c.stroke();c.fillStyle=controls.color;c.beginPath();c.arc(x,125,24,0,Math.PI*2);c.fill();requestAnimationFrame(frame)}requestAnimationFrame(frame);
// Publish explicit results with indigoQ.publish({text:'hello', table:{columns:['x'],rows:[['1']]}}).
</script></body></html>`;

export function studioDefault(kind: StudioKind): StudioState {
  const text: Partial<Record<StudioKind, string>> = {
    controls: CONTROL_EXAMPLE, playground: PLAYGROUND_EXAMPLE,
    timeline: '[{"name":"amplitude","from":0,"to":4},{"name":"frequency","from":0.5,"to":3}]',
    transform: '{"name":"{{name}}","value":"{{value}}"}',
    "document-preview": "# A connected document\n\nEdit Markdown here, or choose a connected source.\n\nInline math: $E=mc^2$\n\n$$y = A \\sin(\\omega x)$$\n\n| Feature | Ready |\n|---|---|\n| Tables | ✓ |\n| Equations | ✓ |\n",
    sql: "SELECT * FROM input1 LIMIT 100",
  };
  return { kind, settings: {}, text: text[kind] ?? "", output: "", table: null, files: [] };
}

export function incoming(graph: Graph, id: string): Workspace[] {
  const ids = new Set(graph.wires.filter((wire) => wire.target === id).map((wire) => wire.source));
  return graph.workspaces.filter((workspace) => ids.has(workspace.id));
}

export type ControlValue = string | number | boolean;
export interface Control { name: string; type: "number" | "toggle" | "select" | "color" | "text" | "button"; value: ControlValue; min?: number; max?: number; step?: number; options?: string[] }
export function parseControls(text: string): Control[] {
  const items = JSON.parse(text);
  if (!Array.isArray(items) || items.length > 100) throw new Error("Use an array of up to 100 controls");
  const names = new Set<string>();
  for (const item of items) {
    if (!item || !/^[a-zA-Z_]\w*$/.test(item.name) || names.has(item.name)) throw new Error("Control names must be unique identifiers");
    names.add(item.name);
    if (!["number", "toggle", "select", "color", "text", "button"].includes(item.type)) throw new Error("Unknown control type");
    if (!["number", "string", "boolean"].includes(typeof item.value)) throw new Error("Invalid control value");
    if (item.type === "number" && (typeof item.value !== "number" || !Number.isFinite(item.value) || !Number.isFinite(item.min) || !Number.isFinite(item.max) || item.min >= item.max || (item.step !== undefined && (!Number.isFinite(item.step) || item.step <= 0)))) throw new Error("Numeric controls need finite min < max and a positive step");
    if (item.type === "select" && (!Array.isArray(item.options) || !item.options.every((value: unknown) => typeof value === "string"))) throw new Error("Select controls need string options");
  }
  return items;
}

export function savedControls(graph: Graph, id: string, visited = new Set<string>()): Record<string, ControlValue> {
  if (visited.has(id)) return {};
  const seen = new Set(visited).add(id), values: Record<string, ControlValue> = {};
  for (const source of incoming(graph, id)) {
    if (seen.has(source.id)) continue;
    if (source.tool?.kind === "controls") {
      try { Object.assign(values, Object.fromEntries(parseControls(source.tool.text).map((control) => [control.name, control.value])), savedControls(graph, source.id, seen)); } catch {}
    } else if (source.tool?.kind === "timeline") {
      try { Object.assign(values, JSON.parse(source.tool.output || "{}")); } catch {}
    }
  }
  return values;
}

export function selectPath(value: unknown, path: string): unknown {
  return path.replace(/^\$\.?/, "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) throw new Error(`Missing path: ${key}`);
    return (current as Record<string, unknown>)[key];
  }, value);
}

export function searchPassages(documents: { name: string; text: string; workspaceId: string }[], query: string) {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [])];
  if (!terms.length) return [];
  return documents.flatMap((document) => {
    const passages = [];
    for (let offset = 0; offset < document.text.length; offset += 700) {
      const text = document.text.slice(offset, offset + 900), lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      if (score) passages.push({ ...document, text, offset, score });
    }
    return passages;
  }).sort((a, b) => b.score - a.score).slice(0, 12);
}
