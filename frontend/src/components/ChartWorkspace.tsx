"use client";

import { useRef, useState, type PointerEvent } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceTable, tableCSV, downloadText } from "@/lib/workspaceData";
import { axisValue, chartBounds, chartPoints, numericCell, selectedChartRows, type ChartKind, type ChartOptions } from "@/lib/chart";
import { StudioShell, useStudio } from "./StudioKit";
import NumberField from "./NumberField";

const COLOURS = ["#c8a4ff", "#9cdbbd", "#efbd78", "#80c7ed", "#f49cae", "#d4e78b"];
type Bounds = [number, number, number, number];
const PLOT = { left: 70, top: 45, width: 680, height: 330 };

export default function ChartWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "chart-studio");
  const svg = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState<{ key: string; bounds: Bounds } | null>(null);
  const [selection, setSelection] = useState<{ key: string; bounds: Bounds } | null>(null);
  const [brush, setBrush] = useState<Bounds | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ start: [number, number]; screen: [number, number]; bounds: Bounds; mode: "brush" | "pan" } | null>(null);
  const sources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "table");
  const source = app.state.settings.source ? sources.find((item) => item.id === app.state.settings.source) : sources[0];
  let table = null, error = "";
  try { table = source ? workspaceTable(source, props.graph) : null; } catch (reason) { error = (reason as Error).message; }
  const numeric = table?.columns.filter((_, index) => table!.rows.some((row) => numericCell(row[index]) !== null)) ?? [];
  const x = table?.columns.includes(String(app.state.settings.x)) ? String(app.state.settings.x) : table?.columns[0] ?? "";
  const y = table?.columns.includes(String(app.state.settings.y)) ? String(app.state.settings.y) : numeric.find((column) => column !== x) ?? numeric[0] ?? "";
  const options: ChartOptions = { kind: (app.state.settings.chart ?? "line") as ChartKind, x, y, series: String(app.state.settings.series ?? ""), bins: Number(app.state.settings.bins ?? 10), logX: app.state.settings.logX === true, logY: app.state.settings.logY === true };
  const xLabel = String(app.state.settings.xLabel || x), yLabel = String(app.state.settings.yLabel || (options.kind === "histogram" ? "Count" : y));
  const key = JSON.stringify([source?.id, table, options]);
  const points = table ? chartPoints(table, options) : [];
  const bounds = zoom?.key === key ? zoom.bounds : chartBounds(points, options.kind);
  const [minX, maxX, minY, maxY] = bounds;
  const sx = (value: number) => PLOT.left + (value - minX) / (maxX - minX) * PLOT.width;
  const sy = (value: number) => PLOT.top + (maxY - value) / (maxY - minY) * PLOT.height;
  const dataPoint = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const matrix = event.currentTarget.getScreenCTM();
    if (!matrix) return [minX, minY];
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [minX + (point.x - PLOT.left) / PLOT.width * (maxX - minX), maxY - (point.y - PLOT.top) / PLOT.height * (maxY - minY)];
  };
  const selected = selection?.key === key ? selectedChartRows(points, selection.bounds) : [];
  const hasSelection = selection?.key === key;
  const selectedSet = new Set(selected);
  const series = [...new Set(points.map((point) => point.series))];
  const colour = (name: string) => COLOURS[series.indexOf(name) % COLOURS.length];
  const categories = [...new Map(points.map((point) => [point.x, point.label])).entries()];
  const outputs = connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((item) => item.type === "content-source");
  const zoomBy = (factor: number) => {
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    setZoom({ key, bounds: [cx - (maxX - minX) * factor / 2, cx + (maxX - minX) * factor / 2, cy - (maxY - minY) * factor / 2, cy + (maxY - minY) * factor / 2] });
  };
  const publish = () => {
    if (!table) return;
    const result = { ...table, rows: hasSelection ? table.rows.filter((_, index) => selectedSet.has(index)) : table.rows };
    app.patch({ table: result, output: tableCSV(result) });
  };
  const exportPNG = () => app.run(async () => {
    if (!svg.current) return;
    const exported = svg.current.cloneNode(true) as SVGSVGElement;
    exported.setAttribute("width", "800"); exported.setAttribute("height", "450");
    const text = new XMLSerializer().serializeToString(exported);
    const url = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }));
    try {
      const image = new Image();
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("Unable to render chart image")); image.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = 1600; canvas.height = 900;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png"), name = "chart.png";
      const file = { id: `${props.workspace.id}-chart`, name, mimeType: "image/png", size: Math.floor(dataUrl.split(",")[1].length * 3 / 4), dataUrl };
      app.patch({ files: [file] });
      const link = document.createElement("a"); link.download = name; link.href = dataUrl; link.click();
      const failures: string[] = [];
      for (const output of outputs) {
        try { await props.onOperation({ kind: "saveFile", workspaceId: output.id, name, mimeType: "image/png", dataUrl }); }
        catch (reason) { failures.push(`${output.name}: ${(reason as Error).message}`); }
      }
      if (failures.length) throw new Error(failures.join("; "));
    } finally { URL.revokeObjectURL(url); }
  });
  const clipId = `chart-${props.workspace.id}`;
  const reference = String(app.state.settings.reference ?? "").trim();
  const referenceY = reference && Number.isFinite(Number(reference)) && (!options.logY || Number(reference) > 0) ? options.logY ? Math.log10(Number(reference)) : Number(reference) : null;
  return <StudioShell kind="chart-studio" status={`${app.status} · ${table?.rows.length ?? 0} rows · ${selected.length} selected`} error={app.error || error} actions={<><button disabled={!table} onClick={publish}>{hasSelection ? "Publish selected rows" : "Publish all rows"}</button><button disabled={!points.length || app.busy} onClick={() => void exportPNG()}>Export PNG</button></>}>
    <div className="tool-toolbar"><label>Table<select aria-label="Chart source" value={source?.id ?? ""} onChange={(event) => app.setting("source", event.target.value)}><option value="">First connected table</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Chart<select aria-label="Chart type" value={options.kind} onChange={(event) => app.setting("chart", event.target.value)}>{["line", "scatter", "bar", "histogram"].map((kind) => <option key={kind}>{kind}</option>)}</select></label>
      {(["x", "y"] as const).filter((axis) => axis === "x" || options.kind !== "histogram").map((axis) => <label key={axis}>{axis.toUpperCase()}<select aria-label={`Chart ${axis.toUpperCase()} column`} value={axis === "x" ? x : y} onChange={(event) => app.setting(axis, event.target.value)}>{(axis === "y" ? numeric : table?.columns ?? []).map((column, index) => <option key={`${index}-${column}`}>{column}</option>)}</select></label>)}
      {options.kind !== "histogram" && <label>Series<select aria-label="Chart series" value={options.series} onChange={(event) => app.setting("series", event.target.value)}><option value="">Single series</option>{table?.columns.map((column, index) => <option key={index}>{column}</option>)}</select></label>}
      {options.kind === "histogram" && <label>Bins<NumberField ariaLabel="Histogram bins" value={options.bins} min={1} max={100} onChange={(value) => app.setting("bins", Math.round(value))} /></label>}
    </div>
    <div className="tool-toolbar"><input aria-label="Chart title" placeholder="Chart title" value={String(app.state.settings.title ?? "")} onChange={(event) => app.setting("title", event.target.value)} />{(["X", "Y"] as const).map((axis) => <label key={axis}><input type="checkbox" disabled={axis === "X" && options.kind === "bar"} checked={axis === "X" ? options.logX : options.logY} onChange={(event) => app.setting(`log${axis}`, event.target.checked)} /> Log {axis}</label>)}<input aria-label="Y reference line" placeholder="Y reference line" value={reference} onChange={(event) => app.setting("reference", event.target.value)} /></div>
    <div className="tool-toolbar"><input aria-label="X axis label" placeholder={`X label: ${x}`} value={String(app.state.settings.xLabel ?? "")} onChange={(event) => app.setting("xLabel", event.target.value)} /><input aria-label="Y axis label" placeholder={`Y label: ${options.kind === "histogram" ? "Count" : y}`} value={String(app.state.settings.yLabel ?? "")} onChange={(event) => app.setting("yLabel", event.target.value)} /></div>
    <div className="tool-toolbar"><button disabled={!points.length} onClick={() => zoomBy(0.7)}>Zoom in</button><button disabled={!points.length} onClick={() => zoomBy(1.4)}>Zoom out</button><button onClick={() => setZoom(null)}>Reset view</button><button onClick={() => setSelection(null)}>Clear selection</button><select aria-label="Chart drag mode" value={String(app.state.settings.dragMode ?? "brush")} onChange={(event) => app.setting("dragMode", event.target.value)}><option value="brush">Drag to select</option><option value="pan">Drag to pan</option></select><button disabled={!points.length} onClick={() => svg.current && downloadText("chart.svg", new XMLSerializer().serializeToString(svg.current), "image/svg+xml")}>SVG ↓</button></div>
    <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" className="chart-studio-plot" role="img" aria-label={String(app.state.settings.title || `${options.kind} chart`)} onPointerDown={(event) => { if (event.button !== 0 || !points.length) return; const start = dataPoint(event); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { start, screen: [event.clientX, event.clientY], bounds, mode: app.state.settings.dragMode === "pan" || event.shiftKey ? "pan" : "brush" }; setHover(null); }} onPointerMove={(event) => {
      const [px, py] = dataPoint(event), active = drag.current;
      if (active) {
        if (active.mode === "pan") { const matrix = event.currentTarget.getScreenCTM(); if (!matrix) return; const start = new DOMPoint(...active.screen).matrixTransform(matrix.inverse()), end = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); const [x0, x1, y0, y1] = active.bounds; const dx = (end.x - start.x) / PLOT.width * (x1 - x0), dy = -(end.y - start.y) / PLOT.height * (y1 - y0); setZoom({ key, bounds: [x0 - dx, x1 - dx, y0 - dy, y1 - dy] }); }
        else setBrush([active.start[0], px, active.start[1], py]);
        return;
      }
      let nearest = -1, distance = 20;
      points.forEach((point, index) => { const d = Math.hypot((point.x - px) / (maxX - minX) * PLOT.width, (point.y - py) / (maxY - minY) * PLOT.height); if (d < distance) { distance = d; nearest = index; } }); setHover(nearest < 0 ? null : nearest);
    }} onPointerUp={(event) => { const active = drag.current; if (active?.mode === "brush") { const end = dataPoint(event); setSelection({ key, bounds: [active.start[0], end[0], active.start[1], end[1]] }); } drag.current = null; setBrush(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; setBrush(null); }} onPointerLeave={() => setHover(null)}>
      <rect width="800" height="450" fill="#131b20" /><text x="400" y="25" textAnchor="middle" fill="#e4ebdf" fontSize="16" fontFamily="sans-serif">{String(app.state.settings.title || source?.name || "Chart Studio")}</text>
      <defs><clipPath id={clipId}><rect x={PLOT.left} y={PLOT.top} width={PLOT.width} height={PLOT.height} /></clipPath></defs>
      {Array.from({ length: 6 }, (_, index) => { const vx = minX + index / 5 * (maxX - minX), vy = minY + index / 5 * (maxY - minY); return <g key={index}><path d={`M${sx(vx)} ${PLOT.top}V${PLOT.top + PLOT.height}M${PLOT.left} ${sy(vy)}H${PLOT.left + PLOT.width}`} stroke="#35423d" /><text x={sx(vx)} y="395" textAnchor="middle" fill="#b4c5b5" fontSize="11" fontFamily="sans-serif">{options.kind === "bar" ? "" : axisValue(vx, options.logX)}</text><text x="62" y={sy(vy) + 4} textAnchor="end" fill="#b4c5b5" fontSize="11" fontFamily="sans-serif">{axisValue(vy, options.logY)}</text></g>; })}
      {options.kind === "bar" && categories.filter((_, index) => index % Math.max(1, Math.ceil(categories.length / 12)) === 0).map(([value, label]) => <text key={value} x={sx(value)} y="395" textAnchor="middle" fill="#b4c5b5" fontSize="11" fontFamily="sans-serif">{label.slice(0, 12)}</text>)}
      <text x="400" y="420" textAnchor="middle" fill="#d4e0cf" fontSize="12" fontFamily="sans-serif">{xLabel}</text><text transform="translate(18 210) rotate(-90)" textAnchor="middle" fill="#d4e0cf" fontSize="12" fontFamily="sans-serif">{yLabel}</text>
      <g clipPath={`url(#${clipId})`}>
        {referenceY !== null && <path d={`M${PLOT.left} ${sy(referenceY)}H750`} stroke="#efbd78" strokeDasharray="6 4" />}
        {options.kind === "line" && series.map((name) => <polyline key={name} fill="none" stroke={colour(name)} strokeWidth="2" points={points.filter((point) => point.series === name).sort((a, b) => a.x - b.x).map((point) => `${sx(point.x)},${sy(point.y)}`).join(" ")} />)}
        {points.map((point, index) => { const active = point.rows.some((row) => selectedSet.has(row)); const fill = active ? "#fff" : colour(point.series); const dim = selected.length && !active ? 0.3 : 0.9;
          if (options.kind === "bar" || options.kind === "histogram") { const width = options.kind === "histogram" ? sx(point.x1!) - sx(point.x0!) : PLOT.width / (maxX - minX) * 0.75 / Math.max(1, series.length); const left = options.kind === "histogram" ? sx(point.x0!) : sx(point.x) - width * series.length / 2 + series.indexOf(point.series) * width; const base = sy(0); return <rect key={index} x={left} y={Math.min(sy(point.y), base)} width={Math.max(1, width - 1)} height={Math.max(1, Math.abs(base - sy(point.y)))} fill={fill} opacity={dim}><title>{point.label}: {axisValue(point.y, options.logY)}</title></rect>; }
          return <circle key={index} cx={sx(point.x)} cy={sy(point.y)} r={hover === index ? 6 : 3.5} fill={fill} opacity={dim}><title>{point.series}: {point.label}, {axisValue(point.y, options.logY)}</title></circle>;
        })}
        {(brush || (selection?.key === key ? selection.bounds : null)) && (() => { const box = brush ?? selection!.bounds; return <rect x={sx(Math.min(box[0], box[1]))} y={sy(Math.max(box[2], box[3]))} width={Math.abs(sx(box[0]) - sx(box[1]))} height={Math.abs(sy(box[2]) - sy(box[3]))} fill="#c8a4ff22" stroke="#c8a4ff" strokeDasharray="4 3" />; })()}
      </g>
      <text x="70" y="443" fill="#b4c5b5" fontSize="11" fontFamily="sans-serif">{hover !== null && points[hover] ? `${points[hover].series} · ${points[hover].label} · ${axisValue(points[hover].y, options.logY)}` : `${points.length} plotted marks · ${selected.length} selected rows`}</text>
    </svg>
    <div className="chart-legend">{series.slice(0, 24).map((name) => <span key={name}><i style={{ background: colour(name) }} />{name}</span>)}</div>
    {!!points.length && <small className="tool-hint">Reading {source?.name}: X = {x}{options.kind !== "histogram" ? `, Y = ${y}` : ""}. Edit your Data Table to update this chart. Choose Export PNG to save an image.</small>}
    {!points.length && <p className="tool-hint">Connect Data Table, SQL, Simulation or Math Lab → Chart Studio, then choose numeric columns. Empty, non-numeric and invalid logarithmic values are omitted.</p>}
    <small className="tool-hint">Drag to brush rows; Shift-drag pans. Publish creates a saved table snapshot for Data Table, SQL, Ollama or Dashboard. PNG export also saves chart.png to outgoing FileWorkspaces.</small>
  </StudioShell>;
}
