"use client";

import { useCallback, useRef, useState } from "react";
import CanvasBoard, { type CanvasBoardHandle } from "./CanvasBoard";
import { parseGraphFile, serializeGraph } from "@/lib/graphFile";
import { downloadText } from "@/lib/workspaceData";

const EXAMPLES = [
  { file: "oscillator-lab", name: "Oscillator Lab", description: "Editor equations → live knobs and plots → sampled table." },
  { file: "measurements", name: "Measured vs. Model", description: "CSV files → editable table → scatter overlay on a mathematical model." },
  { file: "chart-studio", name: "Chart Studio", description: "Weekly sales → interactive charts → selected rows and PNG exports." },
  { file: "local-ai", name: "Local AI Studio", description: "Ollama → editable equations → Math Lab, plus JSON extraction → Data Table." },
  { file: "voice-to-ollama", name: "Voice to Ollama", description: "Live microphone spectrum → speech transcription → dictated Ollama prompts." },
  { file: "voice-expense-detective", name: "Voice Expense Detective", description: "Dictate purchases → AI extracts records → SQL totals → spending charts and evidence." },
  { file: "interactive-studio", name: "Interactive Studio", description: "Shared controls, simulations, timeline, HTML playground, audio, and dashboard." },
  { file: "data-workbench", name: "Data Workbench", description: "HTTP, JSON transforms, SQL aggregation, Markdown reports, and comparisons." },
  { file: "research-media", name: "Research & Media", description: "Document retrieval, model comparisons, image editing, and local vision AI." },
];

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 32 32" width="21" height="21">
        <path
          d="M16 4.8 26.2 16 16 27.2 5.8 16 16 4.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m19.8 19.8 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function IndigoQApp() {
  const board = useRef<CanvasBoardHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const about = useRef<HTMLDialogElement>(null);
  const onReady = useCallback(() => setReady(true), []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setMessage(""); setError(false);
    try { await action(); }
    catch (reason) { setMessage((reason as Error).message); setError(true); }
    finally { setBusy(false); }
  };
  const load = async (text: string, name: string) => {
    const graph = parseGraphFile(text);
    if (!board.current) throw new Error("Canvas is not ready yet");
    await board.current.load(graph);
    setMessage(`Loaded ${name}`);
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" aria-label="About indigoQ" onClick={() => about.current?.showModal()}>
          <BrandMark />
          <div className="brand-copy">
            <span className="brand-name">
              indigo<span className="brand-q">Q</span>
            </span>
            <span className="brand-sub">workspace canvas</span>
          </div>
        </button>
        <div className="topbar-meta">
          <nav className="graph-file-actions" aria-label="Graph files" onKeyDown={(event) => { if (event.key === "Escape") setExamplesOpen(false); }}>
            <button title="Replace the current canvas with a saved JSON graph" disabled={!ready || busy} onClick={() => fileInput.current?.click()}>Load JSON</button>
            <button disabled={!ready || busy} onClick={() => void run(async () => {
              if (!board.current) return;
              const graph = await board.current.snapshot();
              downloadText(`indigoq-${new Date().toISOString().slice(0, 10)}.json`, serializeGraph(graph), "application/json");
              setMessage("Graph saved as JSON");
            })}>Save JSON</button>
            <div className="graph-examples">
              <button disabled={!ready || busy} aria-expanded={examplesOpen} onClick={() => setExamplesOpen(!examplesOpen)}>Examples ▾</button>
              {examplesOpen && <><button className="graph-menu-dismiss" aria-label="Close examples" onClick={() => setExamplesOpen(false)} /><div className="graph-examples-menu" aria-label="Example graphs">
                <p>Load an example to replace the current canvas. Save JSON to keep your graph.</p>
                {EXAMPLES.map((example) => <div key={example.file}><button onClick={() => {
                  setExamplesOpen(false);
                  void run(async () => {
                    const response = await fetch(`/examples/${example.file}.json`);
                    if (!response.ok) throw new Error("Unable to load example graph");
                    await load(await response.text(), example.name);
                  });
                }}><strong>{example.name}</strong><small>{example.description}</small></button><a href={`/examples/${example.file}.json`} download>JSON ↓</a></div>)}
              </div></>}
            </div>
          </nav>
          <input ref={fileInput} hidden aria-label="Load graph JSON file" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void run(async () => load(await file.text(), file.name));
          }} />
        </div>
      </header>
      <dialog ref={about} className="about-dialog" aria-labelledby="about-title" onClick={(event) => { if (event.target === event.currentTarget) about.current?.close(); }}>
        <div className="about-dialog-content"><button type="button" className="about-close" aria-label="Close about indigoQ" onClick={() => about.current?.close()}>×</button>
          <BrandMark /><h2 id="about-title">indigoQ</h2><p>© {new Date().getFullYear()} Paul Adams</p>
          <a href="https://github.com/majiccode" target="_blank" rel="noopener noreferrer">github.com/majiccode ↗</a>
        </div>
      </dialog>
      {(message || busy) && <div className={`graph-file-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}><span>{busy ? "Working…" : message}</span>{!busy && <button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button>}</div>}
      <CanvasBoard ref={board} onReady={onReady} />
    </div>
  );
}
