"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { fetchModels, generateText } from "@/lib/ollamaApi";
import { workspaceText } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

export default function ModelBenchWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "model-bench");
  const [models, setModels] = useState<string[]>([]), [live, setLive] = useState("");
  const abort = useRef<AbortController | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; const controller = new AbortController(); void fetchModels(controller.signal).then(setModels).catch(() => {}); return () => { active.current = false; controller.abort(); abort.current?.abort(); }; }, []);
  const selected = String(app.state.settings.models ?? "").split("\n").filter(Boolean);
  return <StudioShell kind="model-bench" status={app.busy ? "Running comparisons…" : app.status} error={app.error} actions={<><button disabled={app.busy || !selected.length} onClick={() => void app.run(async () => {
    abort.current = new AbortController();
    const context = app.sources.map((source) => `--- ${source.name} ---\n${workspaceText(source)}`).join("\n\n");
    const temperatures = String(app.state.settings.temperatures ?? "0.2,0.8").split(",").map(Number);
    if (temperatures.some((n) => !Number.isFinite(n) || n < 0 || n > 2) || temperatures.length * selected.length > 20) throw new Error("Use temperatures 0…2 and at most 20 model/temperature combinations");
    const rows: string[][] = [];
    for (const model of selected) for (const temperature of temperatures) {
      if (abort.current.signal.aborted) break;
      const start = performance.now(); let output = "", error = "";
      try { output = await generateText({ model, temperature, system: String(app.state.settings.system ?? "You are a helpful assistant."), prompt: (app.state.text || "Explain a damped oscillator in one paragraph.") + (context ? `\n\nContext:\n${context}` : ""), jsonOutput: false }, abort.current.signal, (text) => { if (active.current) setLive(`${model} · ${temperature}\n${text}`); }); }
      catch (reason) { error = (reason as Error).message; }
      rows.push([model, String(temperature), String(Math.round(performance.now() - start)), output, "", error]);
    }
    const table = { kind: "data-table" as const, columns: ["model", "temperature", "duration_ms", "response", "rating", "error"], rows };
    if (active.current) { app.patch({ table, output: rows.map((row) => `${row[0]} @ ${row[1]} (${row[2]} ms)\n${row[3] || row[5]}`).join("\n\n"), settings: { ...app.state.settings, context } }); setLive(""); }
  })}>Run benchmark</button><button disabled={!app.busy} onClick={() => abort.current?.abort()}>Stop</button></>}>
    <div className="bench-models">{models.map((model) => <label key={model}><input type="checkbox" disabled={app.busy} checked={selected.includes(model)} onChange={(event) => app.setting("models", (event.target.checked ? [...selected, model] : selected.filter((item) => item !== model)).join("\n"))} />{model}</label>)}</div>
    {!models.length && <button onClick={() => void app.run(async () => setModels(await fetchModels()))}>Refresh models</button>}
    <label className="tool-field">Prompt<textarea value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></label><label className="tool-field">Temperatures (comma separated)<input value={String(app.state.settings.temperatures ?? "0.2,0.8")} onChange={(event) => app.setting("temperatures", event.target.value)} /></label>
    {live && <pre className="studio-output">{live}</pre>}
    <div className="bench-results">{app.state.table?.rows.map((row, i) => <section key={i}><strong>{row[0]} · temperature {row[1]}</strong><small>{row[2]} ms</small><pre>{row[3] || row[5]}</pre><label>Rating <select value={row[4]} disabled={app.busy} onChange={(event) => app.patch({ table: { ...app.state.table!, rows: app.state.table!.rows.map((r, index) => index === i ? r.map((cell, j) => j === 4 ? event.target.value : cell) : r) } })}><option value="">Unrated</option>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label></section>)}</div>
    <details className="tool-details"><summary>Context snapshot</summary><pre>{String(app.state.settings.context ?? "")}</pre></details><small className="tool-hint">Runs sequentially so local models do not compete for memory. Results and ratings publish as a table for Data Table / SQL. Duration includes model loading.</small>
  </StudioShell>;
}
