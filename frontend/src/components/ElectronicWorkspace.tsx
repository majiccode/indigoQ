"use client";

import { useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { downloadText, workspaceText } from "@/lib/workspaceData";
import { textFile } from "@/lib/studioFiles";
import { checkCircuit, circuitNets, makePart, parseCircuit, pinPosition, PIN_COLORS, TEMPLATES, type Circuit, type ComponentType, type Wire } from "@/lib/circuit";
import { StudioShell, useStudio } from "./StudioKit";

function exampleCircuit(lcd = false): Circuit {
  const components = [makePart("power", "c1", 60, 160), makePart("mcu", "c2", 240, 80), makePart("resistor", "c3", 440, 100), makePart("led", "c4", 560, 160), makePart("ground", "c5", 240, 300)];
  const wires: Wire[] = [];
  const connect = (a: string, ap: number, b: string, bp: number) => wires.push({ id: `w${wires.length + 1}`, from: { comp: a, pin: `p${ap}` }, to: { comp: b, pin: `p${bp}` }, color: "#fbbf24" });
  connect("c1", 0, "c2", 0); connect("c1", 1, "c5", 0); connect("c2", 1, "c5", 0); connect("c2", 2, "c3", 0); connect("c3", 1, "c4", 0); connect("c4", 1, "c5", 0);
  if (lcd) { components.push(makePart("lcd", "c6", 450, 250)); connect("c1", 0, "c6", 0); connect("c5", 0, "c6", 1); for (let i = 0; i < 6; i++) connect("c2", i + 2, "c6", i + 2); }
  return { components, wires };
}

export default function ElectronicWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "electronic-workspace");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<Wire["from"] | null>(null);
  const [draft, setDraft] = useState(app.state.text);
  const [testOutput, setTestOutput] = useState("");
  const [aiHelp, setAiHelp] = useState("");
  let circuit: Circuit = { components: [], wires: [] }, error = "";
  try { circuit = parseCircuit(app.state.text); } catch (reason) { error = (reason as Error).message; }
  const deviceName = String(app.state.settings.deviceName ?? "My Device");
  const update = (next: Circuit) => { app.patch({ text: JSON.stringify({ version: 1, ...next }, null, 2) }); setTestOutput(""); };
  const point = (x: number, y: number) => { const matrix = svg.current?.getScreenCTM()?.inverse(); return matrix ? new DOMPoint(x, y).matrixTransform(matrix) : null; };
  const connect = (endpoint: Wire["from"]) => {
    if (!connecting) { setConnecting(endpoint); return; }
    const same = (a: Wire["from"], b: Wire["from"]) => a.comp === b.comp && a.pin === b.pin;
    if (!same(connecting, endpoint) && !circuit.wires.some((w) => (same(w.from, connecting) && same(w.to, endpoint)) || (same(w.to, connecting) && same(w.from, endpoint)))) update({ ...circuit, wires: [...circuit.wires, { id: crypto.randomUUID(), from: connecting, to: endpoint, color: "#fbbf24" }] });
    setConnecting(null);
  };
  const netlist = () => {
    const labels = new Map<string, string>(circuit.components.flatMap((p) => p.pins.map((pin) => [`${p.id}:${pin.id}`, `${p.label}.${pin.label}`] as const)));
    return circuitNets(circuit).map((net, i) => `NET ${i + 1}: ${net.map((key) => labels.get(key)).join(" ↔ ")}`).join("\n");
  };
  const publishFile = async (name: string, text: string, mimeType = "application/json") => {
    const file = textFile(`${props.workspace.id}-circuit`, name, text, mimeType);
    app.patch({ output: text, files: [file] });
    for (const target of connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((s) => s.type === "content-source")) await props.onOperation({ kind: "saveFile", workspaceId: target.id, name, mimeType, dataUrl: file.dataUrl });
    downloadText(name, text, mimeType);
  };
  const save = () => publishFile(`${deviceName.replace(/[^\w.-]+/g, "_") || "device"}_circuit.json`, JSON.stringify({ version: 1, ...circuit }, null, 2));
  const planning = () => {
    const csv = (s: string) => `"${s.replaceAll('"', '""')}"`;
    const bom = ["Reference,Type,Value", ...circuit.components.map((p) => [p.label, p.type, p.value].map(csv).join(","))].join("\n");
    const placement = circuit.components.map((p) => `${p.label}: canvas (${p.x}, ${p.y}), rotation ${p.rotation}°`).join("\n");
    const text = `PLANNING PACKAGE — ${deviceName}\nConnectivity and layout notes; not fabrication-ready Gerber/drill files.\n\nBOM\n${bom}\n\nNETLIST\n${netlist()}\n\nPLACEMENT\n${placement}\n\nASSEMBLY\nCheck part datasheets and footprints. Build each listed net, then verify power and ground before testing.\n`;
    return publishFile(`${deviceName.replace(/[^\w.-]+/g, "_")}_planning_package.txt`, text, "text/plain");
  };
  const part = circuit.components.find((p) => p.id === selected);
  const patchPart = (patch: Partial<NonNullable<typeof part>>) => update({ ...circuit, components: circuit.components.map((p) => p.id === selected ? { ...p, ...patch } : p) });
  return <StudioShell kind="electronic-workspace" status={`${app.status} · ${circuit.components.length} components · ${circuitNets(circuit).length} nets`} error={app.error || error}>
    <div className="tool-toolbar">{Object.entries(TEMPLATES).map(([type, t]) => <button key={type} onClick={() => { const id = crypto.randomUUID(); update({ ...circuit, components: [...circuit.components, makePart(type as ComponentType, id, 80 + circuit.components.length * 15, 80)] }); setSelected(id); }}>{t.label}</button>)}</div>
    <div className="tool-toolbar"><label>Device <input value={deviceName} onChange={(e) => app.setting("deviceName", e.target.value)} /></label>
      <select aria-label="Example circuits" defaultValue="" onChange={(e) => { if (e.target.value) { update(exampleCircuit(e.target.value === "lcd")); setSelected(null); setConnecting(null); } }}><option value="">Examples</option><option value="led">Blink LED</option><option value="lcd">LCD Controller</option></select>
      <button onClick={() => { const errors = checkCircuit(circuit); setTestOutput(errors.length ? errors.map((s) => `✗ ${s}`).join("\n") : "✓ Basic connectivity checks passed. This is not an electrical simulation."); }}>Test circuit</button>
      <button disabled={!!error} onClick={() => void app.run(save)}>Save design ↓</button><button disabled={!!error} onClick={() => void app.run(planning)}>Manufacturing package ↓</button>
      <button onClick={() => setAiHelp(`Copy this prompt into Ollama and run it explicitly:\n\nReview this circuit and suggest parts, pinout corrections, and assembly steps for ${deviceName}.\n${JSON.stringify(circuit, null, 2)}`)}>Ask AI</button>
    </div>
    <svg ref={svg} viewBox="0 0 800 480" style={{ width: "100%", height: 420, background: "#0b1120", touchAction: "none" }}
      onPointerMove={(e) => { if (!drag.current) return; const pos = point(e.clientX, e.clientY); if (!pos) return; const current = drag.current; update({ ...circuit, components: circuit.components.map((p) => p.id === current.id ? { ...p, x: pos.x - current.dx, y: pos.y - current.dy } : p) }); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void app.run(async () => { const text = await file.text(); update(parseCircuit(text)); setDraft(text); }); }}>
      {circuit.wires.map((w) => { const a = circuit.components.find((p) => p.id === w.from.comp)!, b = circuit.components.find((p) => p.id === w.to.comp)!; const from = pinPosition(a, a.pins.findIndex((p) => p.id === w.from.pin)), to = pinPosition(b, b.pins.findIndex((p) => p.id === w.to.pin)); return <line key={w.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={w.color} strokeWidth={3} onDoubleClick={(e) => { e.stopPropagation(); update({ ...circuit, wires: circuit.wires.filter((wire) => wire.id !== w.id) }); }}><title>Double-click to remove connection</title></line>; })}
      {circuit.components.map((p) => { const t = TEMPLATES[p.type]; return <g key={p.id} transform={`translate(${p.x},${p.y}) rotate(${p.rotation},${t.width / 2},${t.height / 2})`} onPointerDown={(e) => { const pos = point(e.clientX, e.clientY); if (!pos) return; e.stopPropagation(); svg.current?.setPointerCapture(e.pointerId); setSelected(p.id); drag.current = { id: p.id, dx: pos.x - p.x, dy: pos.y - p.y }; }}>
        <rect width={t.width} height={t.height} rx={6} fill="#111827" stroke={selected === p.id ? "#3b82f6" : "#9ca3af"} strokeWidth={2} />
        <text x={t.width / 2} y={t.height / 2 - 3} textAnchor="middle" fill="#e5e7eb" fontSize={10}>{p.label}</text><text x={t.width / 2} y={t.height / 2 + 12} textAnchor="middle" fill="#9ca3af" fontSize={9}>{p.value}</text>
        {p.pins.map((pin, index) => { const pos = pinPosition(p, index, false); return <circle key={pin.id} cx={pos.x} cy={pos.y} r={6} fill={connecting?.comp === p.id && connecting.pin === pin.id ? "#22c55e" : PIN_COLORS[pin.role]} stroke="#e5e7eb" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); connect({ comp: p.id, pin: pin.id }); }}><title>{p.label}.{pin.label}</title></circle>; })}
      </g>; })}
    </svg>
    {connecting && <div className="tool-toolbar">Click another pin to connect.<button onClick={() => setConnecting(null)}>Cancel wire</button></div>}
    {part && <div className="tool-toolbar"><label>Label <input value={part.label} onChange={(e) => patchPart({ label: e.target.value })} /></label><label>Value <input value={part.value} onChange={(e) => patchPart({ value: e.target.value })} /></label><button onClick={() => patchPart({ rotation: (part.rotation + 90) % 360 })}>Rotate</button><button onClick={() => { update({ components: circuit.components.filter((p) => p.id !== selected), wires: circuit.wires.filter((w) => w.from.comp !== selected && w.to.comp !== selected) }); setSelected(null); }}>Delete part</button></div>}
    <label>Description <textarea value={String(app.state.settings.deviceDesc ?? "")} onChange={(e) => app.setting("deviceDesc", e.target.value)} /></label>
    <details><summary>Import / edit circuit JSON</summary><textarea aria-label="Circuit JSON" value={draft} onChange={(e) => setDraft(e.target.value)} /><button onClick={() => void app.run(() => update(parseCircuit(draft)))}>Apply JSON</button>{app.sources.filter((s) => workspaceText(s)).map((s) => <button key={s.id} onClick={() => void app.run(() => update(parseCircuit(workspaceText(s))))}>Import {s.name}</button>)}</details>
    {testOutput && <pre>{testOutput}</pre>}{aiHelp && <pre style={{ whiteSpace: "pre-wrap" }}>{aiHelp}</pre>}
    <small className="tool-hint">Drag parts · Click pins to connect · Double-click a wire to delete. All edits persist with the graph. Exports publish text/files and save into outgoing FileWorkspaces.</small>
  </StudioShell>;
}
