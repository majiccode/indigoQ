"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceText } from "@/lib/workspaceData";
import { appendedText, SpeechQueue } from "@/lib/readAloud";
import { StudioShell, useStudio } from "./StudioKit";

export default function ReadAloudWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "text-to-speech");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  // Following is a playback session, never restored automatically from a graph.
  const [follow, setFollow] = useState(false);
  const [error, setError] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const queue = useRef<SpeechQueue<SpeechSynthesisUtterance> | null>(null);
  const settings = useRef(app.state.settings);
  const baseline = useRef({ source: "", text: "" });
  const sources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "text");
  const source = app.state.settings.source ? sources.find((s) => s.id === app.state.settings.source) : sources[0];
  const text = source ? workspaceText(source) : "";
  const voice = String(app.state.settings.ttsVoice ?? "");
  const rate = Math.max(0.5, Math.min(2, Number(app.state.settings.ttsRate) || 1));
  const pitch = Math.max(0, Math.min(2, Number(app.state.settings.ttsPitch ?? 1)));
  useEffect(() => { settings.current = app.state.settings; }, [app.state.settings]);
  useEffect(() => {
    if (!("speechSynthesis" in window)) { const timer = setTimeout(() => setAvailable(false), 0); return () => clearTimeout(timer); }
    const synth = window.speechSynthesis;
    const refresh = () => { setAvailable(true); setVoices(synth.getVoices()); };
    // The initial list can be empty; voiceschanged supplies asynchronously loaded voices.
    synth.addEventListener("voiceschanged", refresh);
    const timer = setTimeout(refresh, 0);
    queue.current = new SpeechQueue(synth, (chunk) => {
      const u = new SpeechSynthesisUtterance(chunk);
      const chosen = String(settings.current.ttsVoice ?? "");
      const selected = synth.getVoices().find((v) => v.voiceURI === chosen || v.name === chosen);
      if (selected) { u.voice = selected; u.lang = selected.lang; }
      u.rate = Math.max(0.5, Math.min(2, Number(settings.current.ttsRate) || 1));
      u.pitch = Math.max(0, Math.min(2, Number(settings.current.ttsPitch ?? 1)));
      return u;
    }, (busy) => { setSpeaking(busy); if (!busy) setPaused(false); }, setError);
    return () => { clearTimeout(timer); synth.removeEventListener("voiceschanged", refresh); queue.current?.dispose(); queue.current = null; };
  }, []);
  useEffect(() => {
    const previous = baseline.current;
    baseline.current = { source: source?.id ?? "", text };
    if (previous.source !== (source?.id ?? "")) { queue.current?.stop(); return; }
    if (previous.text && !text.startsWith(previous.text)) { queue.current?.stop(); return; }
    if (follow) queue.current?.enqueue(appendedText(previous.text, text));
  }, [text, source?.id, follow]);
  const stop = () => { queue.current?.stop(); setFollow(false); setPaused(false); };
  const supported = available === true;
  return <StudioShell kind="text-to-speech" status={`${app.status} · ${speaking ? paused ? "Paused" : "Speaking" : follow ? "Waiting for new text" : "Ready"}`} error={error || app.error}>
    <label className="tool-field">Text source<select aria-label="Speech text source" value={String(app.state.settings.source ?? "")} onChange={(e) => { stop(); app.setting("source", e.target.value); }}><option value="">First connected text source</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    {!supported && <p className="tool-hint">{available === null ? "Speech playback requires browser speech synthesis. Controls become available when voices load." : "Speech synthesis is unavailable in this browser."}</p>}
    <label className="tool-field">Voice<select aria-label="TTS voice" value={voice} disabled={!supported} onChange={(e) => app.setting("ttsVoice", e.target.value)}><option value="">Default browser voice</option>{voice && !voices.some((v) => v.voiceURI === voice || v.name === voice) && <option value={voice}>{voice} (unavailable; using default)</option>}{voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select></label>
    <div className="tool-toolbar"><label>Rate <input aria-label="Speech rate" type="range" min="0.5" max="2" step="0.1" value={rate} onChange={(e) => app.setting("ttsRate", Number(e.target.value))} /><output>{rate}×</output></label><label>Pitch <input aria-label="Speech pitch" type="range" min="0" max="2" step="0.1" value={pitch} onChange={(e) => app.setting("ttsPitch", Number(e.target.value))} /></label></div>
    <div className="tool-toolbar">
      <button disabled={!supported || !text.trim() || speaking} onClick={() => { setError(""); baseline.current = { source: source?.id ?? "", text }; queue.current?.enqueue(text); }}>Speak it all</button>
      <button disabled={!supported || !source} aria-pressed={follow} onClick={() => { baseline.current = { source: source?.id ?? "", text }; setFollow(!follow); }}>{follow ? "Following…" : "Follow"}</button>
      <button disabled={!speaking} onClick={() => { if (paused) queue.current?.resume(); else queue.current?.pause(); setPaused(!paused); }}>{paused ? "Resume" : "Pause"}</button>
      <button disabled={!speaking && !follow} onClick={stop}>Stop</button>
    </div>
    <p className="tool-hint">{source ? text.trim() ? `${text.length.toLocaleString()} characters ready from ${source.name}.` : `Waiting for text from ${source.name}. For a PDF, select it in Document Preview and wait for extraction. Scanned PDFs need OCR.` : "Connect Document Preview, TextEditor, or Ollama → here, then select a text source."}</p>
    {text.trim() && <details><summary>Preview text to read</summary><pre className="studio-output">{text.slice(0, 2000)}{text.length > 2000 ? "…" : ""}</pre></details>}
    <small className="tool-hint">Speak it all reads the current text in short chunks. Follow reads newly appended text only; replaced documents establish a new baseline. Stop cancels playback and follow mode. Rate/voice changes apply to the next chunk. Voice quality depends on your browser and installed voices; no Ollama model is required.</small>
  </StudioShell>;
}
