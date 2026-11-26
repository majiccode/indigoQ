"use client";

import { useEffect, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { parseControls } from "@/lib/studio";
import { clearLive, connectedControls, publishLive, useLiveRevision } from "@/lib/studioRuntime";
import { StudioShell, useStudio } from "./StudioKit";

export default function ControlsWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "controls");
  const [draft, setDraft] = useState(app.state.text);
  useLiveRevision();
  const external = connectedControls(props.graph, props.workspace.id);
  let controls: ReturnType<typeof parseControls> = [], parseError = "";
  try { controls = parseControls(app.state.text); } catch (error) { parseError = (error as Error).message; }
  useEffect(() => () => clearLive(props.workspace.id), [props.workspace.id]);
  const change = (name: string, value: string | number | boolean) => {
    const next = controls.map((item) => item.name === name ? { ...item, value } : item);
    const values = { ...Object.fromEntries(next.map((item) => [item.name, item.value])), ...external };
    publishLive(props.workspace.id, { controls: values });
    app.patch({ text: JSON.stringify(next, null, 2), output: JSON.stringify(values, null, 2) });
  };
  return <StudioShell kind="controls" status={app.status} error={app.error || parseError}>
    <div className="shared-controls">{controls.map((control) => {
      const value = external[control.name] ?? control.value;
      return <label className="shared-control" key={control.name}><strong>{control.name}</strong>
        {control.type === "number" ? <><input type="range" aria-label={control.name} min={control.min} max={control.max} step={control.step ?? 0.01} value={Number(value)} onChange={(event) => change(control.name, Number(event.target.value))} /><output>{Number(Number(value).toFixed(3))}</output></>
          : control.type === "toggle" ? <input type="checkbox" checked={Boolean(value)} onChange={(event) => change(control.name, event.target.checked)} />
          : control.type === "select" ? <select value={String(value)} onChange={(event) => change(control.name, event.target.value)}>{control.options?.map((option) => <option key={option}>{option}</option>)}</select>
          : control.type === "button" ? <button onClick={() => change(control.name, Number(value) + 1)}>Trigger ({String(value)})</button>
          : <input type={control.type === "color" ? "color" : "text"} value={String(value)} onChange={(event) => change(control.name, event.target.value)} />}
      </label>;
    })}</div>
    <details className="tool-details"><summary>Configure controls (JSON)</summary><textarea aria-label="Control definitions" value={draft} onChange={(event) => setDraft(event.target.value)} /><button onClick={() => void app.run(() => { parseControls(draft); clearLive(props.workspace.id); app.patch({ text: draft }); })}>Apply definitions</button><small className="tool-hint">Types: number (min/max/step), toggle, select (options), color, text, button. Incoming Timeline values override matching names.</small></details>
    <small className="tool-hint">Connect → Math Lab, Simulation, Audio Lab, or Playground. Values update live; graphs save the current settings.</small>
  </StudioShell>;
}
