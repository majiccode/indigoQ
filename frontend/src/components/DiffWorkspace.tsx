"use client";

import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { diffLines } from "@/lib/textDiff";
import { StudioShell, SourceSelect, useStudio } from "./StudioKit";
import { workspaceText } from "@/lib/workspaceData";

export default function DiffWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "diff");
  const get = (side: string, fallback: string) => {
    const source = app.sources.find((source) => source.id === app.state.settings[side]);
    const text = source ? workspaceText(source) : fallback;
    if (app.state.settings.json === true) { try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; } }
    return text;
  };
  const left = get("left", app.state.text), right = get("right", String(app.state.settings.rightText ?? ""));
  let lines: ReturnType<typeof diffLines> = [], error = "";
  try { lines = diffLines(left, right); } catch (reason) { error = (reason as Error).message; }
  return <StudioShell kind="diff" status={`${app.status} · +${lines.filter((line) => line.kind === "add").length} −${lines.filter((line) => line.kind === "remove").length}`} error={error} actions={<button onClick={() => app.patch({ output: right })}>Publish right side</button>}>
    <div className="studio-columns">{["left", "right"].map((side) => <div key={side}><SourceSelect sources={app.sources} value={String(app.state.settings[side] ?? "")} label={`${side} source`} onChange={(id) => app.setting(side, id)} /><textarea aria-label={`${side} comparison text`} readOnly={!!app.state.settings[side]} value={side === "left" ? left : right} onChange={(event) => side === "left" ? app.patch({ text: event.target.value }) : app.setting("rightText", event.target.value)} /></div>)}</div>
    <label><input type="checkbox" checked={app.state.settings.json === true} onChange={(event) => app.setting("json", event.target.checked)} /> Format JSON before comparing</label>
    <pre className="diff-lines">{lines.map((line, i) => <div className={`diff-${line.kind}`} key={i}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text || " "}</div>)}</pre>
  </StudioShell>;
}
