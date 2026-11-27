"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceText } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

export default function ReadAloudWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "text-to-speech");
  const [voice, setVoice] = useState<string | null>(String(app.state.settings.ttsVoice ?? null));
  const [rate, setRate] = useState(Number(app.state.settings.ttsRate ?? 1));
  const [pitch, setPitch] = useState(Number(app.state.settings.ttsPitch ?? 1));
  const [follow, setFollow] = useState(app.state.settings.follow === true);
  const [speaking, setSpeaking] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const ttsActive = useRef(false);
  const spokenLength = useRef(0);
  const pendingText = useRef("");
  const prevFollow = useRef(false);
  const speakRef = useRef<((chunk: string) => void) | null>(null);
  const toggleRef = useRef<(() => void) | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const source = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "text")[0];
  const text = source ? workspaceText(source) : "";

  const speakChunk = useCallback((chunk: string) => {
    if (!chunk.trim() || ttsActive.current) return;
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(chunk);
      u.voice = null;
      u.rate = rate;
      u.pitch = pitch;
      u.onend = () => {
        ttsActive.current = false;
        setSpeaking(false);
        utterance.current = null;
        const next = pendingText.current;
        pendingText.current = "";
        if (next.trim() && speakRef.current) speakRef.current(next);
      };
      u.onerror = () => {
        ttsActive.current = false;
        setSpeaking(false);
        utterance.current = null;
        const next = pendingText.current;
        pendingText.current = "";
        if (next.trim() && speakRef.current) speakRef.current(next);
      };
      utterance.current = u;
      ttsActive.current = true;
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    }
  }, [rate, pitch]);

  const toggleFollow = useCallback(() => {
    const nextFollow = !follow;
    setFollow(nextFollow);
    app.setting("follow", nextFollow);
    if (nextFollow) {
      // Arm follow mode: mark current text as already spoken, wait for new text.
      spokenLength.current = text.length;
    }
  }, [follow, text, app]);

  const stop = useCallback(() => {
    ttsActive.current = false;
    setSpeaking(false);
    setFollow(false);
    app.setting("follow", false);
    spokenLength.current = 0;
    prevFollow.current = false;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    utterance.current = null;
    pendingText.current = "";
  }, [app]);

  useEffect(() => {
    speakRef.current = speakChunk;
    toggleRef.current = toggleFollow;
    stopRef.current = stop;

    // Detect follow activation: mark all existing text as already spoken so
    // only text added after activation is read aloud.
    if (follow && !prevFollow.current) {
      spokenLength.current = text.length;
      prevFollow.current = true;
      return;
    }
    prevFollow.current = follow;

    if (!follow || !text.trim()) return;
    if (text.length < spokenLength.current) spokenLength.current = 0;
    const newPart = text.slice(spokenLength.current);
    if (newPart.trim()) {
      spokenLength.current = text.length;
      if (ttsActive.current) {
        pendingText.current = newPart;
      } else if (speakRef.current) {
        speakRef.current(newPart);
      }
    }
  }, [follow, text, speakChunk, toggleFollow, stop]);

  useEffect(() => {
    if (!ttsActive.current || !voice) return;
    const u = utterance.current;
    if (u) { u.voice = null; u.rate = rate; u.pitch = pitch; }
  }, [voice, rate, pitch]);

  return <StudioShell kind="text-to-speech" status={app.status} error={app.error}>
    <div className="tool-toolbar">
      {source ? <span style={{ fontSize: 10, color: "#bac9ae" }}>Reading: {source.name}</span> : <span style={{ fontSize: 10, color: "#bac9ae" }}>No text source connected</span>}
    </div>
    <label className="tool-field" style={{ marginBottom: 6, fontSize: 11, color: "#bac9ae" }}>Read connected text aloud</label>
    <select aria-label="TTS voice" value={voice ?? ""} onChange={(event) => { setVoice(event.target.value); app.setting("ttsVoice", event.target.value); }} style={{ width: "100%", marginBottom: 6 }}>
      <option value="">Default voice</option>
      {("speechSynthesis" in window ? window.speechSynthesis.getVoices() : []).map((v: SpeechSynthesisVoice) => <option key={v.name} value={v.name}>{v.name}{v.lang ? ` (${v.lang})` : ""}</option>)}
    </select>
    <div className="tool-toolbar" style={{ gap: 8, alignItems: "center" }}>
      <label style={{ fontSize: 10, color: "#bac9ae", display: "flex", alignItems: "center", gap: 4 }}>Rate <input type="range" min="0.5" max="2" step={0.1} value={rate} onChange={(event) => { setRate(Number(event.target.value)); app.setting("ttsRate", Number(event.target.value)); }} /></label>
      <label style={{ fontSize: 10, color: "#bac9ae", display: "flex", alignItems: "center", gap: 4 }}>Pitch <input type="range" min={0} max={2} step={0.1} value={pitch} onChange={(event) => { setPitch(Number(event.target.value)); app.setting("ttsPitch", Number(event.target.value)); }} /></label>
    </div>
    <div className="tool-toolbar" style={{ marginTop: 6 }}>
      <button
        disabled={!text.trim() || app.busy}
        onClick={() => toggleRef.current?.()}
        aria-pressed={follow}
        style={follow ? { background: "#c4a4ed", color: "#172012" } : undefined}
      >
        {follow ? "Following…" : "Speak"}
      </button>
      <button disabled={!speaking} onClick={() => stopRef.current?.()}>Stop</button>
    </div>
    {text.trim() && <small className="tool-hint" style={{ marginTop: 4 }}>{text.slice(0, 200)}{text.length > 200 ? "…" : ""}</small>}
    {!source && <small className="tool-hint">Wire a TextEditor, DocumentWorkspace, Ollama, or Data Table → here to read its text aloud.</small>}
    {follow && <small className="tool-hint">Follow mode is on — new text is read as it arrives.</small>}
    <small className="tool-hint">Uses your browser&apos;s built-in speech synthesis (no LLM or network needed). Voice options depend on your operating system.</small>
  </StudioShell>;
}
