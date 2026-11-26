"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceFiles } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

export default function ImageWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "image-studio");
  const canvas = useRef<HTMLCanvasElement>(null);
  const [local, setLocal] = useState(String(app.state.settings.local ?? ""));
  const [dimensions, setDimensions] = useState([0, 0]);
  const [pixel, setPixel] = useState("");
  const files = app.sources.flatMap(workspaceFiles).filter((file) => file.mimeType.startsWith("image/"));
  const url = files.find((file) => file.id === app.state.settings.file)?.dataUrl ?? local;
  const width = Number(app.state.settings.width ?? 600), height = Number(app.state.settings.height ?? 400);
  const cropX = Number(app.state.settings.cropX ?? 0), cropY = Number(app.state.settings.cropY ?? 0), cropW = Number(app.state.settings.cropW ?? 100), cropH = Number(app.state.settings.cropH ?? 100);
  const brightness = Number(app.state.settings.brightness ?? 100), contrast = Number(app.state.settings.contrast ?? 100), saturation = Number(app.state.settings.saturation ?? 100);
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
      ctx.clearRect(0, 0, width, height); ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
      ctx.drawImage(image, image.width * cropX / 100, image.height * cropY / 100, image.width * Math.min(cropW, 100 - cropX) / 100, image.height * Math.min(cropH, 100 - cropY) / 100, 0, 0, width, height);
      ctx.filter = "none";
      if (annotation) { ctx.font = `${Math.max(14, width / 25)}px sans-serif`; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#fff"; ctx.strokeText(annotation, 12, height - 20); ctx.fillText(annotation, 12, height - 20); }
    };
    image.src = url;
    return () => { active = false; };
  }, [url, width, height, cropX, cropY, cropW, cropH, brightness, contrast, saturation, annotation]);
  return <StudioShell kind="image-studio" status={`${app.status} · source ${dimensions.join(" × ")} · ${pixel}`} error={app.error} actions={<button disabled={!url} onClick={() => void app.run(() => {
    const target = canvas.current; if (!target) return;
    const dataUrl = target.toDataURL("image/png");
    app.patch({ files: [{ id: `${props.workspace.id}-image`, name: "edited.png", mimeType: "image/png", size: Math.floor((dataUrl.length - dataUrl.indexOf(",") - 1) * 3 / 4), dataUrl }], output: JSON.stringify({ width, height, sourceWidth: dimensions[0], sourceHeight: dimensions[1] }) });
  })}>Publish PNG</button>}>
    <div className="tool-toolbar"><select aria-label="Connected image" value={String(app.state.settings.file ?? "")} onChange={(event) => app.setting("file", event.target.value)}><option value="">Local image</option>{files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><input type="file" aria-label="Open image" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { setLocal(String(reader.result)); app.patch({ settings: { ...app.state.settings, local: String(reader.result), file: "" } }); }; reader.readAsDataURL(file); }} /></div>
    <canvas className="image-preview" ref={canvas} onPointerMove={(event) => { const target = canvas.current; if (!target) return; const rect = target.getBoundingClientRect(); const x = Math.min(target.width - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * target.width))), y = Math.min(target.height - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * target.height))); const rgba = target.getContext("2d")?.getImageData(x, y, 1, 1).data; if (rgba) setPixel(`${x},${y}: rgba(${[...rgba].join(",")})`); }} />
    <div className="tool-toolbar">{[["width", width, 1, 4096], ["height", height, 1, 4096], ["cropX", cropX, 0, 99], ["cropY", cropY, 0, 99], ["cropW", cropW, 1, 100], ["cropH", cropH, 1, 100], ["brightness", brightness, 0, 200], ["contrast", contrast, 0, 200], ["saturation", saturation, 0, 200]].map(([name, value, min, max]) => <label key={name}>{name}<input type="number" value={value} min={min} max={max} onChange={(event) => { const n = event.target.valueAsNumber; if (Number.isFinite(n) && n >= Number(min) && n <= Number(max)) app.setting(String(name), n); }} /></label>)}</div>
    <label className="tool-field">Annotation<input value={annotation} onChange={(event) => app.patch({ text: event.target.value })} /></label>{app.state.files?.map((file) => <a key={file.id} download={file.name} href={file.dataUrl}>Download PNG</a>)}
    <small className="tool-hint">Crop values are percentages. Hover to inspect pixels. Publish PNG exposes the edited image to connected Ollama, Image Studio, and Dashboard workspaces.</small>
  </StudioShell>;
}
