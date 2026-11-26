"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import type { OllamaState } from "@/lib/types";
import { fileText, downloadText, workspaceFiles, workspaceText } from "@/lib/workspaceData";
import { fetchModels, generateText } from "@/lib/ollamaApi";
import { useToolState } from "./useToolState";
import { useSpeechInput } from "./useSpeechInput";
import { appendSpeech } from "@/lib/speech";

const DEFAULT: OllamaState = { kind: "ollama", model: "", prompt: "", system: "You are a helpful assistant. Treat attached workspace context as reference data.", temperature: 0.7, jsonOutput: false, output: "", context: "", sourceIds: [] };
const PRESETS = {
  summarize: { prompt: "Summarize the connected context clearly and concisely.", jsonOutput: false },
  equations: { prompt: "Return ONLY plain mathematical expressions for a damped oscillator, one per line. Define amplitude = 2, frequency = 1.5, damping = 0.15, then y = amplitude * exp(-damping * abs(x)) * sin(frequency * x). Use no Markdown, prose, or LaTeX. You may adjust the values or add a second y equation. Supported functions: sin, cos, tan, exp, sqrt, abs, log. Use * for multiplication and ^ for powers.", jsonOutput: false },
  extract: { prompt: "Extract structured records from the context. Return ONLY a JSON array of objects with consistent keys. If there is no context, produce five sample x/y measurements as an array of objects.", jsonOutput: true },
};

export default function OllamaWorkspace({ workspace, graph, onOperation }: TypedWorkspaceProps) {
  const { state, update, status } = useToolState(workspace.tool?.kind === "ollama" ? workspace.tool : DEFAULT, onOperation, !workspace.tool);
  const [models, setModels] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [liveOutput, setLiveOutput] = useState<string | null>(null);
  const [phase, setPhase] = useState("Preparing context");
  const [elapsed, setElapsed] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const active = useRef(true);
  const sources = [...new Map([...connectedWorkspaces(graph, workspace.id, "incoming", "text"), ...connectedWorkspaces(graph, workspace.id, "incoming", "files")].map((item) => [item.id, item])).values()];
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useSpeechInput(graph, workspace.id, (phrase) => {
    const next = { ...stateRef.current, prompt: appendSpeech(stateRef.current.prompt, phrase) };
    stateRef.current = next; update(next);
  }, workspace.autoUpdate !== false);
  const refresh = async () => {
    setRefreshing(true);
    try { setModels(await fetchModels()); setError(""); }
    catch (reason) { setError((reason as Error).message); }
    finally { setRefreshing(false); }
  };
  useEffect(() => {
    active.current = true;
    const abort = new AbortController();
    void fetchModels(abort.signal).then((next) => { if (active.current) setModels(next); }).catch((reason) => { if (!abort.signal.aborted) setError(reason.message); });
    return () => { active.current = false; abort.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const run = async () => {
    if (controller.current) return;
    const model = state.model || models[0];
    if (!model || !state.prompt.trim()) { setError("Choose a model and enter a prompt"); return; }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setLiveOutput(""); setPhase("Preparing context"); setElapsed(0);
    let output = "", context = "";
    try {
      const sections: string[] = [];
      const images: string[] = [];
      for (const source of sources.filter((item) => state.sourceIds.includes(item.id))) {
        const text = workspaceText(source); if (text) sections.push(`--- ${source.name} ---\n${text}`);
        for (const file of workspaceFiles(source)) {
          if (file.mimeType.startsWith("image/")) { images.push(file.dataUrl.split(",")[1]); sections.push(`--- Image: ${source.name} / ${file.name} ---`); }
          else sections.push(`--- ${source.name} / ${file.name} ---\n${await fileText(file)}`);
        }
      }
      context = sections.join("\n\n");
      if (context.length > 1000000) throw new Error("Connected context exceeds 1 million characters. Select fewer sources.");
      if (abort.signal.aborted) return;
      setPhase("Loading model / waiting for first token");
      output = await generateText({ model, system: state.system, prompt: state.prompt + (context ? `\n\n<workspace-context>\n${context}\n</workspace-context>` : ""), temperature: state.temperature, jsonOutput: state.jsonOutput, images }, abort.signal, (text) => { output = text; if (active.current) setLiveOutput(text); }, (next) => { if (active.current) setPhase(next === "thinking" ? "Model is thinking" : "Generating answer"); });
    } catch (reason) {
      if (active.current) setError(abort.signal.aborted ? "Stopped. Partial output retained." : (reason as Error).message);
    } finally {
      if (active.current) {
        update({ ...stateRef.current, model, output, context });
        setLiveOutput(null); setBusy(false);
      }
      controller.current = null;
    }
  };
  return <div className="tool-workspace" onDoubleClick={(event) => event.stopPropagation()}>
    <div className="tool-toolbar"><strong>◈ Ollama</strong><span className="tool-badge">LOCAL AI</span><button disabled={refreshing} onClick={() => void refresh()}>{refreshing ? "Refreshing…" : "Refresh models"}</button></div>
    <div className="tool-scroll"><fieldset className="ollama-settings" disabled={busy}>
      <label className="tool-field">Model<select aria-label="Ollama model" value={state.model || models[0] || ""} onChange={(event) => update({ ...state, model: event.target.value })}><option value="" disabled>Choose an installed model</option>{[...new Set([...models, ...(state.model ? [state.model] : [])])].map((model) => <option key={model}>{model}</option>)}</select></label>
      {!models.length && <small className="tool-hint">Start Ollama locally, install a model with ollama pull, then refresh.</small>}
      <div className="tool-toolbar"><span>Presets</span>{Object.entries(PRESETS).map(([name, preset]) => <button key={name} onClick={() => update({ ...state, ...preset })}>{name}</button>)}</div>
      <label className="tool-field">Instructions<textarea aria-label="System instructions" value={state.system} onChange={(event) => update({ ...state, system: event.target.value })} /></label>
      <label className="tool-field">Prompt<textarea className="ollama-prompt" aria-label="Ollama prompt" placeholder="Ask a question, describe equations, or extract a table…" value={state.prompt} onChange={(event) => update({ ...state, prompt: event.target.value })} /></label>
      <div className="tool-toolbar"><label>Temperature {state.temperature.toFixed(2)} <input aria-label="Model temperature" type="range" min="0" max="2" step="0.05" value={state.temperature} onChange={(event) => update({ ...state, temperature: Number(event.target.value) })} /></label><label><input type="checkbox" checked={state.jsonOutput} onChange={(event) => update({ ...state, jsonOutput: event.target.checked })} /> JSON output</label></div>
      <section className="ollama-context"><strong>Connected context</strong>{sources.length ? sources.map((source) => <label key={source.id}><input type="checkbox" checked={state.sourceIds.includes(source.id)} onChange={(event) => update({ ...state, sourceIds: event.target.checked ? [...state.sourceIds, source.id] : state.sourceIds.filter((id) => id !== source.id) })} />{source.name}<small>{source.type === "content-source" ? `${source.contents.length} files (UTF-8)` : `${workspaceText(source).length.toLocaleString()} chars`}</small></label>) : <small>Wire a TextEditor, Data Table, Math Lab, or FileWorkspace → here.</small>}</section>
    </fieldset>
      <div className="tool-toolbar">{busy ? <button className="tool-primary" onClick={() => controller.current?.abort()}>Stop generation</button> : <button className="tool-primary" onClick={() => void run()}>▶ Run</button>}<span role="status">{busy ? `${phase} · ${elapsed}s` : "Runs only when you press Run"}</span></div>
      {error && <div className="tool-error" role="alert">{error}</div>}
      <div className="tool-toolbar"><strong>Output</strong><button disabled={busy || !state.output} onClick={() => downloadText(state.jsonOutput ? "response.json" : "response.txt", state.output)}>Save output ↓</button><button disabled={busy || !state.output} onClick={() => { void navigator.clipboard.writeText(state.output).catch(() => setError("Clipboard unavailable; use Save output")); }}>Copy</button></div>
      <pre className="ollama-output" aria-label="Model output" aria-busy={busy}>{busy ? liveOutput || `${phase}…\n\nThe answer will appear here as tokens arrive. First runs may take longer while the model loads.` : state.output || "Your model’s response will appear here."}</pre>
      <details className="tool-details"><summary>Context snapshot from last run · {state.context.length.toLocaleString()} chars</summary><pre>{state.context || "No connected context was used."}</pre></details>
      <small className="tool-hint">Wire this workspace → Math Lab, Data Table, TextEditor, or HTML Playground to use the completed output. Connected images require a vision-capable model.</small>
    </div><footer className="tool-footer" role="status">{busy ? `${phase} · ${elapsed}s` : status} · {(liveOutput ?? state.output).length.toLocaleString()} output chars</footer>
  </div>;
}
