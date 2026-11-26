"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { clearLive, publishLive } from "@/lib/studioRuntime";
import { appendSpeech, speechConstructor, speechResults, type SpeechRecognizer } from "@/lib/speech";
import { downloadText } from "@/lib/workspaceData";
import { useStudio } from "./StudioKit";

export default function TextToSpeechWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "speech-to-text");
  const [recording, setRecording] = useState(false), [starting, setStarting] = useState(false), [monitoring, setMonitoring] = useState(false);
  const [interim, setInterim] = useState(""), [supported, setSupported] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null);
  const microphone = useRef<{ stream: MediaStream; context: AudioContext; analyser: AnalyserNode } | null>(null);
  const recognition = useRef<SpeechRecognizer | null>(null);
  const wanted = useRef(false), active = useRef(true), session = useRef(""), sessionText = useRef("");
  const micPending = useRef<Promise<void> | null>(null);
  const transcript = useRef(app.state.output), saved = useRef(app);
  const restart = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { saved.current = app; }, [app]);
  const broadcast = (partial = "") => {
    publishLive(props.workspace.id, { text: appendSpeech(transcript.current, partial), speech: { session: session.current, text: sessionText.current } });
  };
  const stopRecognition = () => {
    wanted.current = false;
    if (restart.current) clearTimeout(restart.current);
    recognition.current?.stop(); setRecording(false); setInterim("");
  };
  const openMicrophone = async () => {
    if (microphone.current) return;
    if (micPending.current) return micPending.current;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone access requires HTTPS or localhost and a supported browser.");
    micPending.current = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    if (!active.current) { stream.getTracks().forEach((track) => track.stop()); return; }
    const context = new AudioContext();
    try {
      await context.resume();
      if (!active.current) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.82;
      context.createMediaStreamSource(stream).connect(analyser);
      microphone.current = { stream, context, analyser }; setMonitoring(true);
    } catch (reason) { stream.getTracks().forEach((track) => track.stop()); void context.close(); throw reason; }
    })();
    try { await micPending.current; } finally { micPending.current = null; }
  };
  const toggleRecord = async () => {
    if (wanted.current) { stopRecognition(); return; }
    const Constructor = speechConstructor();
    if (!Constructor) { saved.current.setError("Speech recognition is unavailable in this browser. Try Chrome or a browser with Web Speech recognition support."); return; }
    setStarting(true); saved.current.setError("");
    try {
      await openMicrophone();
      if (!active.current) return;
      session.current = crypto.randomUUID(); sessionText.current = "";
      recognition.current?.abort();
      const recognizer = new Constructor(); recognition.current = recognizer;
      recognizer.lang = String(saved.current.state.settings.language ?? "en-US"); recognizer.continuous = true; recognizer.interimResults = true;
      wanted.current = true;
      recognizer.onstart = () => { if (active.current && recognition.current === recognizer) { setRecording(true); setStarting(false); } };
      recognizer.onresult = (event) => {
        if (!active.current || recognition.current !== recognizer) return;
        const result = speechResults(event);
        if (result.final) {
          transcript.current = appendSpeech(transcript.current, result.final);
          sessionText.current = appendSpeech(sessionText.current, result.final);
          saved.current.patch({ output: transcript.current });
        }
        setInterim(result.interim); broadcast(result.interim);
      };
      recognizer.onerror = (event) => {
        if (!active.current || recognition.current !== recognizer) return;
        if (event.error === "no-speech") return;
        wanted.current = false; setRecording(false); setStarting(false); setInterim("");
        saved.current.setError(event.error === "not-allowed" ? "Microphone or speech-recognition permission was denied." : `Speech recognition: ${event.error}`);
      };
      recognizer.onend = () => {
        if (!active.current || recognition.current !== recognizer) return;
        setInterim(""); broadcast();
        if (wanted.current) restart.current = setTimeout(() => { try { recognizer.start(); } catch (reason) { wanted.current = false; setRecording(false); saved.current.setError((reason as Error).message); } }, 250);
        else { setRecording(false); setStarting(false); }
      };
      recognizer.start();
    } catch (reason) { wanted.current = false; saved.current.setError((reason as Error).message); setStarting(false); }
  };
  useEffect(() => {
    active.current = true;
    const supportFrame = requestAnimationFrame(() => setSupported(!!speechConstructor()));
    return () => {
      active.current = false; wanted.current = false;
      cancelAnimationFrame(supportFrame);
      if (restart.current) clearTimeout(restart.current);
      recognition.current?.abort();
      microphone.current?.stream.getTracks().forEach((track) => track.stop());
      void microphone.current?.context.close(); microphone.current = null;
      clearLive(props.workspace.id);
    };
  }, [props.workspace.id]);
  useEffect(() => {
    let frame = 0;
    const draw = (time: number) => {
      const target = canvas.current, ctx = target?.getContext("2d");
      if (target && ctx) {
        const rect = target.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
        if (target.width !== Math.round(width * dpr) || target.height !== Math.round(height * dpr)) { target.width = Math.round(width * dpr); target.height = Math.round(height * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#101824"; ctx.fillRect(0, 0, width, height);
        const glow = ctx.createRadialGradient(width / 2, height * 0.6, 0, width / 2, height * 0.6, width * 0.6);
        glow.addColorStop(0, recording ? "#63284b55" : "#42336e55"); glow.addColorStop(1, "#10182400"); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
        const analyser = microphone.current?.analyser, bins = new Uint8Array(analyser?.frequencyBinCount ?? 1024); analyser?.getByteFrequencyData(bins);
        const count = Math.min(100, Math.max(24, Math.floor(width / 9))), gap = 3, barWidth = width / count - gap;
        ctx.strokeStyle = "#a8bdd014"; ctx.lineWidth = 1;
        for (let y = 0.2; y < 1; y += 0.2) { ctx.beginPath(); ctx.moveTo(0, height * y); ctx.lineTo(width, height * y); ctx.stroke(); }
        for (let index = 0; index < count; index++) {
          const low = Math.floor((index / count) ** 2 * bins.length * 0.75), high = Math.max(low + 1, Math.floor(((index + 1) / count) ** 2 * bins.length * 0.75));
          let energy = 0; for (let bin = low; bin < high; bin++) energy = Math.max(energy, bins[bin]);
          const amplitude = analyser ? energy / 255 : 0.025 + 0.025 * Math.sin(time / 900 + index / 7);
          const barHeight = Math.max(2, amplitude * height * 0.72), x = index * width / count;
          const gradient = ctx.createLinearGradient(0, height / 2 - barHeight / 2, 0, height / 2 + barHeight / 2);
          gradient.addColorStop(0, "#ead2ff"); gradient.addColorStop(0.5, recording ? "#ed829d" : "#ad91ed"); gradient.addColorStop(1, "#65c9c1");
          ctx.fillStyle = gradient; ctx.globalAlpha = analyser ? 0.9 : 0.4; ctx.beginPath(); ctx.roundRect(x, (height - barHeight) / 2, Math.max(1, barWidth), barHeight, 3); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [recording]);
  return <div className="speech-workspace" onDoubleClick={(event) => event.stopPropagation()}>
    <canvas ref={canvas} className="speech-spectrum" aria-label="Live microphone FFT spectrum" />
    <div className="speech-top"><strong>Speech to Text</strong><span className={`speech-status ${recording ? "is-recording" : ""}`} role="status">{starting ? "Connecting microphone…" : recording ? "Recording · transcribing" : monitoring ? "Microphone spectrum live" : "Microphone off"}</span></div>
    <div className="speech-transcript" aria-label="Speech transcript"><span>{app.state.output}</span><em>{interim ? ` ${interim}` : ""}</em>{!app.state.output && !interim && <span className="speech-placeholder">Your voice, written live.<br />Press Record and start speaking.</span>}</div>
    <div className="speech-bottom">
      {app.error && <div className="tool-error" role="alert">{app.error}</div>}
      <div className="speech-actions"><button className={`speech-record ${recording ? "is-recording" : ""}`} aria-pressed={recording} disabled={starting || !supported} onClick={() => void toggleRecord()}><i />{recording ? "Stop recording" : "Record"}</button>
        <select aria-label="Speech language" disabled={recording || starting} value={String(app.state.settings.language ?? "en-US")} onChange={(event) => app.setting("language", event.target.value)}>{[["en-US", "English (US)"], ["en-GB", "English (UK)"], ["es-ES", "Español"], ["fr-FR", "Français"], ["de-DE", "Deutsch"], ["it-IT", "Italiano"], ["pt-BR", "Português"], ["ja-JP", "日本語"], ["zh-CN", "中文"]].map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
        <button disabled={starting} onClick={() => void app.run(async () => { if (microphone.current) { stopRecognition(); microphone.current.stream.getTracks().forEach((track) => track.stop()); await microphone.current.context.close(); microphone.current = null; setMonitoring(false); } else await openMicrophone(); })}>{monitoring ? "Mic off" : "Enable mic"}</button>
        <button disabled={recording || starting} onClick={() => { transcript.current = ""; sessionText.current = ""; session.current = crypto.randomUUID(); app.patch({ output: "" }); setInterim(""); broadcast(); }}>Clear</button>
        <button disabled={!app.state.output} onClick={() => downloadText("transcript.txt", app.state.output)}>Text ↓</button>
      </div>
      <small>{!supported ? "This browser does not support speech recognition. Microphone visualization is still available. " : ""}Connect → TextEditor to append speech, or → Ollama to dictate its prompt. Recognition uses your browser’s speech service and may require internet. {app.status}</small>
    </div>
  </div>;
}
