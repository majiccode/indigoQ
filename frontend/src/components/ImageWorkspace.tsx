"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceFiles } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";
import { parseColour, hsvRGB, formatColour } from "@/lib/selectionEditors";

const DEFAULT_TINT = "#c8a4ff";

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number | "any";
  unit: string;
  onChange: (value: number) => void;
}

function Knob({ label, value, min, max, step, unit, onChange }: KnobProps) {
  const pct = (value - min) / (max - min);
  const face = `conic-gradient(from 220deg, #b997ef ${Math.max(0, Math.min(1, pct)) * 280}deg, #3c4938 0deg 280deg, transparent 0)`;
  return (
    <label className="editor-knob" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 90 }}>
      <span className="editor-knob-face" style={{ background: face }}>
        <span>
          <i>{label}</i><strong>{String(Number(value.toFixed(2)))} {unit}</strong>
          <input type="range" min={String(min)} max={String(max)} step={String(step)} value={String(value)} onChange={(event) => onChange(Number(event.target.value))} />
        </span>
      </span>
    </label>
  );
}

function ColourPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const colour = parseColour(value) ?? { h: 0, s: 1, v: 1, a: 1 };
  const rgb = hsvRGB(colour).map(Math.round);
  const radians = (colour.h * Math.PI) / 180;
  const change = (patch: Partial<typeof colour>) => onChange(formatColour(value, { ...colour, ...patch }));
  const pick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 2 - 1;
    const y = (event.clientY - rect.top) / rect.height * 2 - 1;
    change({ h: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(x, y)) });
  };
  return (
    <div className="selection-colour" style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <div className="selection-colour-wheel" aria-hidden="true" style={{ width: 120, height: 120 }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }}
        onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}>
        <span style={{ left: `${50 + Math.cos(radians) * colour.s * 48}%`, top: `${50 + Math.sin(radians) * colour.s * 48}%` }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, width: 150 }}>
        <div className="selection-colour-swatch" style={{ height: 24 }}
          ><span style={{ background: `rgba(${rgb.join(",")},${colour.a})` }} /></div>
        {([["Hue", "h", 360, 1], ["Sat", "s", 1, 0.001], ["Val", "v", 1, 0.001]] as const).map(([label, key, max, step]) => (
          <label key={label} style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10, color: "#bac9ae" }}>
            {label}<input type="range" min="0" max={String(max)} step={String(step)} value={String(colour[key])} onChange={(event) => change({ [key]: Number(event.target.value) })} />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function ImageWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "image-studio");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [local, setLocal] = useState(String(app.state.settings.local ?? ""));
  const [dimensions, setDimensions] = useState([0, 0]);
  const [pixel, setPixel] = useState("");
  const files = app.sources.flatMap(workspaceFiles).filter((file) => file.mimeType.startsWith("image/"));
  const outputs = connectedWorkspaces(props.graph, props.workspace.id, "outgoing", "files").filter((item) => item.type === "content-source");
  const url = files.find((file) => file.id === app.state.settings.file)?.dataUrl ?? local;
  const width = Number(app.state.settings.width ?? 600), height = Number(app.state.settings.height ?? 400);
  const cropX = Number(app.state.settings.cropX ?? 0), cropY = Number(app.state.settings.cropY ?? 0), cropW = Number(app.state.settings.cropW ?? 100), cropH = Number(app.state.settings.cropH ?? 100);
  const brightness = Number(app.state.settings.brightness ?? 100), contrast = Number(app.state.settings.contrast ?? 100), saturation = Number(app.state.settings.saturation ?? 100);
  const blur = Number(app.state.settings.blur ?? 0), grayscale = Number(app.state.settings.grayscale ?? 0), invert = Number(app.state.settings.invert ?? 0);
  const sepia = Number(app.state.settings.sepia ?? 0), hueRotate = Number(app.state.settings.hueRotate ?? 0), opacity = Number(app.state.settings.opacity ?? 100);
  const tintEnabled = app.state.settings.tintEnabled === true || app.state.settings.tintEnabled === "true";
  const tint = String(app.state.settings.tint ?? DEFAULT_TINT);
  const tintAmount = Number(app.state.settings.tintAmount ?? 50);
  const annotation = app.state.text;
  useEffect(() => {
    if (!url) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      setDimensions([image.naturalWidth, image.naturalHeight]);
      const target = canvas.current, ctx = target?.getContext("2d"); if (!target || !ctx) return;
      target.width = width; target.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) blur(${blur}px) grayscale(${grayscale}%) invert(${invert}%) sepia(${sepia}%) hue-rotate(${hueRotate}deg) opacity(${opacity}%)`;
      ctx.drawImage(image, image.width * cropX / 100, image.height * cropY / 100, image.width * Math.min(cropW, 100 - cropX) / 100, image.height * Math.min(cropH, 100 - cropY) / 100, 0, 0, width, height);
      ctx.filter = "none";
      if (tintEnabled && tint) {
        const parsed = parseColour(tint);
        if (parsed) {
          const rgb = hsvRGB(parsed).map(Math.round);
          ctx.globalCompositeOperation = "multiply";
          ctx.fillStyle = `rgba(${rgb.join(",")},${tintAmount / 100})`;
          ctx.fillRect(0, 0, width, height);
          ctx.globalCompositeOperation = "source-over";
        }
      }
      if (annotation) { ctx.font = `${Math.max(14, width / 25)}px sans-serif`; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#fff"; ctx.strokeText(annotation, 12, height - 20); ctx.fillText(annotation, 12, height - 20); }
    };
    image.src = url;
    return () => { active = false; };
  }, [url, width, height, cropX, cropY, cropW, cropH, brightness, contrast, saturation, blur, grayscale, invert, sepia, hueRotate, opacity, tintEnabled, tint, tintAmount, annotation]);
  return <StudioShell kind="image-studio" status={`${app.status} · source ${dimensions ? dimensions.join(" × ") : "-- × --"} · ${pixel}`} error={app.error} actions={<button disabled={!url} onClick={() => void app.run(async () => {
    const target = canvas.current; if (!target) return;
    const dataUrl = target.toDataURL("image/png"), name = "edited.png";
    app.patch({ files: [{ id: `${props.workspace.id}-image`, name, mimeType: "image/png", size: Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4), dataUrl }], output: JSON.stringify({ width, height, sourceWidth: dimensions[0], sourceHeight: dimensions[1] }) });
    const failures: string[] = [];
    for (const output of outputs) {
      try { await props.onOperation({ kind: "saveFile", workspaceId: output.id, name, mimeType: "image/png", dataUrl }); }
      catch (reason) { failures.push(`${output.name}: ${reason instanceof Error ? reason.message : "Unable to save"}`); }
    }
    if (failures.length) throw new Error(`PNG published, but saving to FileWorkspace failed for ${failures.join("; ")}`);
  })}>Publish PNG</button>}>
    <div className="image-layout">
      <div className="image-canvas-area">
        <div className="tool-toolbar"><select aria-label="Connected image" value={String(app.state.settings.file ?? "")} onChange={(event) => app.setting("file", event.target.value)}><option value="">Local image</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><input type="file" aria-label="Open image" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { setLocal(String(reader.result)); app.patch({ settings: { ...app.state.settings, local: String(reader.result), file: "" } }); }; reader.readAsDataURL(file); }} /></div>
        <canvas className="image-preview" ref={canvas} onPointerMove={(event) => { const target = canvas.current; if (!target) return; const rect = target.getBoundingClientRect(); const x = Math.min(target.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * target.width))), y = Math.min(target.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * target.height))); const rgba = target.getContext("2d")?.getImageData(x, y, 1, 1).data; if (rgba) setPixel(`${x},${y}: rgba(${[...rgba].join(",")})`); }} />
      </div>
      <div className="image-panel">
        <div className="image-panel-group">
          <Knob label="Width" value={width} min={1} max={4096} step={1} unit="px" onChange={(n) => app.setting("width", n)} />
          <Knob label="Height" value={height} min={1} max={4096} step={1} unit="px" onChange={(n) => app.setting("height", n)} />
        </div>
        <div className="image-panel-group">
          <Knob label="Crop X" value={cropX} min={0} max={99} step={1} unit="%" onChange={(n) => app.setting("cropX", n)} />
          <Knob label="Crop Y" value={cropY} min={0} max={99} step={1} unit="%" onChange={(n) => app.setting("cropY", n)} />
          <Knob label="Crop W" value={cropW} min={1} max={100} step={1} unit="%" onChange={(n) => app.setting("cropW", n)} />
          <Knob label="Crop H" value={cropH} min={1} max={100} step={1} unit="%" onChange={(n) => app.setting("cropH", n)} />
        </div>
        <div className="image-panel-group">
          <Knob label="Brightness" value={brightness} min={0} max={200} step={1} unit="%" onChange={(n) => app.setting("brightness", n)} />
          <Knob label="Contrast" value={contrast} min={0} max={200} step={1} unit="%" onChange={(n) => app.setting("contrast", n)} />
          <Knob label="Saturation" value={saturation} min={0} max={200} step={1} unit="%" onChange={(n) => app.setting("saturation", n)} />
        </div>
        <div className="image-panel-group">
          <Knob label="Blur" value={blur} min={0} max={20} step={0.5} unit="px" onChange={(n) => app.setting("blur", n)} />
          <Knob label="Grayscale" value={grayscale} min={0} max={100} step={1} unit="%" onChange={(n) => app.setting("grayscale", n)} />
          <Knob label="Invert" value={invert} min={0} max={100} step={1} unit="%" onChange={(n) => app.setting("invert", n)} />
          <Knob label="Sepia" value={sepia} min={0} max={100} step={1} unit="%" onChange={(n) => app.setting("sepia", n)} />
          <Knob label="Hue rotate" value={hueRotate} min={0} max={360} step={1} unit="deg" onChange={(n) => app.setting("hueRotate", n)} />
          <Knob label="Opacity" value={opacity} min={0} max={100} step={1} unit="%" onChange={(n) => app.setting("opacity", n)} />
        </div>
        <div className="image-tint">
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#bac9ae", marginBottom: 6 }}>
            <input type="checkbox" checked={tintEnabled} onChange={(event) => app.setting("tintEnabled", event.target.checked)} /> Tint
          </label>
          <ColourPicker value={tint} onChange={(next) => app.setting("tint", next)} />
          <label style={{ display: "flex", justifyContent: "space-between", gap: 6, fontSize: 10, color: "#bac9ae", marginTop: 8 }}>
            Amount<input type="range" min="0" max="100" step={String(tintAmount)} value={String(tintAmount)} onChange={(event) => app.setting("tintAmount", Number(event.target.value))} />
          </label>
        </div>
        <label className="tool-field" style={{ marginBottom: 0 }}>
          Annotation
          <input value={annotation} onChange={(event) => app.patch({ text: event.target.value })} style={{ marginTop: 6 }} />
        </label>
        {app.state.files?.map((file) => <a key={file.id} className="tool-field" download={file.name} href={file.dataUrl} style={{ fontSize: 11, color: "#c8a4ff", display: "block", marginTop: 8 }}>Download {file.name}</a>)}
      </div>
    </div>
    <small className="tool-hint">Crop values are percentages. Hover to inspect pixels. Publish PNG exposes the edited image to connected Ollama, Image Studio, and Dashboard workspaces, and saves edited.png into any connected FileWorkspace.</small>
  </StudioShell>;
}
