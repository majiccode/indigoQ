"use client";

import { useCallback, useRef, useState } from "react";
import CanvasBoard, { type CanvasBoardHandle } from "./CanvasBoard";
import { parseGraphFile, serializeGraph } from "@/lib/graphFile";
import { downloadText } from "@/lib/workspaceData";
import { exportGraph } from "@/lib/graphApi";

const EXAMPLES = [
  { file: "pdf-read-aloud", name: "PDF Read-aloud", description: "Start here: sample PDF → document preview → speech. No AI setup needed." },
  { file: "chart-studio", name: "Chart Studio", description: "Start here: edit a table, explore a chart, and export PNG." },
  { file: "structured-data", name: "Notes to Structured Data", description: "Start here: notes → Ollama → validated JSON → editable records. Sample response included." },
  { file: "creative-workshop", name: "Creative Workshop", description: "Circuits, 3D models and scenes, ASCII art, ambient controls, and USB debugging." },
  { file: "oscillator-lab", name: "Oscillator Lab", description: "Editor equations → live knobs and plots → sampled table." },
  { file: "measurements", name: "Measured vs. Model", description: "CSV files → editable table → scatter overlay on a mathematical model." },
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
  const help = useRef<HTMLDialogElement>(null);
  const starters = useRef<HTMLDialogElement>(null);
  const [starterHint, setStarterHint] = useState(false);
  const fileMenu = useRef<HTMLDivElement>(null);
  const onReady = useCallback(() => {
    setReady(true);
    try { setStarterHint(localStorage.getItem("indigoq.starters.dismissed") !== "1"); } catch { setStarterHint(true); }
  }, []);
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
  const loadExample = (example: typeof EXAMPLES[number]) => run(async () => {
    const response = await fetch(`/examples/${example.file}.json`);
    if (!response.ok) throw new Error("Unable to load example graph. Check the app connection and try again.");
    await load(await response.text(), example.name);
    starters.current?.close();
    setStarterHint(false);
  });
  const dismissStarterHint = () => {
    setStarterHint(false);
    try { localStorage.setItem("indigoq.starters.dismissed", "1"); } catch { /* Dismiss for this session when storage is unavailable. */ }
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <button type="button" className="brand" aria-label="About indigoQ" onClick={() => about.current?.showModal()}>
            <BrandMark />
            <div className="brand-copy">
              <span className="brand-name">
                indigo<span className="brand-q">Q</span>
              </span>
              <span className="brand-sub">workspace canvas</span>
            </div>
          </button>
          <span className="brand-copyright">© {new Date().getFullYear()} Paul Adams</span>
        </div>
        <div className="topbar-meta">
          <nav className="graph-file-actions" aria-label="App tools" onKeyDown={(event) => event.stopPropagation()}>
            <button className="starter-button" type="button" disabled={!ready || busy} aria-haspopup="dialog" onClick={() => starters.current?.showModal()}>Start here</button>
            <button type="button" className="topbar-icon" aria-label="Graph files" title="Graph files" popoverTarget="graph-file-menu">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z" />
              </svg>
            </button>
            <div ref={fileMenu} id="graph-file-menu" className="graph-file-menu" popover="auto" onToggle={(event) => { if (event.newState === "closed") setExamplesOpen(false); }}>
              <button title="Replace the current canvas with a saved JSON graph" disabled={!ready || busy} onClick={() => { fileMenu.current?.hidePopover(); fileInput.current?.click(); }}>Load JSON</button>
              <button disabled={!ready || busy} onClick={() => { fileMenu.current?.hidePopover(); void run(async () => {
                if (!board.current) return;
                const graph = await exportGraph(await board.current.snapshot());
                downloadText(`indigoq-${new Date().toISOString().slice(0, 10)}.json`, serializeGraph(graph), "application/json");
                setMessage("Graph saved as JSON");
              }); }}>Save JSON</button>
              <div className="graph-examples">
                <button disabled={!ready || busy} aria-expanded={examplesOpen} aria-controls="graph-examples-menu" onClick={() => setExamplesOpen(!examplesOpen)}>Examples <span aria-hidden>{examplesOpen ? "▴" : "▾"}</span></button>
                {examplesOpen && <div id="graph-examples-menu" className="graph-examples-menu" aria-label="Example graphs">
                  <p>New here? Try one of the first three workflows. Each has a Start here guide. Load replaces the current canvas; Save JSON keeps your graph.</p>
                  {EXAMPLES.map((example) => <div key={example.file}><button onClick={() => {
                    setExamplesOpen(false);
                    fileMenu.current?.hidePopover();
                    void loadExample(example);
                  }}><strong>{example.name}</strong><small>{example.description}</small></button><a href={`/examples/${example.file}.json`} download>JSON ↓</a></div>)}
                </div>}
              </div>
            </div>
            <button type="button" className="topbar-icon" aria-label="Help" title="Help" aria-haspopup="dialog" onClick={() => help.current?.showModal()}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 5 .3c0 1.7-2.5 2-2.5 3.7" /><path d="M12 16.5h.01" />
              </svg>
            </button>
          </nav>
          <input ref={fileInput} hidden aria-label="Load graph JSON file" type="file" accept=".json,application/json" onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void run(async () => load(await file.text(), file.name));
          }} />
        </div>
      </header>
      {starterHint && <aside className="starter-hint" aria-label="Getting started"><span>New to indigoQ? Try one useful connection.</span><button disabled={busy} onClick={() => starters.current?.showModal()}>Choose a starter</button><button aria-label="Dismiss getting started" onClick={dismissStarterHint}>×</button></aside>}
      <dialog ref={starters} className="about-dialog starter-dialog" aria-labelledby="starter-title" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { if (event.target === event.currentTarget && !busy) starters.current?.close(); }}>
        <div className="help-dialog-content"><button className="about-close" disabled={busy} aria-label="Close starter workflows" onClick={() => starters.current?.close()}>×</button><h2 id="starter-title">Make your first connection</h2><p>Choose one task. Each starter includes sample input and a Start here guide.</p>
          <div className="starter-cards">{EXAMPLES.slice(0, 3).map((example, i) => <article key={example.file}><span className="tool-badge">{i === 2 ? "Sample output included · Ollama optional to explore" : "No AI setup"}</span><h3>{example.name}</h3><p>{example.description.replace("Start here: ", "")}</p><button disabled={!ready || busy} onClick={() => void loadExample(example)}>Load {example.name}</button></article>)}</div>
          <p>Loading replaces your current canvas. Save it first if you want to keep it.</p><button disabled={!ready || busy} onClick={() => void run(async () => { if (!board.current) return; const graph = await exportGraph(await board.current.snapshot()); downloadText("indigoq-before-starter.json", serializeGraph(graph), "application/json"); setMessage("Current graph saved. Choose a starter when ready."); })}>Save current graph first</button>
          {busy && <p role="status">Loading…</p>}{error && message && <p role="alert" className="tool-error">{message}</p>}
          <p>Open workspaces with the magnifying glass. Connections show where data comes from; Run, Import, and Publish produce results explicitly.</p>
        </div>
      </dialog>
      <dialog ref={about} className="about-dialog" aria-labelledby="about-title" onClick={(event) => { if (event.target === event.currentTarget) about.current?.close(); }}>
        <div className="about-dialog-content"><button type="button" className="about-close" aria-label="Close about indigoQ" onClick={() => about.current?.close()}>×</button>
          <BrandMark /><h2 id="about-title">indigoQ</h2><p>© {new Date().getFullYear()} Paul Adams</p>
          <a href="https://github.com/majiccode" target="_blank" rel="noopener noreferrer">github.com/majiccode ↗</a>
        </div>
      </dialog>
      <dialog ref={help} className="about-dialog help-dialog" aria-labelledby="help-title" onKeyDown={(event) => event.stopPropagation()} onClick={(event) => { if (event.target === event.currentTarget) help.current?.close(); }}>
        <div className="help-dialog-content">
          <button type="button" className="about-close" aria-label="Close Help" onClick={() => help.current?.close()}>×</button>
          <h2 id="help-title">Help</h2>
          <h3>Try one useful workflow</h3>
          <p>Open Graph files → Examples. Start with <strong>PDF Read-aloud</strong>, <strong>Chart Studio</strong>, or <strong>Notes to Structured Data</strong>. Each includes instructions and sample input. Use the workspace magnifying glass for a comfortable fullscreen view.</p>
          <p>Canvas controls & keyboard shortcuts</p>
          <dl className="help-shortcuts">
            <div><dt><kbd>Right-drag empty space</kbd></dt><dd>Create a workspace</dd></div>
            <div><dt><kbd>Left-drag empty space</kbd></dt><dd>Pan the canvas</dd></div>
            <div><dt><kbd>⌘</kbd> + left-drag</dt><dd>Draw a rectangle to zoom to that area</dd></div>
            <div><dt><kbd>Space</kbd> + drag</dt><dd>Pan the canvas</dd></div>
            <div><dt><kbd>Scroll empty canvas</kbd></dt><dd>Zoom in / out at the cursor</dd></div>
            <div><dt><kbd>⌘ / Ctrl</kbd> + scroll</dt><dd>Zoom the canvas</dd></div>
            <div><dt><kbd>Drag corner</kbd></dt><dd>Resize a workspace</dd></div>
            <div><dt><kbd>Drag header</kbd></dt><dd>Move a workspace</dd></div>
            <div><dt><kbd>Drag border</kbd></dt><dd>Connect workspaces</dd></div>
            <div><dt><kbd>Double-click body</kbd></dt><dd>Open a workspace</dd></div>
            <div><dt><kbd>Double-click header</kbd></dt><dd>Rename a workspace</dd></div>
            <div><dt><kbd>Delete</kbd></dt><dd>Remove the selected workspace</dd></div>
            <div><dt><kbd>Enter</kbd></dt><dd>Rename the selected workspace</dd></div>
            <div><dt><kbd>+</kbd> / <kbd>−</kbd></dt><dd>Zoom in / out</dd></div>
            <div><dt><kbd>0</kbd></dt><dd>Fit the canvas to view</dd></div>
            <div><dt><kbd>Escape</kbd></dt><dd>Cancel the current action</dd></div>
          </dl>
        </div>
      </dialog>
      {(message || busy) && <div className={`graph-file-message${error ? " is-error" : ""}`} role={error ? "alert" : "status"}><span>{busy ? "Working…" : message}</span>{!busy && <button aria-label="Dismiss message" onClick={() => setMessage("")}>×</button>}</div>}
      <CanvasBoard ref={board} onReady={onReady} />
    </div>
  );
}
