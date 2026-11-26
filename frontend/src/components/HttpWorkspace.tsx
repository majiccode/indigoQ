"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { studioRequest } from "@/lib/studioApi";
import { parseTable } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";
import NumberField from "./NumberField";

export default function HttpWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "http-client");
  const [polling, setPolling] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const send = async () => {
    abort.current = new AbortController();
    await app.run(async () => {
      const headers = JSON.parse(String(app.state.settings.headers ?? "{}"));
      if (!headers || typeof headers !== "object" || Array.isArray(headers) || !Object.values(headers).every((value) => typeof value === "string")) throw new Error("Headers must be a JSON object of strings");
      const response = await studioRequest("http", { url: String(app.state.settings.url ?? "http://127.0.0.1:8787/api/health"), method: String(app.state.settings.method ?? "GET"), headers, body: app.state.text }, abort.current?.signal);
      let table = null; try { table = parseTable(response.text); } catch {}
      app.patch({ output: response.text, table, settings: { ...app.state.settings, responseStatus: response.status, durationMs: response.durationMs, responseHeaders: JSON.stringify(response.headers, null, 2) } });
    });
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => { if (!abort.current || abort.current.signal.aborted) void sendRef.current(); }, Math.max(2, Number(app.state.settings.interval ?? 10)) * 1000);
    return () => clearInterval(timer);
  }, [polling, app.state.settings.interval]);
  // Mark completed requests available for the next polling tick.
  useEffect(() => { if (!app.busy) abort.current = null; }, [app.busy]);
  useEffect(() => () => abort.current?.abort(), []);
  return <StudioShell kind="http-client" status={`${app.status} · ${app.state.settings.responseStatus ?? "No response"} · ${app.state.settings.durationMs ?? 0} ms`} error={app.error}>
    <div className="tool-toolbar"><select aria-label="HTTP method" value={String(app.state.settings.method ?? "GET")} onChange={(event) => app.setting("method", event.target.value)}>{["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].map((method) => <option key={method}>{method}</option>)}</select><input aria-label="Request URL" className="studio-grow" value={String(app.state.settings.url ?? "http://127.0.0.1:8787/api/health")} onChange={(event) => app.setting("url", event.target.value)} /><button disabled={app.busy} onClick={() => void send()}>Send</button><button disabled={!app.busy} onClick={() => abort.current?.abort()}>Cancel</button></div>
    <label className="tool-field">Headers (JSON)<textarea value={String(app.state.settings.headers ?? "{}")} onChange={(event) => app.setting("headers", event.target.value)} /></label>
    <label className="tool-field">Request body<textarea value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></label>
    <div className="tool-toolbar"><label>Refresh interval (seconds)<NumberField ariaLabel="Refresh interval" min={2} value={Number(app.state.settings.interval ?? 10)} onChange={(n) => app.setting("interval", n)} /></label><button onClick={() => setPolling(!polling)}>{polling ? "Stop refresh" : "Start refresh"}</button></div>
    <details className="tool-details"><summary>Response headers</summary><pre>{String(app.state.settings.responseHeaders ?? "")}</pre></details><pre className="studio-output">{app.state.output || "Response appears here. Connect → Transform or Data Table."}</pre>
  </StudioShell>;
}
