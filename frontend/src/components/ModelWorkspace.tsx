"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { connectedWorkspaces } from "@/lib/workspaceRegistry";
import { connectedControls } from "@/lib/studioRuntime";
import { downloadText, workspaceText } from "@/lib/workspaceData";
import { drawScene, IDENTITY, parseMeshes, type Mesh, type Transform } from "@/lib/scene3d";
import { textFile } from "@/lib/studioFiles";
import { StudioShell, useStudio } from "./StudioKit";

const EXAMPLES: Record<string, Mesh> = {
  Cube: { name: "Cube", vertices: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]].map(([x,y,z]) => ({ x,y,z })), faces: [[3,2,1,0],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]], color: "#3b82f6" },
  Pyramid: { name: "Pyramid", vertices: [[0,1,0],[-1,-1,1],[1,-1,1],[1,-1,-1],[-1,-1,-1]].map(([x,y,z]) => ({ x,y,z })), faces: [[0,1,2],[0,2,3],[0,3,4],[0,4,1],[4,3,2,1]], color: "#10b981" },
  Spaceship: { name: "Spaceship", vertices: [[0,3,0],[2,0,2],[-2,0,2],[-2,0,-2],[2,0,-2],[0,-1,0]].map(([x,y,z]) => ({ x,y,z })), faces: [[0,1,2],[0,2,3],[0,3,4],[0,4,1],[1,5,2],[2,5,3],[3,5,4],[4,5,1]], color: "#fbbf24" },
  Car: { name: "Car", vertices: [[-2,-1,2],[2,-1,2],[2,-1,-2],[-2,-1,-2],[-2,1,2],[2,1,2],[1.5,1,-2],[-1.5,1,-2]].map(([x,y,z]) => ({ x,y,z })), faces: [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]], color: "#ef4444" },
};

export default function ModelWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "model-workspace");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [spinning, setSpinning] = useState(false);
  const [draft, setDraft] = useState(app.state.text);
  let model: ReturnType<typeof parseMeshes> = { name: "My Model", meshes: [] }, error = "";
  try { model = parseMeshes(app.state.text); } catch (reason) { error = (reason as Error).message; }
  const controls = connectedControls(props.graph, props.workspace.id);
  const transform = { ...IDENTITY };
  for (const key of Object.keys(transform) as (keyof Transform)[]) {
    const value = Number(controls[key] ?? app.state.settings[key] ?? IDENTITY[key]);
    transform[key] = Number.isFinite(value) ? value : IDENTITY[key];
  }
  const wireframe = app.state.settings.wireframe !== false, culling = app.state.settings.culling !== false;
  const renderSignature = JSON.stringify({ model, transform, wireframe, culling });
  useEffect(() => {
    const current = canvas.current;
    if (!current) return;
    const { model, transform, wireframe, culling } = JSON.parse(renderSignature);
    let frame = 0;
    const start = performance.now();
    const draw = () => {
      const animated = { ...transform, ry: transform.ry + (spinning ? (performance.now() - start) * 0.03 : 0) };
      drawScene(current, model.meshes.map((mesh: Mesh) => ({ mesh, transform: animated })), { wireframe, culling });
    };
    const animate = () => { draw(); if (spinning) frame = requestAnimationFrame(animate); };
    draw();
    if (spinning) frame = requestAnimationFrame(animate);
    const observer = new ResizeObserver(draw); observer.observe(current);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [renderSignature, spinning]);
  const update = (next: typeof model) => app.patch({ text: JSON.stringify({ version: 1, ...next }, null, 2) });
  const importText = (text: string) => { const parsed = parseMeshes(text); update(parsed); setDraft(JSON.stringify({ version: 1, ...parsed }, null, 2)); };
  const exportModel = async () => {
    const json = JSON.stringify({ version: 1, ...model }, null, 2);
    const name = `${model.name.replace(/[^\w.-]+/g, "_") || "model"}_model.json`;
    const file = textFile(`${props.workspace.id}-model`, name, json);
    app.patch({ output: json, files: [file] });
    for (const target of connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((s) => s.type === "content-source")) await props.onOperation({ kind: "saveFile", workspaceId: target.id, name, mimeType: file.mimeType, dataUrl: file.dataUrl });
    downloadText(name, json, "application/json");
  };
  return <StudioShell kind="model-workspace" status={`${app.status} · ${model.meshes.length} meshes`} error={app.error || error} actions={<button disabled={!!error} onClick={() => void app.run(exportModel)}>Export model ↓</button>}>
    <div className="tool-toolbar">{Object.entries(EXAMPLES).map(([name, mesh]) => <button key={name} onClick={() => update({ ...model, meshes: [...model.meshes, { ...mesh, name: `${name} ${model.meshes.length + 1}` }] })}>{name}</button>)}</div>
    <div className="tool-toolbar">
      <label>Name <input aria-label="Model name" value={model.name} onChange={(e) => update({ ...model, name: e.target.value })} /></label>
      <button onClick={() => app.setting("wireframe", !wireframe)}>{wireframe ? "Solid" : "Wireframe"}</button>
      <button onClick={() => app.setting("culling", !culling)}>{culling ? "Culling On" : "Culling Off"}</button>
      <button onClick={() => setSpinning(!spinning)}>{spinning ? "Stop Spin" : "Spin"}</button>
      <button onClick={() => update({ ...model, meshes: [] })}>Clear</button>
    </div>
    <div className="tool-toolbar">{(Object.keys(IDENTITY) as (keyof Transform)[]).map((key) => <label key={key}>{key}<input aria-label={`Model ${key}`} type="number" step="0.1" style={{ width: 60 }} value={transform[key]} onChange={(e) => app.setting(key, Number(e.target.value))} /></label>)}</div>
    <canvas ref={canvas} style={{ width: "100%", height: 420, display: "block" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void app.run(async () => importText(await file.text())); }} />
    {model.meshes.map((mesh, i) => <div className="tool-toolbar" key={`${i}-${mesh.name}`}>
      <input aria-label={`Mesh ${i + 1} name`} value={mesh.name} onChange={(e) => update({ ...model, meshes: model.meshes.map((m, j) => j === i ? { ...m, name: e.target.value } : m) })} />
      <input aria-label={`${mesh.name} color`} type="color" value={mesh.color} onChange={(e) => update({ ...model, meshes: model.meshes.map((m, j) => j === i ? { ...m, color: e.target.value } : m) })} />
      <button onClick={() => update({ ...model, meshes: model.meshes.filter((_, j) => j !== i) })}>Delete</button>
    </div>)}
    <details><summary>Import / edit model JSON</summary><textarea aria-label="Model JSON" value={draft} onChange={(e) => setDraft(e.target.value)} /><button onClick={() => void app.run(() => importText(draft))}>Apply JSON</button>
      {app.sources.filter((s) => workspaceText(s)).map((s) => <button key={s.id} onClick={() => void app.run(() => importText(workspaceText(s)))}>Import {s.name}</button>)}
    </details>
    <small className="tool-hint">Edits are saved with the graph. Export publishes a model snapshot to World Builder and saves JSON into outgoing FileWorkspaces. Connected tx/ty/tz, rx/ry/rz, sx/sy/sz override local view controls.</small>
  </StudioShell>;
}
