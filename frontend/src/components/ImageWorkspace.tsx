"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceFiles } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";
import { parseColour, hsvRGB, formatColour } from "@/lib/selectionEditors";

const DEFAULT_TINT = "#c8a4ff";

type ArtisticFilter = "none" | "sobel" | "emboss" | "posterize" | "oil" | "watercolour" | "pastel" | "threshold" | "sharpen" | "pixelate" | "vignette" | "pencil" | "charcoal" | "solarize" | "comic" | "lensFlare" | "radialBlur";

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

function sobelEdge(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  const out = new Uint8ClampedArray(data.length);
  const kx = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const ky = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const scale = Math.max(0.1, strength / 25);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const ki = (dy + 1) * 3 + (dx + 1);
          gx += gray * kx[ki];
          gy += gray * ky[ki];
        }
      }
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy) * scale);
      const idx = (y * width + x) * 4;
      out[idx] = mag; out[idx + 1] = mag; out[idx + 2] = mag; out[idx + 3] = 255;
    }
  }
  // Keep original borders untouched.
  out.set(data.subarray(0, width * 4), 0);
  out.set(data.subarray((height - 1) * width * 4), (height - 1) * width * 4);
  for (let y = 0; y < height; y++) {
    out[(y * width) * 4 + 3] = data[(y * width) * 4 + 3];
    out[(y * width + width - 1) * 4 + 3] = data[(y * width + width - 1) * 4 + 3];
  }
  return out;
}

function emboss(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  const out = new Uint8ClampedArray(data.length);
  const kx = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
  const ky = [-2, -1, 0, -1, 1, 1, 0, 1, 2];
  const scale = Math.max(0.1, strength / 25);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const ki = (dy + 1) * 3 + (dx + 1);
          gx += gray * kx[ki];
          gy += gray * ky[ki];
        }
      }
      const val = Math.min(255, Math.max(0, 128 + (gx + gy) * scale));
      const idx = (y * width + x) * 4;
      out[idx] = val; out[idx + 1] = val; out[idx + 2] = val; out[idx + 3] = 255;
    }
  }
  out.set(data.subarray(0, width * 4), 0);
  out.set(data.subarray((height - 1) * width * 4), (height - 1) * width * 4);
  for (let y = 0; y < height; y++) {
    out[(y * width) * 4 + 3] = data[(y * width) * 4 + 3];
    out[(y * width + width - 1) * 4 + 3] = data[(y * width + width - 1) * 4 + 3];
  }
  return out;
}

function threshold(data: Uint8ClampedArray, level: number) {
  const t = Math.max(0, Math.min(255, level));
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const v = gray > t ? 255 : 0;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  }
}

function sharpen(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
  const scale = Math.max(0, strength / 50);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const i = ((y + dy) * width + (x + dx)) * 4 + c;
            acc += data[i] * kernel[(dy + 1) * 3 + (dx + 1)];
          }
        }
        const idx = (y * width + x) * 4 + c;
        data[idx] = Math.min(255, Math.max(0, Math.round(data[idx] + acc * scale)));
      }
    }
  }
}

function pixelate(data: Uint8ClampedArray, width: number, height: number, blockSize: number) {
  const bs = Math.max(1, blockSize);
  for (let y = 0; y < height; y += bs) {
    for (let x = 0; x < width; x += bs) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let dy = 0; dy < bs && y + dy < height; dy++) {
        for (let dx = 0; dx < bs && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; count++;
        }
      }
      const ar = sr / count, ag = sg / count, ab = sb / count;
      for (let dy = 0; dy < bs && y + dy < height; dy++) {
        for (let dx = 0; dx < bs && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          data[i] = ar; data[i + 1] = ag; data[i + 2] = ab;
        }
      }
    }
  }
}

function vignette(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  const cx = width / 2, cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  const s = Math.max(0, strength) / 100;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
      const factor = 1 - Math.min(1, dist * dist * s);
      const idx = (y * width + x) * 4;
      data[idx] = Math.round(data[idx] * factor);
      data[idx + 1] = Math.round(data[idx + 1] * factor);
      data[idx + 2] = Math.round(data[idx + 2] * factor);
    }
  }
}

function pencilDrawing(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  // Grayscale + edge emphasis via Sobel-like difference between neighbor and current.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (dy === -1 && dx === -1) gx -= gray; gy -= gray;
          if (dy === -1 && dx === 0) gy -= 2 * gray;
          if (dy === -1 && dx === 1) gx += gray; gy -= gray;
          if (dy === 0 && dx === -1) gx -= 2 * gray;
          if (dy === 0 && dx === 1) gx += 2 * gray;
          if (dy === 1 && dx === -1) gx -= gray; gy += gray;
          if (dy === 1 && dx === 0) gy += 2 * gray;
          if (dy === 1 && dx === 1) gx += gray; gy += gray;
        }
      }
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy) * (strength / 25));
      const idx = (y * width + x) * 4;
      const inv = 255 - mag;
      data[idx] = inv; data[idx + 1] = inv; data[idx + 2] = inv;
    }
  }
}

function charcoal(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  // Edge sketch on dark background.
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (dx === -1) gx -= gray; if (dx === 1) gx += gray;
          if (dy === -1) gy -= gray; if (dy === 1) gy += gray;
        }
      }
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy) * (strength / 20));
      const idx = (y * width + x) * 4;
      const v = mag > strength ? 255 : 0;
      data[idx] = v; data[idx + 1] = v; data[idx + 2] = v;
    }
  }
}

function solarize(data: Uint8ClampedArray, level: number) {
  const t = Math.max(0, Math.min(255, level * 2.55));
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const v = gray > t ? 255 - gray : gray;
    data[i] = v; data[i + 1] = v; data[i + 2] = v;
  }
}

function comic(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  // Halftone dots + strong edges.
  const dots = Math.max(2, Math.floor(strength / 8));
  for (let y = 0; y < height; y += dots) {
    for (let x = 0; x < width; x += dots) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let dy = 0; dy < dots && y + dy < height; dy++) {
        for (let dx = 0; dx < dots && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; count++;
        }
      }
      const ar = sr / count, ag = sg / count, ab = sb / count;
      for (let dy = 0; dy < dots && y + dy < height; dy++) {
        for (let dx = 0; dx < dots && x + dx < width; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const dist = Math.sqrt((dx - dots / 2) ** 2 + (dy - dots / 2) ** 2);
          const radius = Math.min(ar, ag, ab) / 255 * (dots / 2) * (strength / 50);
          if (dist <= radius) {
            data[i] = ar; data[i + 1] = ag; data[i + 2] = ab;
          } else {
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
          }
        }
      }
    }
  }
  // Edge overlay.
  const edge = new Uint8ClampedArray(data.length);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (dx === -1) gx -= gray; if (dx === 1) gx += gray;
          if (dy === -1) gy -= gray; if (dy === 1) gy += gray;
        }
      }
      const idx = (y * width + x) * 4;
      const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      edge[idx] = mag; edge[idx + 1] = mag; edge[idx + 2] = mag; edge[idx + 3] = 255;
    }
  }
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, data[i] + edge[i] * 0.5);
    data[i + 1] = Math.min(255, data[i + 1] + edge[i + 1] * 0.5);
    data[i + 2] = Math.min(255, data[i + 2] + edge[i + 2] * 0.5);
  }
}

function radialBlur(data: Uint8ClampedArray, width: number, height: number, strength: number, cx: number, cy: number) {
  const out = new Uint8ClampedArray(data.length);
  const samples = Math.max(2, Math.floor(strength / 5));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dirX = dist === 0 ? 0 : dx / dist;
      const dirY = dist === 0 ? 0 : dy / dist;
      const maxBlur = dist * (strength / 100);
      for (let s = 0; s <= samples; s++) {
        const t = s / samples;
        const blurDist = t * maxBlur;
        const sx = Math.max(0, Math.min(width - 1, cx + dirX * (dist - blurDist)));
        const sy = Math.max(0, Math.min(height - 1, cy + dirY * (dist - blurDist)));
        const i = (Math.round(sy) * width + Math.round(sx)) * 4;
        sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; count++;
      }
      const idx = (y * width + x) * 4;
      out[idx] = sr / count; out[idx + 1] = sg / count; out[idx + 2] = sb / count; out[idx + 3] = 255;
    }
  }
  return out;
}

function drawLensFlare(ctx: CanvasRenderingContext2D, width: number, height: number, cx: number, cy: number, strength: number) {
  const s = Math.max(0, strength) / 100;
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.6);
  grad.addColorStop(0, `rgba(255, 240, 200, ${0.6 * s})`);
  grad.addColorStop(0.2, `rgba(255, 200, 100, ${0.3 * s})`);
  grad.addColorStop(0.5, `rgba(255, 150, 50, ${0.15 * s})`);
  grad.addColorStop(1, "rgba(255, 150, 50, 0)");
  ctx.fillStyle = grad;
  ctx.globalCompositeOperation = "screen";
  ctx.fillRect(0, 0, width, height);
  // Streaks
  ctx.strokeStyle = `rgba(255, 240, 200, ${0.4 * s})`;
  ctx.lineWidth = 2;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * Math.max(width, height), cy + Math.sin(a) * Math.max(width, height));
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}


function posterize(data: Uint8ClampedArray, levels: number) {
  const step = Math.max(1, Math.floor(256 / Math.max(2, levels)));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
}

function oilPaint(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(1, Math.min(5, radius));
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      const bins: { r: number; g: number; b: number; count: number }[] = [];
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          const cr = data[i], cg = data[i + 1], cb = data[i + 2];
          let found = -1;
          for (let b = 0; b < bins.length; b++) {
            if (bins[b].r === cr && bins[b].g === cg && bins[b].b === cb) { found = b; break; }
          }
          if (found >= 0) bins[found].count++;
          else bins.push({ r: cr, g: cg, b: cb, count: 1 });
        }
      }
      let best = bins[0];
      for (let b = 1; b < bins.length; b++) if (bins[b].count > best.count) best = bins[b];
      const idx = (y * width + x) * 4;
      out[idx] = best.r; out[idx + 1] = best.g; out[idx + 2] = best.b; out[idx + 3] = 255;
    }
  }
  out.set(data.subarray(0, width * 4), 0);
  out.set(data.subarray((height - 1) * width * 4), (height - 1) * width * 4);
  for (let y = 0; y < height; y++) {
    out[(y * width) * 4 + 3] = data[(y * width) * 4 + 3];
    out[(y * width + width - 1) * 4 + 3] = data[(y * width + width - 1) * 4 + 3];
  }
  return out;
}

function watercolour(data: Uint8ClampedArray, width: number, height: number, strength: number) {
  const out = new Uint8ClampedArray(data.length);
  const r = Math.max(1, Math.floor(strength / 20));
  for (let y = r; y < height - r; y++) {
    for (let x = r; x < width - r; x++) {
      let sr = 0, sg = 0, sb = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const i = ((y + dy) * width + (x + dx)) * 4;
          sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; count++;
        }
      }
      const idx = (y * width + x) * 4;
      out[idx] = sr / count; out[idx + 1] = sg / count; out[idx + 2] = sb / count; out[idx + 3] = 255;
    }
  }
  out.set(data.subarray(0, width * 4), 0);
  out.set(data.subarray((height - 1) * width * 4), (height - 1) * width * 4);
  for (let y = 0; y < height; y++) {
    out[(y * width) * 4 + 3] = data[(y * width) * 4 + 3];
    out[(y * width + width - 1) * 4 + 3] = data[(y * width + width - 1) * 4 + 3];
  }
  return out;
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
  const artisticFilter = String(app.state.settings.artisticFilter ?? "none") as ArtisticFilter;
  const filterStrength = Number(app.state.settings.filterStrength ?? 50);
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

      if (artisticFilter !== "none") {
        const imageData = ctx.getImageData(0, 0, width, height);
        let processed: Uint8ClampedArray | null = null;
        if (artisticFilter === "sobel") processed = sobelEdge(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "emboss") processed = emboss(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "oil") processed = oilPaint(imageData.data, width, height, Math.max(1, Math.floor(filterStrength / 10)));
        else if (artisticFilter === "watercolour") processed = watercolour(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "posterize" || artisticFilter === "pastel") posterize(imageData.data, Math.max(2, Math.floor(filterStrength / 10)));
        else if (artisticFilter === "threshold") threshold(imageData.data, filterStrength * 2.55);
        else if (artisticFilter === "sharpen") sharpen(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "pixelate") pixelate(imageData.data, width, height, Math.max(1, Math.floor(filterStrength / 2)));
        else if (artisticFilter === "vignette") vignette(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "pencil") pencilDrawing(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "charcoal") charcoal(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "solarize") solarize(imageData.data, filterStrength);
        else if (artisticFilter === "comic") comic(imageData.data, width, height, filterStrength);
        else if (artisticFilter === "radialBlur") processed = radialBlur(imageData.data, width, height, filterStrength, width / 2, height / 2);
        if (processed) imageData.data.set(processed);
        ctx.putImageData(imageData, 0, 0);
        if (artisticFilter === "lensFlare") {
          drawLensFlare(ctx, width, height, width / 2, height / 2, filterStrength);
        }
      }

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
  }, [url, width, height, cropX, cropY, cropW, cropH, brightness, contrast, saturation, blur, grayscale, invert, sepia, hueRotate, opacity, tintEnabled, tint, tintAmount, artisticFilter, filterStrength, annotation]);
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
        <div className="image-artistic">
          <label className="tool-field" style={{ marginBottom: 6, fontSize: 11, color: "#bac9ae" }}>Artistic filter</label>
          <select aria-label="Artistic filter" value={artisticFilter} onChange={(event) => app.setting("artisticFilter", event.target.value)} style={{ width: "100%", marginBottom: 8 }}>
            <option value="none">None</option>
            <option value="sobel">Sobel Edge</option>
            <option value="emboss">Emboss</option>
            <option value="posterize">Posterize</option>
            <option value="oil">Oil painting</option>
            <option value="watercolour">Watercolour</option>
            <option value="pastel">Pastels</option>
            <option value="threshold">Threshold</option>
            <option value="sharpen">Sharpen</option>
            <option value="pixelate">Pixelate</option>
            <option value="vignette">Vignette</option>
            <option value="lensFlare">Lens Flare</option>
            <option value="radialBlur">Radial Blur</option>
          </select>
          <Knob label="Strength" value={filterStrength} min={0} max={100} step={1} unit="%" onChange={(n) => app.setting("filterStrength", n)} />
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
