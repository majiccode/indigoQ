"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { connectedControls } from "@/lib/studioRuntime";
import { downloadText, workspaceText } from "@/lib/workspaceData";
import { drawScene, IDENTITY, parseMeshes, parseWorld, type Instance, type Mesh, type Transform } from "@/lib/scene3d";
import { textFile } from "@/lib/studioFiles";
import { StudioShell, useStudio } from "./StudioKit";

export default function WorldWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "world-workspace");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [draft, setDraft] = useState(app.state.text);
  let world: ReturnType<typeof parseWorld> = { name: "Scene", instances: [], meshes: [] }, error = "";
  try { world = parseWorld(app.state.text); } catch (reason) { error = (reason as Error).message; }
  const models = new Map(world.meshes.map((m) => [m.name, m]));
  for (const source of app.sources) {
    const text = workspaceText(source);
    if (!text) continue;
    try { for (const mesh of parseMeshes(text).meshes) models.set(mesh.name, mesh); } catch { /* Other text inputs need not be models. */ }
  }
  const controls = connectedControls(props.graph, props.workspace.id);
  const globalTransform = { ...IDENTITY };
  for (const key of Object.keys(globalTransform) as (keyof Transform)[]) {
    const n = Number(controls[key] ?? IDENTITY[key]); globalTransform[key] = Number.isFinite(n) ? n : IDENTITY[key];
  }
  const signature = JSON.stringify({ world, meshes: [...models.values()], globalTransform });
  useEffect(() => {
    const current = canvas.current; if (!current) return;
    const { world, meshes, globalTransform } = JSON.parse(signature);
    const models = new Map<string, Mesh>(meshes.map((m: Mesh) => [m.name, m]));
    const draw = () => drawScene(current, world.instances.filter((i: Instance) => i.visible && models.has(i.modelName)).map((i: Instance) => {
      const transform = { ...i };
      for (const key of Object.keys(IDENTITY) as (keyof Transform)[]) transform[key] = key.startsWith("s") ? i[key] * globalTransform[key] : i[key] + globalTransform[key];
      return { mesh: models.get(i.modelName)!, transform };
    }), { distance: 12 });
    draw(); const observer = new ResizeObserver(draw); observer.observe(current);
    return () => observer.disconnect();
  }, [signature]);
  const update = (next: typeof world) => app.patch({ text: JSON.stringify({ version: 1, ...next }, null, 2) });
  const setInstance = (id: string, patch: Partial<Instance>) => update({ ...world, instances: world.instances.map((i) => i.id === id ? { ...i, ...patch } : i) });
  const importText = (text: string) => {
    const data = JSON.parse(text.trim().replace(/^```[^\n]*\n/, "").replace(/\n```\s*$/, ""));
    if (data.instances) update(parseWorld(JSON.stringify(data)));
    else { const incoming = parseMeshes(JSON.stringify(data)); const assets = new Map(world.meshes.map((m) => [m.name, m])); incoming.meshes.forEach((m) => assets.set(m.name, m)); update({ ...world, meshes: [...assets.values()] }); }
  };
  const exportWorld = async () => {
    const missing = world.instances.filter((i) => !models.has(i.modelName));
    if (missing.length) throw new Error(`Missing models: ${[...new Set(missing.map((i) => i.modelName))].join(", ")}`);
    const json = JSON.stringify({ version: 1, ...world, meshes: [...models.values()] }, null, 2);
    const name = `${world.name.replace(/[^\w.-]+/g, "_") || "scene"}_world.json`;
    const file = textFile(`${props.workspace.id}-world`, name, json);
    app.patch({ text: json, output: json, files: [file] });
    for (const target of connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((s) => s.type === "content-source")) await props.onOperation({ kind: "saveFile", workspaceId: target.id, name, mimeType: file.mimeType, dataUrl: file.dataUrl });
    downloadText(name, json, "application/json");
  };
  return <StudioShell kind="world-workspace" status={`${app.status} · ${world.instances.length} instances · ${models.size} models`} error={app.error || error} actions={<button disabled={!!error} onClick={() => void app.run(exportWorld)}>Export world ↓</button>}>
    <div className="tool-toolbar"><label>World <input aria-label="World name" value={world.name} onChange={(e) => update({ ...world, name: e.target.value })} /></label><button onClick={() => update({ ...world, instances: [] })}>Clear world</button></div>
    <div className="tool-toolbar">{[...models.keys()].map((name) => <button key={name} onClick={() => update({ ...world, meshes: [...models.values()], instances: [...world.instances, { ...IDENTITY, id: crypto.randomUUID(), modelName: name, visible: true }] })}>Place {name}</button>)}</div>
    {!models.size && <small className="tool-hint">Export a connected 3D Modeler, or drop a model JSON file here.</small>}
    <canvas ref={canvas} style={{ width: "100%", height: 420, display: "block" }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) void app.run(async () => importText(await file.text())); }} />
    {world.instances.map((i) => <div className="tool-toolbar" key={i.id}><strong>{i.modelName}{!models.has(i.modelName) && " (missing model)"}</strong>
      {(Object.keys(IDENTITY) as (keyof Transform)[]).map((key) => <label key={key}>{key}<input aria-label={`${i.modelName} ${key}`} type="number" step="0.1" style={{ width: 60 }} value={i[key]} onChange={(e) => setInstance(i.id, { [key]: Number(e.target.value) })} /></label>)}
      <label>Visible <input type="checkbox" checked={i.visible} onChange={(e) => setInstance(i.id, { visible: e.target.checked })} /></label>
      <button onClick={() => update({ ...world, instances: world.instances.filter((item) => item.id !== i.id) })}>Delete</button>
    </div>)}
    <details><summary>Import scene / model JSON</summary><textarea aria-label="World JSON" value={draft} onChange={(e) => setDraft(e.target.value)} /><button onClick={() => void app.run(() => importText(draft))}>Apply JSON</button></details>
    <small className="tool-hint">Connected model exports update the asset list. Scene exports include mesh geometry, publish JSON, and save into outgoing FileWorkspaces. Edits persist with the graph.</small>
  </StudioShell>;
}
