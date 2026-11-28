"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceFiles, workspaceTable } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

const ASCII_RAMP = "@%#*+=-:. ";
const BRAILLE_BASE = 0x2800;
const BRAILLE_DOTS = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
];

function autoContrast(data: Uint8ClampedArray): { min: number; max: number } {
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  return { min, max };
}

function adjustPixel(data: Uint8ClampedArray, i: number, contrast: number, brightness: number, invert: boolean, acMin: number, acMax: number): number {
  let gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
  // Auto-contrast: stretch the image's own tonal range to 0..255
  const span = acMax - acMin;
  if (span > 0) gray = ((gray - acMin) / span) * 255;
  // Brightness: -100..100 -> offset -255..255
  gray += (brightness / 100) * 255;
  // Contrast: 0..200 -> factor around neutral 100
  const factor = contrast / 100;
  gray = 128 + (gray - 128) * factor;
  gray = Math.max(0, Math.min(255, gray));
  if (invert) gray = 255 - gray;
  return gray;
}

export function imageToAscii(data: Uint8ClampedArray, width: number, height: number, cols: number, contrast: number, brightness: number, invert: boolean): string {
  const ac = autoContrast(data);
  const rows = Math.max(1, Math.floor((height / width) * cols * 0.55));
  const cellW = width / cols;
  const cellH = height / rows;
  const lines: string[] = [];

  for (let y = 0; y < rows; y++) {
    let line = "";
    for (let x = 0; x < cols; x++) {
      let sum = 0, count = 0;
      const x0 = Math.floor(x * cellW), x1 = Math.min(width, Math.ceil((x + 1) * cellW));
      const y0 = Math.floor(y * cellH), y1 = Math.min(height, Math.ceil((y + 1) * cellH));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          sum += adjustPixel(data, (yy * width + xx) * 4, contrast, brightness, invert, ac.min, ac.max);
          count++;
        }
      }
      const avg = count ? sum / count : 0;
      const index = Math.floor((avg / 255) * (ASCII_RAMP.length - 1));
      line += ASCII_RAMP[index];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

export function imageToBraille(data: Uint8ClampedArray, width: number, height: number, cols: number, contrast: number, brightness: number, invert: boolean): string {
  const ac = autoContrast(data);
  const dotW = 2, dotH = 4;
  const brailleCols = Math.max(1, Math.floor(cols));
  const brailleRows = Math.max(1, Math.floor((height / width) * brailleCols * 0.55));
  const cellW = width / brailleCols;
  const cellH = height / brailleRows;
  const lines: string[] = [];

  for (let by = 0; by < brailleRows; by++) {
    let line = "";
    for (let bx = 0; bx < brailleCols; bx++) {
      let bits = 0;
      for (let dy = 0; dy < dotH; dy++) {
        for (let dx = 0; dx < dotW; dx++) {
           const cx = Math.floor((bx + (dx + 0.5) / dotW) * cellW);
           const cy = Math.floor((by + (dy + 0.5) / dotH) * cellH);
          if (cx < width && cy < height) {
            const g = adjustPixel(data, (cy * width + cx) * 4, contrast, brightness, invert, ac.min, ac.max);
            if (g < 128) {
              const [rowBits, colBits] = BRAILLE_DOTS[dy % 4];
              bits |= dx === 0 ? rowBits : colBits;
            }
          }
        }
      }
      line += String.fromCharCode(BRAILLE_BASE + bits);
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function tableToASCII(table: { columns: string[]; rows: string[][] }): string {
  const { columns, rows } = table;
  const numeric = columns.map((col, i) => {
    const values = rows.filter((row) => row[i]?.trim()).map((row) => Number(row[i])).filter((v) => Number.isFinite(v));
    return { col, min: Math.min(...values), max: Math.max(...values), values };
  }).filter((c) => c.values.length > 0);

  if (!numeric.length) {
    return columns.join(" | ") + "\n" + columns.map(() => "-").join("-|-") + "\n" + rows.slice(0, 20).map((row) => row.join(" | ")).join("\n");
  }

  const lines: string[] = ["Table sparklines (numeric columns):", ""];
  for (const { col, min, max, values } of numeric) {
    const span = max - min || 1;
    const spark = values.map((v) => {
      const pct = (v - min) / span;
      const index = Math.floor(pct * (ASCII_RAMP.length - 1));
      return ASCII_RAMP[ASCII_RAMP.length - 1 - index];
    }).join("");
    lines.push(`${col.padEnd(12)} ${min.toFixed(2)} ${spark} ${max.toFixed(2)}`);
  }
  return lines.join("\n");
}

type Mode = "image" | "table";
type Style = "ascii" | "braille";

export default function ASCIIArtWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "ascii-art");
  const { id: workspaceId } = props.workspace;
  const { onOperation } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const files = app.sources.flatMap(workspaceFiles).filter((file) => file.mimeType.startsWith("image/"));
  const tables = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "table");
  const outputs = connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((item) => item.type === "content-source");

  const [userMode, setUserMode] = useState<Mode | null>(null);
  const style: Style = app.state.settings.style === "braille" ? "braille" : "ascii";
  const cols = Math.max(20, Math.min(300, Math.round(Number(app.state.settings.cols) || 80)));
  const contrast = Number(app.state.settings.contrast ?? 125), brightness = Number(app.state.settings.brightness ?? 0);
  const invert = Boolean(app.state.settings.invert), fontSize = Number(app.state.settings.fontSize ?? 12);
  const [preview, setPreview] = useState<{ key: string; text: string; error?: string } | null>(null);
  const selectedFile = app.state.settings.file ? files.find((file) => file.id === app.state.settings.file) : files[0];
  const url = selectedFile?.dataUrl ?? "";
  const previewKey = JSON.stringify([url, style, cols, contrast, brightness, invert]);
  const table = tables[0];

  // Mode defaults to derived value, user can override via the select.
  const mode: Mode = userMode ?? (app.state.settings.mode === "image" || app.state.settings.mode === "table" ? app.state.settings.mode : files.length ? "image" : "table");
  const tablePreview = mode === "table" && table
    ? tableToASCII(workspaceTable(table, props.graph) ?? { columns: [], rows: [] })
    : "";

  // Image preview is async — setState inside img.onload callback is fine.
  useEffect(() => {
    if (mode !== "image") return;
    if (!url || !canvas.current) return;
    const target = canvas.current, ctx = target.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    let cancelled = false;
    img.onload = () => {
      if (cancelled) return;
      try {
      const factor = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
      const drawW = Math.max(1, Math.round(img.naturalWidth * factor));
      const drawH = Math.max(1, Math.round(img.naturalHeight * factor));
      target.width = drawW;
      target.height = drawH;
      target.style.width = `${drawW}px`;
      target.style.height = `${drawH}px`;
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, drawW, drawH);
      ctx.drawImage(img, 0, 0, drawW, drawH);
      const imageData = ctx.getImageData(0, 0, drawW, drawH);
      const art = style === "braille" ? imageToBraille(imageData.data, drawW, drawH, cols, contrast, brightness, invert) : imageToAscii(imageData.data, drawW, drawH, cols, contrast, brightness, invert);
      setPreview({ key: previewKey, text: art });
      } catch (reason) { setPreview({ key: previewKey, text: "", error: (reason as Error).message }); }
    };
    img.onerror = () => { if (!cancelled) setPreview({ key: previewKey, text: "", error: "Unable to load the connected image" }); };
    img.src = url;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [mode, url, style, cols, contrast, brightness, invert, previewKey]);

  const displayPreview = mode === "table" ? tablePreview : preview?.key === previewKey ? preview.text : "";
  const displaySourceName = mode === "table" ? (table ? table.name : "") : selectedFile?.name ?? "";

  const exportText = () => {
    if (!displayPreview.trim()) return;
    const blob = new Blob([displayPreview], { type: "text/plain" });
    const urlObj = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = urlObj;
    link.download = `${displaySourceName || "ascii"}.txt`;
    link.click();
    URL.revokeObjectURL(urlObj);
  };

  const publish = async () => {
    if (!displayPreview.trim()) return;
    const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(displayPreview)))}`;
    const name = `${displaySourceName || "ascii"}.txt`;
    app.patch({ output: displayPreview, files: [{ id: `${workspaceId}-ascii`, name, mimeType: "text/plain", size: new TextEncoder().encode(displayPreview).length, dataUrl }] });
    const failures: string[] = [];
    for (const output of outputs) {
      try { await onOperation({ kind: "saveFile", workspaceId: output.id, name, mimeType: "text/plain", dataUrl }); }
      catch (reason) { failures.push(`${output.name}: ${reason instanceof Error ? reason.message : "Unable to save"}`); }
    }
    if (failures.length) throw new Error(`TXT published, but saving to FileWorkspace failed for ${failures.join("; ")}`);
  };

  return <StudioShell kind="ascii-art" status={`${app.status} · ${displaySourceName}`} error={app.error || (preview?.key === previewKey ? preview.error : "")} actions={<>
    <button disabled={!displayPreview} onClick={() => void app.run(publish)}>Publish TXT</button>
    <button disabled={!displayPreview} onClick={exportText}>Download TXT</button>
  </>}>
    <div className="tool-toolbar">
      <select aria-label="Input mode" value={userMode ?? String(app.state.settings.mode ?? "")} onChange={(event) => { setUserMode(event.target.value ? event.target.value as Mode : null); app.setting("mode", event.target.value); }}>
        <option value="">Auto</option>
        <option value="image">Image → ASCII</option>
        <option value="table">Table → ASCII</option>
      </select>
      {mode === "image" && (
        <>
          <select aria-label="Connected image" value={String(app.state.settings.file ?? "")} onChange={(event) => app.setting("file", event.target.value)}>
            <option value="">Local / first image</option>
            {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
          </select>
          <select aria-label="Style" value={style} onChange={(event) => app.setting("style", event.target.value)} style={{ marginLeft: 8 }}>
            <option value="ascii">ASCII</option>
            <option value="braille">Braille</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>
            <input type="checkbox" checked={invert} onChange={(event) => app.setting("invert", event.target.checked)} /> Invert
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>
            Contrast <input type="range" min="0" max="200" step="1" value={contrast} onChange={(event) => app.setting("contrast", Number(event.target.value))} style={{ width: 70 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>
            Brightness <input type="range" min="-100" max="100" step="1" value={brightness} onChange={(event) => app.setting("brightness", Number(event.target.value))} style={{ width: 70 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>
            Cols <input type="number" min="20" max="300" value={cols} onChange={(event) => app.setting("cols", Math.max(20, Math.min(300, Number(event.target.value) || 80)))} style={{ width: 40 }} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>
            Size <input type="number" min="6" max="24" value={fontSize} onChange={(event) => app.setting("fontSize", Math.max(6, Math.min(24, Number(event.target.value) || 12)))} style={{ width: 35 }} />px
          </label>
        </>
      )}
      {mode === "table" && tables.length === 0 && <span style={{ fontSize: 11, color: "#bac9ae", marginLeft: 8 }}>No table source connected</span>}
    </div>
    <div className="ascii-layout">
      {mode === "image" && url && (
        <div className="ascii-image-panel">
          <canvas ref={canvas} className="ascii-image-canvas" />
        </div>
      )}
      <pre className="ascii-preview" style={{ fontSize: `${fontSize}px`, lineHeight: `${fontSize * 0.85}px` }} aria-label="ASCII art preview">{displayPreview || (mode === "image" ? "Connect an image file to render ASCII art." : "Connect a Data Table or Math Lab to render sparklines.")}</pre>
    </div>
    <small className="tool-hint">Wire FileWorkspace → here for images, or Data Table / Math Lab → here for tables. Output flows to Document Preview, Text to Speech, or any text consumer. Publish saves a .txt file into connected FileWorkspaces.</small>
  </StudioShell>;
}
