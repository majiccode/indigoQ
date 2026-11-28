"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { clearLive, publishLive, useLiveRevision } from "@/lib/studioRuntime";
import { workspaceText, workspaceTable } from "@/lib/workspaceData";
import { parseControls } from "@/lib/studio";
import { StudioShell, useStudio } from "./StudioKit";

const CONTROL_DEFS = [
  { name: "moodColor", type: "color", value: "#c8a4ff" },
  { name: "intensity", type: "number", value: 50, min: 0, max: 100, step: 1 },
  { name: "tempo", type: "number", value: 100, min: 20, max: 220, step: 1 },
  { name: "brightness", type: "number", value: 70, min: 0, max: 100, step: 1 },
  { name: "saturation", type: "number", value: 60, min: 0, max: 100, step: 1 },
  { name: "active", type: "toggle", value: true },
] as const;

const HUE_MAP: Record<string, number> = {
  happy: 45, joyful: 45, cheerful: 45, excited: 30, energetic: 0, angry: 0, intense: 0,
  calm: 190, peaceful: 190, relaxed: 190, serene: 190, tranquil: 190,
  sad: 240, melancholy: 240, gloomy: 240, sombre: 240, sorrowful: 240,
  mysterious: 280, mystical: 280, dark: 280,
  natural: 120, organic: 120, earthy: 120, green: 120,
};

function analyzeTextMood(text: string): { hue: number; intensity: number; tempo: number; brightness: number; saturation: number; label: string } {
  const lower = text.toLowerCase();
  const scores: { hue: number; intensity: number; tempo: number; brightness: number; saturation: number; weight: number }[] = [];

  for (const [keyword, hue] of Object.entries(HUE_MAP)) {
    const regex = new RegExp(`\\b${keyword}\\b`, "g");
    const matches = lower.match(regex);
    if (matches) {
      const energetic = hue === 0 || hue === 30 || hue === 45;
      const quiet = hue === 190 || hue === 240;
      scores.push({ hue, intensity: energetic ? 80 : quiet ? 35 : 55, tempo: energetic ? 140 : quiet ? 65 : 90, brightness: hue === 240 || hue === 280 ? 45 : 75, saturation: energetic ? 80 : 55, weight: matches.length });
    }
  }

  if (/!/.test(lower)) scores.push({ hue: 0, intensity: 80, tempo: 140, brightness: 80, saturation: 80, weight: 2 });
  if (/\?/.test(lower)) scores.push({ hue: 280, intensity: 50, tempo: 80, brightness: 60, saturation: 50, weight: 1 });

  if (!scores.length) {
    return { hue: 190, intensity: 50, tempo: 100, brightness: 70, saturation: 50, label: "neutral" };
  }

  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  const hue = (Math.round(Math.atan2(scores.reduce((sum, s) => sum + Math.sin(s.hue * Math.PI / 180) * s.weight, 0), scores.reduce((sum, s) => sum + Math.cos(s.hue * Math.PI / 180) * s.weight, 0)) * 180 / Math.PI) + 360) % 360;
  const intensity = Math.round(scores.reduce((sum, s) => sum + s.intensity * s.weight, 0) / totalWeight);
  const tempo = Math.round(scores.reduce((sum, s) => sum + s.tempo * s.weight, 0) / totalWeight);
  const brightness = Math.round(scores.reduce((sum, s) => sum + s.brightness * s.weight, 0) / totalWeight);
  const saturation = Math.round(scores.reduce((sum, s) => sum + s.saturation * s.weight, 0) / totalWeight);

  const dominant = scores.sort((a, b) => b.weight - a.weight)[0];
  const label = Object.entries(HUE_MAP).find(([, h]) => h === dominant.hue)?.[0] ?? "mixed";

  return { hue, intensity, tempo, brightness, saturation, label };
}

function hsvToHex(h: number, s: number, v: number): string {
  const S = s / 100, V = v / 100;
  const C = V * S, X = C * (1 - Math.abs(((h / 60) % 2) - 1)), m = V - C;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = C; g = X; }
  else if (h < 120) { r = X; g = C; }
  else if (h < 180) { g = C; b = X; }
  else if (h < 240) { g = X; b = C; }
  else if (h < 300) { r = X; b = C; }
  else { r = C; b = X; }
  const toHex = (x: number) => Math.round((x + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function analyzeTableMood(table: { columns: string[]; rows: string[][] }): { hue: number; intensity: number; tempo: number; brightness: number; saturation: number; label: string } {
  const numericCols = table.columns.map((col, i) => {
    const values = table.rows.filter((row) => row[i]?.trim()).map((row) => Number(row[i])).filter((v) => Number.isFinite(v));
    return { col, values };
  }).filter((c) => c.values.length > 0);

  if (!numericCols.length) {
    return { hue: 190, intensity: 50, tempo: 100, brightness: 70, saturation: 50, label: "neutral" };
  }

  const allValues = numericCols.flatMap((c) => c.values);
  const mean = allValues.reduce((a, b) => a + b, 0) / allValues.length;
  const variance = allValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) / allValues.length;
  const stdDev = Math.sqrt(variance);

  const intensity = Math.min(100, Math.max(0, Math.round(50 + stdDev * 10)));
  const tempo = Math.min(220, Math.max(20, Math.round(60 + intensity)));
  const brightness = Math.min(100, Math.max(0, Math.round(mean * 10)));
  const saturation = Math.min(100, Math.max(0, Math.round(50 + intensity * 0.5)));
  const hue = ((Math.round((mean % 1) * 360) % 360) + 360) % 360;

  const label = intensity > 70 ? "energetic" : intensity < 30 ? "calm" : "balanced";

  return { hue, intensity, tempo, brightness, saturation, label };
}

function moodSignature(mood: { hue: number; intensity: number; tempo: number; brightness: number; saturation: number; label: string }): string {
  return `${mood.hue}:${mood.intensity}:${mood.tempo}:${mood.brightness}:${mood.saturation}:${mood.label}`;
}

export default function AmbientMoodWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "ambient-mood");
  useLiveRevision();
  const definitions = app.state.text || JSON.stringify(CONTROL_DEFS, null, 2);
  const [draft, setDraft] = useState(definitions);
  const lastPublished = useRef<string | null>(null);

  const textSources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "text");
  const tables = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "table");

  const { controls, parseError } = useMemo(() => {
    let parsed: ReturnType<typeof parseControls> = [];
    let error = "";
    try { parsed = parseControls(app.state.text || JSON.stringify(CONTROL_DEFS)); } catch (err) { error = (err as Error).message; }
    return { controls: parsed, parseError: error };
  }, [app.state.text]);

  useEffect(() => () => { lastPublished.current = null; clearLive(props.workspace.id); }, [props.workspace.id]);

  // Compute mood during render (no setState — used directly in JSX below).
  const text = textSources.filter((s) => s.type !== "data-table" && s.type !== "math-lab").map((s) => workspaceText(s)).filter(Boolean).join("\n\n");
  const table = tables[0] ? workspaceTable(tables[0], props.graph) : null;

  const mood = useMemo(() => text.trim() ? analyzeTextMood(text) : table ? analyzeTableMood(table) : { hue: 190, intensity: 50, tempo: 100, brightness: 70, saturation: 50, label: "neutral" }, [text, table]);
  const moodPreview = hsvToHex(mood.hue, mood.saturation, mood.brightness);

  // Side effects: publish live controls and patch app state only when mood actually changes.
  useEffect(() => {
    if (parseError) return;
    const sig = `${moodSignature(mood)}:${app.state.settings.manual === true}:${app.state.text}`;
    if (lastPublished.current === sig) return;
    lastPublished.current = sig;

    const generated: Record<string, string | number | boolean> = {
      moodColor: moodPreview,
      intensity: mood.intensity,
      tempo: mood.tempo,
      brightness: mood.brightness,
      saturation: mood.saturation,
      active: true,
    };

    const next = controls.map((control) => ({ ...control, value: app.state.settings.manual === true ? control.value : generated[control.name] ?? control.value }));
    const values = Object.fromEntries(next.map((control) => [control.name, control.value]));
    publishLive(props.workspace.id, { controls: values });
    const text = JSON.stringify(next, null, 2), output = JSON.stringify(values, null, 2);
    if (text !== app.state.text || output !== app.state.output) app.patch({ text, output });
    }, [mood, moodPreview, props.workspace.id, app, controls, parseError]);

  const change = useCallback((name: string, value: string | number | boolean) => {
    const next = controls.map((item) => item.name === name ? { ...item, value } : item);
    const values = { ...Object.fromEntries(next.map((item) => [item.name, item.value])) };
    app.patch({ settings: { ...app.state.settings, manual: true }, text: JSON.stringify(next, null, 2), output: JSON.stringify(values, null, 2) });
    publishLive(props.workspace.id, { controls: values });
  }, [controls, app, props.workspace.id]);

  return <StudioShell kind="ambient-mood" status={`${app.status} · ${mood.label}`} error={app.error || parseError}>
    <div className="shared-controls">{controls.map((control) => {
      const value = control.value;
      return <label className="shared-control" key={control.name}><strong>{control.name}</strong>
        {control.type === "number" ? <><input type="range" aria-label={control.name} min={control.min} max={control.max} step={control.step ?? 0.01} value={Number(value)} onChange={(event) => change(control.name, Number(event.target.value))} /><output>{Number(Number(value).toFixed(0))}</output></>
          : control.type === "toggle" ? <input type="checkbox" checked={Boolean(value)} onChange={(event) => change(control.name, event.target.checked)} />
           : control.type === "color" ? <input type="color" value={String(value)} onChange={(event) => change(control.name, event.target.value)} />
           : control.type === "select" ? <select aria-label={control.name} value={String(value)} onChange={(event) => change(control.name, event.target.value)}>{control.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>
           : control.type === "button" ? <button onClick={() => change(control.name, Number(value) + 1)}>{control.name}</button>
           : <input type="text" value={String(value)} onChange={(event) => change(control.name, event.target.value)} />}
      </label>;
    })}</div>
    <div className="tool-toolbar" style={{ marginTop: 8, gap: 12 }}>
      <label><input type="checkbox" checked={app.state.settings.manual !== true} onChange={(e) => app.setting("manual", !e.target.checked)} /> Auto mood</label>
      <span style={{ fontSize: 11, color: "#bac9ae" }}>Mood: <strong style={{ color: moodPreview }}>{mood.label}</strong></span>
      <div style={{ width: 24, height: 24, borderRadius: 4, background: moodPreview, border: "1px solid #ffffff33" }} />
    </div>
    <details className="tool-details"><summary>Configure controls (JSON)</summary>
      <textarea aria-label="Control definitions" value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button onClick={() => void app.run(() => { const next = parseControls(draft); app.patch({ text: JSON.stringify(next, null, 2) }); })}>Apply definitions</button>
      <small className="tool-hint">Types: number (min/max/step), toggle, select (options), color, text, button. Text and table inputs auto-generate mood values.</small>
    </details>
    <small className="tool-hint">Wire Document Preview, TextEditor, Ollama, or Data Table → here. Mood is derived from text keywords or table statistics. Connect → Audio Lab, Simulation Lab, Dashboard, or Shared Controls to drive ambient behavior from document sentiment.</small>
  </StudioShell>;
}
