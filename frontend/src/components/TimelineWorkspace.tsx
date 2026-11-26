"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { clearLive, connectedControls, publishLive, useLiveRevision } from "@/lib/studioRuntime";
import { StudioShell, useStudio } from "./StudioKit";
import NumberField from "./NumberField";
import { registerWorkspaceFlush } from "@/lib/workspaceFlush";

interface Track { name: string; from: number; to: number }
function parseTracks(text: string): Track[] {
  const tracks = JSON.parse(text);
  if (!Array.isArray(tracks) || tracks.length > 100 || tracks.some((track) => !track || !/^[a-zA-Z_]\w*$/.test(track.name) || !Number.isFinite(track.from) || !Number.isFinite(track.to))) throw new Error("Use an array of {name, from, to} numeric tracks");
  return tracks;
}
export default function TimelineWorkspace(props: TypedWorkspaceProps) {
  const { onOperation } = props;
  const app = useStudio(props, "timeline");
  const [playing, setPlaying] = useState(false), [time, setTime] = useState(Number(app.state.settings.time ?? 0)), [recording, setRecording] = useState(false), [engaged, setEngaged] = useState(app.state.settings.engaged === true);
  const recorded = useRef<string[][]>([]);
  const columns = useRef<string[]>([]);
  useLiveRevision();
  const controls = connectedControls(props.graph, props.workspace.id);
  const controlsRef = useRef(controls);
  useEffect(() => { controlsRef.current = controls; }, [controls]);
  const duration = Number(app.state.settings.duration ?? 10), loop = app.state.settings.loop !== false;
  let tracks: Track[] = [], trackError = "";
  try { tracks = parseTracks(app.state.text); } catch (error) { trackError = (error as Error).message; }
  const values = Object.fromEntries(tracks.map((track) => [track.name, track.from + (track.to - track.from) * Math.min(1, time / duration)]));
  const valueJSON = JSON.stringify(engaged ? values : {});
  const flushRef = useRef(async () => {});
  useEffect(() => { flushRef.current = async () => { await onOperation({ kind: "tool", state: { ...app.state, output: valueJSON, settings: { ...app.state.settings, time, engaged } } }); }; }, [onOperation, app.state, valueJSON, time, engaged]);
  useEffect(() => registerWorkspaceFlush(() => flushRef.current()), []);
  useEffect(() => { publishLive(props.workspace.id, { controls: JSON.parse(valueJSON) }); }, [props.workspace.id, valueJSON]);
  useEffect(() => () => clearLive(props.workspace.id), [props.workspace.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setTime((t) => t + 0.05 >= duration ? loop ? 0 : duration : t + 0.05), 50);
    return () => clearInterval(timer);
  }, [playing, duration, loop]);
  useEffect(() => {
    if (!recording) return;
    const start = performance.now();
    const timer = setInterval(() => {
      if (recorded.current.length >= 10000) return;
      recorded.current.push([String((performance.now() - start) / 1000), ...columns.current.map((name) => String(controlsRef.current[name] ?? ""))]);
    }, 100);
    return () => clearInterval(timer);
  }, [recording]);
  const persistTime = () => app.patch({ output: valueJSON, settings: { ...app.state.settings, time, engaged } });
  return <StudioShell kind="timeline" status={`${app.status} · ${time.toFixed(2)} / ${duration} s${recording ? " · Recording" : ""}`} error={app.error || trackError}>
    <div className="tool-toolbar"><button onClick={() => { setEngaged(true); setPlaying(!playing); if (playing) persistTime(); }}>{playing ? "Pause" : "Play"}</button><button onClick={() => { setPlaying(false); setTime(0); setEngaged(false); app.patch({ output: "{}", settings: { ...app.state.settings, time: 0, engaged: false } }); }}>Reset / release controls</button><label>Duration <NumberField ariaLabel="Duration" min={0.1} max={3600} value={duration} onChange={(n) => app.setting("duration", n)} /></label><label><input type="checkbox" checked={loop} onChange={(event) => app.setting("loop", event.target.checked)} /> Loop</label></div>
    <input aria-label="Timeline time" type="range" min="0" max={duration} step="0.01" value={time} onChange={(event) => { setEngaged(true); setPlaying(false); setTime(Number(event.target.value)); }} onPointerUp={persistTime} />
    <div className="timeline-tracks">{tracks.map((track, i) => <div key={i}><strong>{track.name}</strong><svg viewBox="0 0 400 50"><path d="M0 45L400 5" stroke="#c8a4ff" fill="none" /><circle cx={time / duration * 400} cy={45 - time / duration * 40} r="5" fill="#9cdbbd" /></svg><span>{Number(values[track.name].toFixed(3))}</span></div>)}</div>
    <details className="tool-details"><summary>Edit tracks</summary><textarea aria-label="Timeline tracks" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></details>
    <div className="tool-toolbar"><button disabled={!recording && !Object.keys(controls).length} onClick={() => {
      if (recording) { app.patch({ table: { kind: "data-table", columns: ["time", ...columns.current], rows: recorded.current } }); setRecording(false); }
      else { columns.current = Object.keys(controls); recorded.current = []; setRecording(true); }
    }}>{recording ? "Stop & publish recording" : "Record incoming controls"}</button></div>
    <small className="tool-hint">Tracks output interpolated named values to connected tools. Connect Shared Controls → here to record knob movements at 10 Hz; publish the recording as a table. Active playback is transient and never auto-starts on load.</small>
  </StudioShell>;
}
