"use client";

import { useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { connectedControls, useLiveRevision } from "@/lib/studioRuntime";
import { workspaceFiles, workspaceText } from "@/lib/workspaceData";
import { parseMath } from "@/lib/mathEngine";
import { StudioShell, useStudio } from "./StudioKit";

export default function AudioWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "audio-lab");
  const [playing, setPlaying] = useState(false), [recording, setRecording] = useState(false);
  const engine = useRef<{ context: AudioContext; oscillator: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; analyser: AnalyserNode; recorder: MediaRecorder | null; destination: MediaStreamAudioDestinationNode } | null>(null);
  const visual = useRef<HTMLCanvasElement>(null), inputAudio = useRef<HTMLAudioElement>(null);
  const [fileUrl, setFileUrl] = useState("");
  useLiveRevision();
  const controls = connectedControls(props.graph, props.workspace.id);
  const frequency = Math.min(20000, Math.max(20, Number(controls.frequency ?? app.state.settings.frequency ?? 220)));
  const volume = Math.min(0.5, Math.max(0, Number(controls.gain ?? app.state.settings.gain ?? 0.1)));
  const cutoff = Math.min(20000, Math.max(20, Number(controls.cutoff ?? app.state.settings.cutoff ?? 10000)));
  const waveform = String(app.state.settings.waveform ?? "sine");
  const equationSource = app.sources.find((source) => source.type === "math-lab" || source.type === "text-editor");
  const equations = equationSource ? workspaceText(equationSource) : "";
  let waveError = "";
  if (waveform === "custom") {
    const parsed = parseMath(equations);
    if (!parsed.curves.length) waveError = parsed.errors[0] ?? "Connect an equation source";
  }
  const audioFiles = app.sources.flatMap(workspaceFiles).filter((file) => file.mimeType.startsWith("audio/"));
  useEffect(() => {
    const audio = engine.current;
    if (!audio) return;
    audio.oscillator.frequency.setTargetAtTime(frequency, audio.context.currentTime, 0.02);
    audio.gain.gain.setTargetAtTime(controls.enabled === false ? 0 : volume, audio.context.currentTime, 0.02);
    audio.filter.frequency.setTargetAtTime(cutoff, audio.context.currentTime, 0.02);
    if (waveform !== "custom") { audio.oscillator.type = waveform as OscillatorType; }
    else {
      try {
        const parsed = parseMath(equations), curve = parsed.curves[0];
        if (!curve) throw new Error(parsed.errors[0] ?? "Connect an equation source");
        const real = new Float32Array(33), imaginary = new Float32Array(33);
        for (let k = 1; k < 33; k++) for (let i = 0; i < 256; i++) {
          const x = i / 256 * Math.PI * 2, sample = curve.evaluate({ ...parsed.parameters, x });
          real[k] += (Number.isFinite(sample) ? sample : 0) * Math.cos(k * x) * 2 / 256;
          imaginary[k] += (Number.isFinite(sample) ? sample : 0) * Math.sin(k * x) * 2 / 256;
        }
        audio.oscillator.setPeriodicWave(audio.context.createPeriodicWave(real, imaginary));
      } catch { /* Keep the last valid waveform while source expressions are edited. */ }
    }
  }, [frequency, volume, cutoff, waveform, equations, controls.enabled, playing]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const draw = () => {
      const audio = engine.current, canvas = visual.current, ctx = canvas?.getContext("2d");
      if (audio && canvas && ctx) {
        const wave = new Uint8Array(audio.analyser.frequencyBinCount), spectrum = new Uint8Array(wave.length);
        audio.analyser.getByteTimeDomainData(wave); audio.analyser.getByteFrequencyData(spectrum);
        ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#c8a4ff"; ctx.beginPath();
        wave.forEach((value, i) => { const x = i / wave.length * canvas.width, y = value / 255 * 100; if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y); }); ctx.stroke();
        ctx.fillStyle = "#9cdbbd"; spectrum.forEach((value, i) => ctx.fillRect(i / spectrum.length * canvas.width, 200, 2, -value / 255 * 80));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw); return () => cancelAnimationFrame(frame);
  }, [playing]);
  useEffect(() => () => { const audio = engine.current; if (audio) { if (audio.recorder?.state === "recording") audio.recorder.stop(); audio.oscillator.stop(); void audio.context.close(); engine.current = null; } }, []);
  const start = async () => {
    const context = new AudioContext(), oscillator = context.createOscillator(), gain = context.createGain(), filter = context.createBiquadFilter(), analyser = context.createAnalyser(), destination = context.createMediaStreamDestination();
    gain.gain.value = 0; filter.type = "lowpass"; analyser.fftSize = 1024;
    oscillator.connect(filter).connect(gain).connect(analyser).connect(context.destination); analyser.connect(destination);
    engine.current = { context, oscillator, gain, filter, analyser, destination, recorder: null };
    await context.resume(); oscillator.start(); setPlaying(true);
  };
  return <StudioShell kind="audio-lab" status={app.status} error={app.error || waveError}>
    <div className="tool-toolbar"><button onClick={() => void app.run(async () => { if (playing) { if (engine.current?.recorder?.state === "recording") engine.current.recorder.stop(); engine.current?.oscillator.stop(); await engine.current?.context.close(); engine.current = null; setPlaying(false); } else await start(); })}>{playing ? "Stop audio" : "Start audio"}</button><select aria-label="Waveform" value={waveform} onChange={(event) => app.setting("waveform", event.target.value)}>{["sine", "square", "triangle", "sawtooth", "custom"].map((name) => <option key={name}>{name}</option>)}</select></div>
    <div className="tool-toolbar">{[["frequency", frequency, 20, 2000], ["gain", volume, 0, 0.5], ["cutoff", cutoff, 20, 20000]].map(([name, value, min, max]) => <label key={name}>{name}: {Number(value).toFixed(2)}<input aria-label={String(name)} type="range" min={min} max={max} step="0.01" value={value} disabled={controls[String(name)] !== undefined} onChange={(event) => app.setting(String(name), Number(event.target.value))} /></label>)}</div>
    <canvas className="studio-visual" ref={visual} width="600" height="210" aria-label="Oscilloscope and frequency spectrum" />
    <div className="tool-toolbar"><button disabled={!playing} onClick={() => void app.run(() => {
      const audio = engine.current; if (!audio) return;
      if (recording) { audio.recorder?.stop(); setRecording(false); return; }
      const recorder = new MediaRecorder(audio.destination.stream), chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => app.patch({ files: [{ id: crypto.randomUUID(), name: "synth-recording.webm", mimeType: recorder.mimeType, size: chunks.reduce((n, blob) => n + blob.size, 0), dataUrl: String(reader.result) }] }); reader.readAsDataURL(new Blob(chunks, { type: recorder.mimeType })); setRecording(false); };
      audio.recorder = recorder; recorder.start(); setRecording(true);
    })}>{recording ? "Stop recording" : "Record synth"}</button>{app.state.files?.map((file) => <a key={file.id} href={file.dataUrl} download={file.name}>Download recording</a>)}</div>
    <label className="tool-field">Connected audio<select value={fileUrl} onChange={(event) => setFileUrl(event.target.value)}><option value="">Choose a file</option>{audioFiles.map((file) => <option key={file.id} value={file.dataUrl}>{file.name}</option>)}</select></label>
    <audio ref={inputAudio} controls src={fileUrl || undefined} />
    <small className="tool-hint">Explicit Start enables sound. Controls: frequency (Hz), gain, cutoff, enabled. Custom uses the first connected equation sampled over 0…2π. Synth recordings are published as files. File playback has independent browser controls.</small>
  </StudioShell>;
}
