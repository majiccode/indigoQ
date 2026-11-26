"use client";

import { useState, type ReactNode } from "react";
import type { StudioKind, StudioState } from "@/lib/types";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { incoming, STUDIO_NAMES, studioDefault } from "@/lib/studio";
import { useToolState } from "./useToolState";
import { workspaceText } from "@/lib/workspaceData";
import { liveOutput, useLiveRevision } from "@/lib/studioRuntime";

export function useStudio(props: TypedWorkspaceProps, kind: StudioKind) {
  useLiveRevision();
  const tool = props.workspace.tool;
  const initial = tool?.kind === kind ? tool as StudioState : studioDefault(kind);
  const saved = useToolState(initial, props.onOperation, !tool);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (change: Partial<StudioState>) => saved.update({ ...saved.state, ...change });
  const setting = (key: string, value: string | number | boolean) => patch({ settings: { ...saved.state.settings, [key]: value } });
  const run = async (action: () => void | Promise<void>) => {
    setBusy(true); setError("");
    try { await action(); } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };
  const sources = incoming(props.graph, props.workspace.id).map((source) => {
    const text = props.workspace.autoUpdate !== false && source.type === "speech-to-text" ? liveOutput(source.id)?.text : undefined;
    return text !== undefined ? { ...source, tool: { ...(source.tool?.kind === "speech-to-text" ? source.tool : studioDefault("speech-to-text")), output: text } } : source;
  });
  return { ...saved, patch, setting, error, setError, busy, run, sources };
}

export function StudioShell({ kind, status, error, actions, children }: { kind: StudioKind; status: string; error?: string; actions?: ReactNode; children: ReactNode }) {
  return <div className={`tool-workspace studio-${kind}`} onDoubleClick={(event) => event.stopPropagation()}>
    <div className="tool-toolbar"><strong>{STUDIO_NAMES[kind]}</strong>{actions}</div>
    <div className="tool-scroll">{error && <div role="alert" className="tool-error">{error}</div>}{children}</div>
    <footer className="tool-footer" role="status">{status}</footer>
  </div>;
}

export function SourceSelect({ sources, value, onChange, label = "Connected source" }: { sources: TypedWorkspaceProps["graph"]["workspaces"]; value: string; onChange: (id: string) => void; label?: string }) {
  return <label className="tool-field">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Local / first connected source</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>;
}

export function sourceText(sources: TypedWorkspaceProps["graph"]["workspaces"], id: unknown, fallback: string) {
  const source = id ? sources.find((item) => item.id === id) : sources[0];
  return source ? workspaceText(source) : fallback;
}
