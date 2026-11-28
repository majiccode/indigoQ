"use client";

import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import Image from "next/image";
import { connectedControls, useLiveRevision } from "@/lib/studioRuntime";
import { workspaceFiles, workspaceTable, workspaceText } from "@/lib/workspaceData";
import { MarkdownDocument } from "./DocumentWorkspace";
import { StudioShell, useStudio } from "./StudioKit";
import { isVideo } from "@/lib/media";
import VideoPreview from "./VideoPreview";

export default function DashboardWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "dashboard");
  useLiveRevision();
  const controls = connectedControls(props.graph, props.workspace.id);
  return <StudioShell kind="dashboard" status={app.status} actions={<button onClick={() => window.print()}>Print / PDF</button>}>
    <input className="dashboard-title" aria-label="Dashboard title" placeholder="My dashboard" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} />
    {!!Object.keys(controls).length && <div className="dashboard-metrics">{Object.entries(controls).map(([name, value]) => <div key={name}><small>{name}</small><strong>{typeof value === "number" ? Number(value.toFixed(3)) : String(value)}</strong></div>)}</div>}
    <div className="dashboard-grid">{app.sources.filter((source) => app.state.settings[`hide:${source.id}`] !== true).map((source) => {
      const table = workspaceTable(source, props.graph), files = workspaceFiles(source), text = workspaceText(source);
      const numeric = table?.rows.map((row) => [Number(row[0]), Number(row[1])]).filter((row) => row.every(Number.isFinite)) ?? [];
      const minX = Math.min(...numeric.map((row) => row[0])), maxX = Math.max(...numeric.map((row) => row[0])), minY = Math.min(...numeric.map((row) => row[1])), maxY = Math.max(...numeric.map((row) => row[1]));
      return <section className="dashboard-card" key={source.id}><header><a href={`/workspace?id=${encodeURIComponent(source.id)}`}>{source.name}</a><button aria-label={`Hide ${source.name}`} onClick={() => app.setting(`hide:${source.id}`, true)}>×</button></header>
        {numeric.length > 1 && <svg viewBox="0 0 400 150" className="studio-visual"><polyline stroke="#c8a4ff" fill="none" strokeWidth="2" points={numeric.map(([x, y]) => `${10 + (x - minX) / (maxX - minX || 1) * 380},${140 - (y - minY) / (maxY - minY || 1) * 130}`).join(" ")} /></svg>}
        {table ? <div className="data-table-container"><table className="data-table"><thead><tr>{table.columns.map((name, i) => <th key={i}>{name}</th>)}</tr></thead><tbody>{table.rows.slice(0, 10).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table><small>{table.rows.length} rows</small></div> : <MarkdownDocument text={text} />}
        {files.map((file) => isVideo(file) ? <VideoPreview key={`${file.id}-${file.dataUrl}`} file={file} /> : file.mimeType.startsWith("image/") ? <a key={file.id} href={file.dataUrl} download={file.name}><Image src={file.dataUrl} alt={file.name} width={600} height={400} unoptimized /></a> : file.mimeType.startsWith("audio/") ? <audio key={file.id} controls src={file.dataUrl} /> : <a key={file.id} href={file.dataUrl} download={file.name}>{file.name}</a>)}
      </section>;
    })}</div>
    {!app.sources.length && <p className="tool-hint">Connect any workspace → Dashboard to compose live tables, charts, Markdown, images, audio, video, and control metrics.</p>}
    <details className="tool-details"><summary>Visible cards</summary>{app.sources.map((source) => <label key={source.id}><input type="checkbox" checked={app.state.settings[`hide:${source.id}`] !== true} onChange={(event) => app.setting(`hide:${source.id}`, !event.target.checked)} />{source.name}</label>)}</details>
  </StudioShell>;
}
