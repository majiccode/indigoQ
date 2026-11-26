"use client";

import { useEffect, useRef, useState } from "react";
import type { TableState } from "@/lib/types";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { connectedControls, useLiveRevision } from "@/lib/studioRuntime";
import { workspaceTable, workspaceText } from "@/lib/workspaceData";
import { StudioShell, SourceSelect, sourceText, useStudio } from "./StudioKit";

const BRIDGE = `<script>window.indigoQ={publish(value){parent.postMessage({type:'indigoq:output',value},'*')}};addEventListener('message',e=>{if(e.source!==parent||e.data?.type!=='indigoq:input')return;window.indigoQ.input=e.data.value;dispatchEvent(new CustomEvent('indigoq:input',{detail:e.data.value}))});parent.postMessage({type:'indigoq:ready'},'*');</script>`;
export default function PlaygroundWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "playground");
  const frame = useRef<HTMLIFrameElement>(null);
  const [document, setDocument] = useState(app.state.text);
  const [frameReady, setFrameReady] = useState(0);
  const [published, setPublished] = useState<{ text?: string; table?: TableState } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  useLiveRevision();
  const controls = connectedControls(props.graph, props.workspace.id);
  const data = app.sources.map((source) => ({ id: source.id, name: source.name, text: workspaceText(source), table: workspaceTable(source, props.graph) }));
  const inputJSON = JSON.stringify({ controls, sources: data });
  useEffect(() => { frame.current?.contentWindow?.postMessage({ type: "indigoq:input", value: JSON.parse(inputJSON) }, "*"); }, [inputJSON, frameReady]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "indigoq:ready") { setFrameReady((n) => n + 1); return; }
      if (event.data?.type !== "indigoq:output") return;
      try {
        const value = event.data.value;
        if (!value || JSON.stringify(value).length > 1000000) throw new Error("Published output must be under 1 MB");
        const next: { text?: string; table?: TableState } = {};
        if (typeof value.text === "string") next.text = value.text;
        if (value.table) {
          const table = value.table;
          if (!Array.isArray(table.columns) || table.columns.length > 100 || !table.columns.every((v: unknown) => typeof v === "string") || !Array.isArray(table.rows) || table.rows.length > 10000 || !table.rows.every((row: unknown) => Array.isArray(row) && row.length === table.columns.length && row.every((cell) => ["number", "string", "boolean"].includes(typeof cell)))) throw new Error("Invalid published table");
          next.table = { kind: "data-table", columns: table.columns, rows: table.rows.map((row: unknown[]) => row.map(String)) };
        }
        setPublished(next); setLogs((lines) => [...lines.slice(-9), "Received output. Click Accept output to publish it to the graph."]);
      } catch (error) { setLogs((lines) => [...lines.slice(-9), (error as Error).message]); }
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, []);
  return <StudioShell kind="playground" status={app.status} error={app.error} actions={<button onClick={() => setDocument(app.state.text)}>Run preview</button>}>
    <SourceSelect sources={app.sources} value={String(app.state.settings.source ?? "")} onChange={(id) => app.setting("source", id)} />
    <button onClick={() => { const text = sourceText(app.sources, app.state.settings.source, app.state.text).trim().replace(/^```[^\n]*\n/, "").replace(/\n```$/, ""); app.patch({ text }); setDocument(text); }}>Import connected HTML</button>
    <textarea className="studio-code" aria-label="HTML CSS JavaScript" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} spellCheck={false} />
    <iframe ref={frame} title="Sandboxed application preview" className="playground-frame" sandbox="allow-scripts" srcDoc={BRIDGE + document} />
    <div className="tool-toolbar"><button disabled={!published} onClick={() => { if (published) app.patch({ output: published.text ?? app.state.output, table: published.table ?? app.state.table }); }}>Accept output</button></div>
    {!!logs.length && <pre className="studio-output">{logs.join("\n")}</pre>}
    <small className="tool-hint">Sandboxed HTML/CSS/JS. Receive controls and data with {"window.addEventListener('indigoq:input', e => …)"}. Publish with indigoQ.publish({`{text, table: {columns, rows}}`}). Output is accepted explicitly.</small>
  </StudioShell>;
}
