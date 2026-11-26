"use client";

import { useEffect, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { connectedControls, useLiveRevision } from "@/lib/studioRuntime";
import { simulate, type SimulationMode } from "@/lib/simulation";
import { StudioShell, useStudio } from "./StudioKit";

export default function SimulationWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "simulation");
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(0);
  useLiveRevision();
  const controls = connectedControls(props.graph, props.workspace.id);
  const reset = controls.reset;
  useEffect(() => {
    if (reset === undefined) return;
    const frame = requestAnimationFrame(() => setTime(0));
    return () => cancelAnimationFrame(frame);
  }, [reset]);
  const mode = String(app.state.settings.mode ?? "spring") as SimulationMode;
  const duration = Number(app.state.settings.duration ?? 20);
  const parameters = { amplitude: Number(app.state.settings.amplitude ?? 2), frequency: Number(app.state.settings.frequency ?? 1.5), damping: Number(app.state.settings.damping ?? 0.15), ...Object.fromEntries(Object.entries(controls).filter(([, value]) => typeof value === "number")) } as Record<string, number>;
  let rows: number[][] = [], simulationError = "";
  try { rows = simulate(mode, duration, parameters); } catch (error) { simulationError = (error as Error).message; }
  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous = performance.now();
    const animate = (now: number) => { const dt = Math.min(0.1, (now - previous) / 1000); previous = now; setTime((t) => (t + dt) % duration); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  const sample = rows[Math.min(rows.length - 1, Math.round(time / duration * (rows.length - 1)))] ?? [0, 0, 0];
  const spatial = mode === "orbit", scale = spatial ? 70 : 55;
  const x = mode === "pendulum" ? 250 + Math.sin(sample[1]) * 130 : 250 + sample[1] * scale;
  const y = mode === "pendulum" ? 35 + Math.cos(sample[1]) * 130 : spatial ? 150 + sample[2] * scale : 150;
  return <StudioShell kind="simulation" status={`${app.status} · t ${time.toFixed(2)} s`} error={app.error || simulationError} actions={<button onClick={() => void app.run(() => app.patch({ table: { kind: "data-table", columns: ["time", "x", mode === "spring" || mode === "pendulum" ? "velocity" : "y"], rows: rows.map((row) => row.map(String)) }, output: JSON.stringify({ mode, parameters, duration }) }))}>Capture data</button>}>
    <div className="tool-toolbar"><select aria-label="Simulation" value={mode} onChange={(event) => { setTime(0); app.setting("mode", event.target.value); }}>{["spring", "pendulum", "orbit", "population", "epidemic"].map((name) => <option key={name}>{name}</option>)}</select><button onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Play"}</button><button onClick={() => { setTime(0); setPlaying(false); }}>Reset</button></div>
    <svg viewBox="0 0 500 300" className="studio-visual" aria-label="Simulation animation" onPointerDown={(event) => {
      if (mode !== "spring" && mode !== "pendulum") return;
      const rect = event.currentTarget.getBoundingClientRect();
      app.setting("amplitude", mode === "spring" ? ((event.clientX - rect.left) / rect.width * 500 - 250) / 55 : Math.atan2((event.clientX - rect.left) / rect.width * 500 - 250, (event.clientY - rect.top) / rect.height * 300 - 35)); setTime(0);
    }}>
      {mode === "spring" || mode === "pendulum" || spatial ? <><path d={`M${mode === "spring" ? 20 : 250} ${mode === "spring" ? 150 : spatial ? 150 : 35} L${x} ${y}`} stroke="#9cdbbd" strokeWidth="3" />{spatial && <circle cx="250" cy="150" r="10" fill="#f2bd78" />}<circle cx={x} cy={y} r="18" fill={String(controls.color ?? "#c8a4ff")} /></> : <>{rows.length > 0 && [1, 2].map((column) => <polyline key={column} fill="none" stroke={column === 1 ? "#9cdbbd" : "#c8a4ff"} strokeWidth="2" points={rows.map((row) => `${row[0] / duration * 500},${280 - row[column] / Math.max(1, ...rows.map((r) => r[column])) * 250}`).join(" ")} />)}<path d={`M${time / duration * 500} 0V300`} stroke="#f2bd78" /></>}
    </svg>
    <input aria-label="Simulation time" type="range" min="0" max={duration} step="0.01" value={time} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)); }} />
    <div className="tool-toolbar">{["amplitude", "frequency", "damping"].map((name) => <label key={name}>{name}<input aria-label={`Simulation ${name}`} type="number" step="0.05" value={parameters[name]} disabled={controls[name] !== undefined} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) app.setting(name, event.target.valueAsNumber); }} /></label>)}</div>
    <p className="tool-hint">Connect Shared Controls for live parameters. Spring/pendulum: click the scene to set displacement. Capture data publishes the full run to tables/charts. Population parameters: growth, predation, conversion, death; epidemic: transmission, recovery; orbit: gravity.</p>
  </StudioShell>;
}
