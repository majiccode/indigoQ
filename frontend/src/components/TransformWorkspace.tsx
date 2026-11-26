"use client";

import { useEffect, useRef } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { transformInput } from "@/lib/transform";
import { autoUpdateEnabled } from "@/lib/autoUpdate";
import { useAutoProcess } from "./useAutoProcess";
import { StudioShell, SourceSelect, sourceText, useStudio } from "./StudioKit";

export default function TransformWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "transform");
  const mode = String(app.state.settings.mode ?? "path");
  const input = sourceText(app.sources, app.state.settings.source, String(app.state.settings.input ?? "[{\"name\":\"sample\",\"value\":2}]"));
  const autoUpdate = autoUpdateEnabled(props.workspace);
  const latest = useRef(app);
  const generation = useRef(0);
  useEffect(() => { latest.current = app; });
  const execute = async (text: string) => {
    const request = ++generation.current;
    const result = await transformInput(text, latest.current.state);
    if (request === generation.current) latest.current.patch(result);
  };
  useAutoProcess(autoUpdate, input.trim() ? JSON.stringify([input, mode, app.state.text, app.state.settings.path, app.state.settings.contains, app.state.settings.pattern, app.state.settings.flags]) : "", () => latest.current.run(() => execute(input)));
  return <StudioShell kind="transform" status={app.status} error={app.error} actions={<button disabled={app.busy} onClick={() => void app.run(() => execute(input))}>Run transform</button>}>
    <SourceSelect sources={app.sources} value={String(app.state.settings.source ?? "")} onChange={(id) => app.setting("source", id)} />
    {!app.sources.length && <label className="tool-field">Local JSON / text<textarea value={String(app.state.settings.input ?? "[{\"name\":\"sample\",\"value\":2}]")} onChange={(event) => app.setting("input", event.target.value)} /></label>}
    <label className="tool-field">Operation<select value={mode} onChange={(event) => app.setting("mode", event.target.value)}>{["path", "filter", "template", "regex"].map((name) => <option key={name}>{name}</option>)}</select></label>
    {(mode === "path" || mode === "filter") && <label className="tool-field">Path (e.g. $.results or items[0].name)<input value={String(app.state.settings.path ?? (mode === "path" ? "$" : "value"))} onChange={(event) => app.setting("path", event.target.value)} /></label>}
    {mode === "filter" && <label className="tool-field">Contains<input value={String(app.state.settings.contains ?? "")} onChange={(event) => app.setting("contains", event.target.value)} /></label>}
    {mode === "template" && <label className="tool-field">Template using {"{{field.path}}"}<textarea value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></label>}
    {mode === "regex" && <div className="tool-toolbar"><input aria-label="Regex pattern" value={String(app.state.settings.pattern ?? "[0-9]+")} onChange={(event) => app.setting("pattern", event.target.value)} /><input aria-label="Regex flags" value={String(app.state.settings.flags ?? "g")} onChange={(event) => app.setting("flags", event.target.value)} /></div>}
    <pre className="studio-output">{app.state.output}</pre>
    <small className="tool-hint">{autoUpdate ? "Following source output automatically." : "Press Run transform to process the input snapshot."} Enable Auto-update on downstream SQL to continue the pipeline automatically.</small>
  </StudioShell>;
}
