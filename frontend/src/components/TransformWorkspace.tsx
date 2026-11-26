"use client";

import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { selectPath } from "@/lib/studio";
import { extractRegex } from "@/lib/regexWorker";
import { parseTable } from "@/lib/workspaceData";
import { StudioShell, SourceSelect, sourceText, useStudio } from "./StudioKit";

export default function TransformWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "transform");
  const mode = String(app.state.settings.mode ?? "path");
  return <StudioShell kind="transform" status={app.status} error={app.error} actions={<button disabled={app.busy} onClick={() => void app.run(async () => {
    const input = sourceText(app.sources, app.state.settings.source, String(app.state.settings.input ?? "[{\"name\":\"sample\",\"value\":2}]"));
    let output: string;
    if (mode === "path") output = JSON.stringify(selectPath(JSON.parse(input), String(app.state.settings.path ?? "$")), null, 2);
    else if (mode === "regex") {
      const pattern = String(app.state.settings.pattern ?? "[0-9]+"), flags = String(app.state.settings.flags ?? "g");
      if (pattern.length > 200 || input.length > 100000) throw new Error("Regex input limit: 100k chars; pattern limit: 200 chars");
      output = await extractRegex(input, pattern, flags);
    } else if (mode === "filter") {
      const rows = JSON.parse(input);
      if (!Array.isArray(rows)) throw new Error("Filter expects a JSON array");
      output = JSON.stringify(rows.filter((row) => String(selectPath(row, String(app.state.settings.path ?? "value"))).includes(String(app.state.settings.contains ?? ""))), null, 2);
    } else {
      const parsed = JSON.parse(input), rows = Array.isArray(parsed) ? parsed : [parsed];
      output = rows.map((row) => app.state.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => { const value = selectPath(row, path); return typeof value === "object" ? JSON.stringify(value) : String(value); })).join("\n");
    }
    let table = null; try { table = parseTable(output); } catch {}
    app.patch({ output, table });
  })}>Run transform</button>}>
    <SourceSelect sources={app.sources} value={String(app.state.settings.source ?? "")} onChange={(id) => app.setting("source", id)} />
    {!app.sources.length && <label className="tool-field">Local JSON / text<textarea value={String(app.state.settings.input ?? "[{\"name\":\"sample\",\"value\":2}]")} onChange={(event) => app.setting("input", event.target.value)} /></label>}
    <label className="tool-field">Operation<select value={mode} onChange={(event) => app.setting("mode", event.target.value)}>{["path", "filter", "template", "regex"].map((name) => <option key={name}>{name}</option>)}</select></label>
    {(mode === "path" || mode === "filter") && <label className="tool-field">Path (e.g. $.results or items[0].name)<input value={String(app.state.settings.path ?? (mode === "path" ? "$" : "value"))} onChange={(event) => app.setting("path", event.target.value)} /></label>}
    {mode === "filter" && <label className="tool-field">Contains<input value={String(app.state.settings.contains ?? "")} onChange={(event) => app.setting("contains", event.target.value)} /></label>}
    {mode === "template" && <label className="tool-field">Template using {"{{field.path}}"}<textarea value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></label>}
    {mode === "regex" && <div className="tool-toolbar"><input aria-label="Regex pattern" value={String(app.state.settings.pattern ?? "[0-9]+")} onChange={(event) => app.setting("pattern", event.target.value)} /><input aria-label="Regex flags" value={String(app.state.settings.flags ?? "g")} onChange={(event) => app.setting("flags", event.target.value)} /></div>}
    <pre className="studio-output">{app.state.output}</pre>
  </StudioShell>;
}
