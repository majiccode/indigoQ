"use client";

import { useRef, useState, type PointerEvent } from "react";
import { formatColour, hsvRGB, parseColour, replaceTokenValues, rounded, type SelectionToken } from "@/lib/selectionEditors";
import NumberField from "./NumberField";

type EditorProps = { token: SelectionToken; onChange: (replacement: string) => void };
const angleScale = (unit?: string) => unit?.toLowerCase() === "rad" ? 180 / Math.PI : unit?.toLowerCase() === "turn" ? 360 : unit?.toLowerCase() === "grad" ? 0.9 : 1;

function ColourEditor({ token, onChange }: EditorProps) {
  const colour = parseColour(token.raw)!;
  const rgb = hsvRGB(colour).map(Math.round);
  const change = (patch: Partial<typeof colour>) => onChange(formatColour(token.raw, { ...colour, ...patch }));
  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width * 2 - 1, y = (event.clientY - rect.top) / rect.height * 2 - 1;
    change({ h: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(x, y)) });
  };
  const radians = colour.h * Math.PI / 180;
  return <div className="selection-colour">
    <div className="selection-colour-wheel" aria-hidden="true" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); pick(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }}>
      <span style={{ left: `${50 + Math.cos(radians) * colour.s * 48}%`, top: `${50 + Math.sin(radians) * colour.s * 48}%` }} />
    </div>
    <div className="selection-controls">
      <div className="selection-colour-swatch"><span style={{ background: `rgba(${rgb.join(",")},${colour.a})` }} /></div>
      {([['Hue', 'h', 360], ['Saturation', 's', 1], ['Brightness', 'v', 1], ['Alpha', 'a', 1]] as const).map(([label, key, max]) => <label key={key}>{label}<input type="range" aria-label={`${token.label} ${label}`} min={0} max={max} step={max === 360 ? 1 : 0.001} value={colour[key]} onChange={(event) => change({ [key]: Number(event.target.value) })} /></label>)}
    </div>
  </div>;
}

function NumericEditor({ token, onChange }: EditorProps) {
  const value = token.values[0], angle = token.kind === "angle", scale = angleScale(token.unit);
  const [bounds] = useState(() => ({ min: value < 0 ? -Math.max(Math.abs(value) * 2, 1) : 0, max: Math.max(Math.abs(value) * 2, 1) }));
  const change = (next: number) => onChange(replaceTokenValues(token, [next]));
  const degrees = value * scale, radians = (degrees - 90) * Math.PI / 180;
  const dial = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
    change(((Math.atan2(y, x) * 180 / Math.PI + 450) % 360) / scale);
  };
  return <div className="selection-numeric">
    {angle ? <svg className="selection-angle" viewBox="0 0 100 100" aria-hidden="true" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dial(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) dial(event); }}>
      <circle cx="50" cy="50" r="42" fill="#20291e" stroke="#b997ef" strokeWidth="3" />
      <path d={`M50 50L${50 + Math.cos(radians) * 36} ${50 + Math.sin(radians) * 36}`} stroke="#e3d4fc" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="50" r="4" fill="#e3d4fc" />
    </svg> : <label className="editor-knob"><span className="editor-knob-face" style={{ background: `conic-gradient(from 220deg, #b997ef ${Math.max(0, Math.min(1, (value - bounds.min) / (bounds.max - bounds.min))) * 280}deg, #3c4938 0deg 280deg, transparent 0)` }}><span><i>{token.label}</i><strong>{rounded(value)}{token.unit}</strong></span><input aria-label={`Adjust ${token.label}`} type="range" min={Math.min(bounds.min, value)} max={Math.max(bounds.max, value)} step={token.raw.includes(".") || token.unit ? 0.001 : Math.abs(value) >= 10 ? 1 : 0.001} value={value} onChange={(event) => change(Number(event.target.value))} /></span></label>}
    <label className="selection-value">{token.unit || "Value"}<NumberField ariaLabel={`${token.label} value`} value={value} step="any" onChange={change} /></label>
    {angle && <><small>{rounded(degrees)}° · {rounded(degrees * Math.PI / 180)} rad</small><input type="range" aria-label={`${token.label} angle`} min={0} max={360} step={1} value={(degrees % 360 + 360) % 360} onChange={(event) => change(Number(event.target.value) / scale)} /></>}
  </div>;
}

function VectorEditor({ token, onChange }: EditorProps) {
  const xy = token.kind === "xy";
  const [bounds] = useState(() => {
    const radius = Math.max(1, ...token.values.map((value) => Math.abs(value) * 2));
    return token.values.every((value) => value >= 0 && value <= 1) ? { min: 0, max: 1 } : { min: -radius, max: radius };
  });
  const dragging = useRef<number | null>(null);
  const min = Math.min(bounds.min, ...token.values), max = Math.max(bounds.max, ...token.values), span = max - min;
  const change = (index: number, value: number) => onChange(replaceTokenValues(token, token.values.map((item, i) => i === index ? value : item)));
  const pick = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / rect.height));
    if (xy) onChange(replaceTokenValues(token, [min + x * span, min + y * span]));
    else if (dragging.current !== null) change(dragging.current, min + y * span);
  };
  const points = token.values.map((value, index) => `${token.values.length === 1 ? 50 : index / (token.values.length - 1) * 100},${100 - (value - min) / span * 100}`).join(" ");
  return <div className="selection-vector">
    <svg className={xy ? "selection-xy" : "selection-array"} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); if (!xy) { const rect = event.currentTarget.getBoundingClientRect(); dragging.current = Math.max(0, Math.min(token.values.length - 1, Math.round((event.clientX - rect.left) / rect.width * (token.values.length - 1)))); } pick(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event); }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
      {[25, 50, 75].map((p) => <path key={p} d={`M0 ${p}H100M${p} 0V100`} stroke="#52624a" strokeWidth="0.4" />)}
      {xy ? <circle cx={(token.values[0] - min) / span * 100} cy={100 - (token.values[1] - min) / span * 100} r="4" fill="#d5b9fc" /> : <><polyline points={points} fill="none" stroke="#b7d595" strokeWidth="1" />{token.values.map((value, index) => <circle key={index} cx={index / (token.values.length - 1) * 100} cy={100 - (value - min) / span * 100} r="1.8" fill="#d5b9fc" />)}</>}
    </svg>
    <div className="selection-vector-values">{token.values.map((value, index) => <label key={index}>{xy ? index === 0 ? "X" : "Y" : `[${index}]`}<NumberField ariaLabel={`${token.label} ${xy ? index === 0 ? "X" : "Y" : `point ${index + 1}`}`} value={value} step="any" onChange={(next) => change(index, next)} /><input type="range" aria-label={`Adjust ${token.label} point ${index + 1}`} min={min} max={max} step={span / 1000} value={value} onChange={(event) => change(index, Number(event.target.value))} /></label>)}</div>
    <small>{xy ? "Drag the point to set X and Y." : "Drag a curve point to adjust its value."}</small>
  </div>;
}

export default function SelectionEditors({ tokens, onChange }: { tokens: SelectionToken[]; onChange: (token: SelectionToken, replacement: string) => void }) {
  return <div className="editor-instrument-row">{tokens.map((token) => {
    const props = { token, onChange: (replacement: string) => onChange(token, replacement) };
    return <section className="selection-editor" key={`${token.from}-${token.kind}`} aria-label={`${token.label} visual editor`}>
      <header>{token.label}<small>{token.kind}</small></header>
      {token.kind === "colour" ? <ColourEditor {...props} /> : token.kind === "boolean" ? <button className="selection-toggle" type="button" role="switch" aria-label={`Toggle ${token.label}`} aria-checked={token.raw === "true"} onClick={() => props.onChange(token.raw === "true" ? "false" : "true")}><span />{token.raw}</button> : token.kind === "xy" || token.kind === "array" ? <VectorEditor {...props} /> : <NumericEditor {...props} />}
    </section>;
  })}</div>;
}
