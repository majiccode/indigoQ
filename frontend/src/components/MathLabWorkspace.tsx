"use client";

import { useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import type { MathState } from "@/lib/types";
import { parseMath } from "@/lib/mathEngine";
import { downloadText, workspaceText } from "@/lib/workspaceData";
import { useToolState } from "./useToolState";

const EXAMPLE = "amplitude = 2\nfrequency = 1.5\ndamping = 0.15\n\ny = amplitude * exp(-damping * abs(x)) * sin(frequency * x)\ny = amplitude * cos(frequency * x)";
const COLORS = ["#c8a4ff", "#9cdbbd", "#f2bd78", "#86bdf6", "#f296ac"];
const DEFAULT: MathState = { kind: "math-lab", expressions: EXAMPLE, sourceId: "", parameters: {}, bounds: [-10, 10, -5, 5], xColumn: "", yColumn: "" };

export default function MathLabWorkspace({ workspace, graph, onOperation }: TypedWorkspaceProps) {
  const { state, update, status } = useToolState(workspace.tool?.kind === "math-lab" ? workspace.tool : DEFAULT, onOperation, !workspace.tool);
  const [hidden, setHidden] = useState<number[]>([]);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const drag = useRef<{ x: number; y: number; bounds: MathState["bounds"] } | null>(null);
  const sources = connectedWorkspaces(graph, workspace.id, "incoming", "text").filter((source) => source.type !== "math-lab");
  const source = sources.find((item) => item.id === state.sourceId);
  const expressions = source ? workspaceText(source) : state.expressions;
  const parsed = parseMath(expressions);
  const scope = Object.fromEntries(Object.entries(parsed.parameters).map(([name, value]) => [name, state.parameters[name]?.value ?? value]));
  const [xmin, xmax, ymin, ymax] = state.bounds;
  const px = (x: number) => (x - xmin) / (xmax - xmin) * 800;
  const py = (y: number) => 400 - (y - ymin) / (ymax - ymin) * 400;
  const curves = parsed.curves.map((curve) => {
    let path = "", previous: number | null = null;
    const points: [number, number][] = [];
    for (let i = 0; i <= 800; i++) {
      const x = xmin + (xmax - xmin) * i / 800;
      const y = curve.evaluate({ ...scope, x });
      if (Number.isFinite(y)) points.push([x, y]);
      const screen = py(y);
      if (!Number.isFinite(screen) || screen < -800 || screen > 1200) { previous = null; continue; }
      path += `${previous === null || Math.abs(previous - screen) > 400 ? "M" : "L"}${i},${screen.toFixed(2)} `;
      previous = screen;
    }
    return { ...curve, path, points };
  });
  const tables = connectedWorkspaces(graph, workspace.id, "incoming", "table");
  const table = tables.find((item) => item.tool?.kind === "data-table")?.tool;
  const data = table?.kind === "data-table" ? table : null;
  const xIndex = Math.max(0, data?.columns.indexOf(state.xColumn) ?? 0);
  const yIndex = state.yColumn ? data?.columns.indexOf(state.yColumn) ?? 1 : 1;
  const scatter = data?.rows.flatMap((row) => {
    const x = Number(row[xIndex]), y = Number(row[yIndex]);
    return row[xIndex]?.trim() && row[yIndex]?.trim() && Number.isFinite(x) && Number.isFinite(y) ? [[x, y]] : [];
  }) ?? [];
  const zoom = (factor: number) => {
    const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
    const dx = Math.min(1e8, Math.max(1e-8, (xmax - xmin) * factor / 2));
    const dy = Math.min(1e8, Math.max(1e-8, (ymax - ymin) * factor / 2));
    update({ ...state, bounds: [cx - dx, cx + dx, cy - dy, cy + dy] });
  };
  const ticks = (min: number, max: number) => {
    const rough = (max - min) / 8, magnitude = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 5, 10].find((n) => n * magnitude >= rough)! * magnitude;
    return Array.from({ length: Math.min(20, Math.ceil((max - min) / step) + 1) }, (_, i) => Math.ceil(min / step) * step + i * step).filter((n) => n <= max);
  };

  return <div className="tool-workspace" onDoubleClick={(event) => event.stopPropagation()}>
    <div className="tool-toolbar"><strong>ƒ Math Lab</strong><span className="tool-badge">LIVE</span><button onClick={() => update({ ...DEFAULT })}>Example / reset</button>
      <button onClick={() => downloadText("curves.csv", "curve,x,y\n" + curves.flatMap((curve, i) => hidden.includes(i) ? [] : curve.points.map(([x, y]) => `${i + 1},${x},${y}`)).join("\n"), "text/csv")}>Export points</button></div>
    <div className="tool-scroll">
      <label className="tool-field">Equations from<select value={source?.id ?? ""} onChange={(event) => update({ ...state, sourceId: event.target.value, parameters: {} })}><option value="">This workspace</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {state.sourceId && !source && <p className="tool-warning">Equation source is disconnected. Showing local equations.</p>}
      <textarea className="math-expressions" aria-label="Math expressions" value={expressions} readOnly={!!source} spellCheck={false} onChange={(event) => update({ ...state, expressions: event.target.value, parameters: {} })} />
      <small className="tool-hint">One equation per line. Use x, pi, e, sin, cos, exp, sqrt, abs, log and ^. Use * for multiplication.</small>
      {!!parsed.errors.length && <div className="tool-error" role="alert">{parsed.errors.map((error) => <div key={error}>{error}</div>)}</div>}
      <div className="math-parameters">{Object.entries(parsed.parameters).map(([name, initial]) => {
        const radius = Math.max(1, Math.abs(initial) * 2);
        const parameter = state.parameters[name] ?? { value: initial, min: -radius, max: radius };
        const change = (patch: Partial<typeof parameter>) => update({ ...state, parameters: { ...state.parameters, [name]: { ...parameter, ...patch } } });
        return <div className="math-parameter" key={name}><label className="editor-knob"><span className="editor-knob-face" style={{ background: `conic-gradient(from 220deg, #b997ef ${Math.max(0, Math.min(1, (parameter.value - parameter.min) / (parameter.max - parameter.min))) * 280}deg, #3c4938 0deg 280deg, transparent 0)` }}><span><i>{name}</i><strong>{Number(parameter.value.toFixed(3))}</strong></span><input aria-label={`Adjust ${name}`} type="range" min={parameter.min} max={parameter.max} step={(parameter.max - parameter.min) / 1000} value={parameter.value} onChange={(event) => change({ value: Number(event.target.value) })} /></span><small>{name}</small></label>
          <div className="math-range">{(["min", "value", "max"] as const).map((field) => <label key={field}>{field}<input aria-label={`${name} ${field}`} type="number" step="any" value={parameter[field]} onChange={(event) => {
            if (!event.target.value || !Number.isFinite(event.target.valueAsNumber)) return;
            const next = { ...parameter, [field]: event.target.valueAsNumber };
            if (next.min < next.max) change({ ...next, value: Math.max(next.min, Math.min(next.max, next.value)) });
          }} /></label>)}</div></div>;
      })}</div>
      {data && <div className="tool-toolbar"><span>Scatter overlay</span>{["X", "Y"].map((axis) => <label key={axis}>{axis} <select aria-label={`Scatter ${axis} column`} value={data.columns[axis === "X" ? xIndex : yIndex] ?? ""} onChange={(event) => update({ ...state, [axis === "X" ? "xColumn" : "yColumn"]: event.target.value })}>{data.columns.map((column, i) => <option key={i}>{column}</option>)}</select></label>)}</div>}
      <div className="math-chart-toolbar"><button onClick={() => zoom(0.7)} aria-label="Zoom in plot">+</button><button onClick={() => zoom(1.4)} aria-label="Zoom out plot">−</button><button onClick={() => update({ ...state, bounds: DEFAULT.bounds })}>Reset view</button><span>{hover ? `x ${hover[0].toPrecision(5)} · y ${hover[1].toPrecision(5)}` : "Drag to pan · hover to inspect"}</span></div>
      <svg className="math-chart" viewBox="0 0 800 400" preserveAspectRatio="none" role="img" aria-label="Interactive equation plot" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, bounds: state.bounds }; }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onPointerLeave={() => setHover(null)} onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHover([xmin + (event.clientX - rect.left) / rect.width * (xmax - xmin), ymax - (event.clientY - rect.top) / rect.height * (ymax - ymin)]);
        if (drag.current) {
          const { bounds: [a, b, c, d], x, y } = drag.current;
          const dx = (event.clientX - x) / rect.width * (b - a), dy = (event.clientY - y) / rect.height * (d - c);
          update({ ...state, bounds: [a - dx, b - dx, c + dy, d + dy] });
        }
      }}>
        <defs><clipPath id={`plot-${workspace.id}`}><rect width="800" height="400" /></clipPath></defs>
        {ticks(xmin, xmax).map((x) => <g key={x}><path d={`M${px(x)} 0V400`} stroke="#344334" /><text x={px(x) + 4} y="390">{Number(x.toPrecision(4))}</text></g>)}
        {ticks(ymin, ymax).map((y) => <g key={y}><path d={`M0 ${py(y)}H800`} stroke="#344334" /><text x="5" y={py(y) - 5}>{Number(y.toPrecision(4))}</text></g>)}
        <g clipPath={`url(#plot-${workspace.id})`}><path d={`M${px(0)} 0V400M0 ${py(0)}H800`} stroke="#82937b" />{curves.map((curve, i) => !hidden.includes(i) && <path key={i} d={curve.path} stroke={COLORS[i % COLORS.length]} strokeWidth="2.5" fill="none" />)}{scatter.map(([x, y], i) => <circle key={i} cx={px(x)} cy={py(y)} r="3" fill="#ffcb79" />)}</g>
      </svg>
      <div className="math-legend">{curves.map((curve, i) => <label key={i} style={{ color: COLORS[i % COLORS.length] }}><input type="checkbox" checked={!hidden.includes(i)} onChange={() => setHidden(hidden.includes(i) ? hidden.filter((n) => n !== i) : [...hidden, i])} />{curve.label}</label>)}</div>
    </div><footer className="tool-footer" role="status">{status} · {curves.length} curves · {scatter.length} data points</footer>
  </div>;
}
