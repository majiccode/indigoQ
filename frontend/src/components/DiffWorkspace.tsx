"use client";

import { useEffect, useRef, useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { diffLines } from "@/lib/textDiff";
import { fileText, workspaceFiles, workspaceText } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

type Side = "left" | "right";

function textSourceId(token: string): string {
  if (!token || token.startsWith("file|")) return "";
  return token.startsWith("text|") ? token.slice(5) : token;
}

function selectValue(token: string): string {
  if (!token) return "";
  return token.includes("|") ? token : `text|${token}`;
}

export default function DiffWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "diff");
  const [fileTexts, setFileTexts] = useState<Record<string, { dataUrl: string; text: string }>>({});
  const [fileError, setFileError] = useState("");
  const loading = useRef(new Set<string>());
  const leftToken = String(app.state.settings.left ?? "");
  const rightToken = String(app.state.settings.right ?? "");
  const textSources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "text");
  const fileSources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "files");

  useEffect(() => {
    let active = true;
    const sources = connectedWorkspaces(props.graph, props.workspace.id, "incoming", "files");
    for (const token of [leftToken, rightToken]) {
      if (!token.startsWith("file|") || loading.current.has(token)) continue;
      const [, workspaceId, fileId] = token.split("|");
      const source = sources.find((item) => item.id === workspaceId);
      const file = source ? workspaceFiles(source).find((item) => item.id === fileId) : undefined;
      if (!file || fileTexts[token]?.dataUrl === file.dataUrl) continue;
      loading.current.add(token);
      void fileText(file).then((text) => {
        if (active) { setFileError(""); setFileTexts((current) => ({ ...current, [token]: { dataUrl: file.dataUrl, text } })); }
      }).catch((reason) => {
        if (active) {
          setFileTexts((current) => ({ ...current, [token]: { dataUrl: file.dataUrl, text: "" } }));
          setFileError(`${file.name}: ${reason instanceof Error ? reason.message : "Unable to read file"}`);
        }
      }).finally(() => loading.current.delete(token));
    }
    return () => { active = false; };
  }, [leftToken, rightToken, props.graph, props.workspace.id, fileTexts]);

  const localText = (side: Side) => side === "left" ? app.state.text : String(app.state.settings.rightText ?? "");
  const resolve = (side: Side) => {
    const token = side === "left" ? leftToken : rightToken;
    if (!token) return localText(side);
    if (token.startsWith("file|")) return fileTexts[token]?.text ?? "";
    const source = textSources.find((item) => item.id === textSourceId(token));
    return source ? workspaceText(source) : localText(side);
  };
  const format = (text: string) => {
    if (app.state.settings.json !== true) return text;
    try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
  };
  const left = format(resolve("left")), right = format(resolve("right"));
  const openLocal = async (side: Side, file: File) => {
    try {
      const text = await file.text();
      setFileError("");
      app.patch(side === "left"
        ? { text, settings: { ...app.state.settings, left: "" } }
        : { settings: { ...app.state.settings, right: "", rightText: text } });
    } catch (reason) {
      setFileError(reason instanceof Error ? reason.message : "Unable to read file");
    }
  };
  let lines: ReturnType<typeof diffLines> = [], error = "";
  try { lines = diffLines(left, right); } catch (reason) { error = (reason as Error).message; }
  return <StudioShell kind="diff" status={`${app.status} · +${lines.filter((line) => line.kind === "add").length} −${lines.filter((line) => line.kind === "remove").length}`} error={fileError || error} actions={<button onClick={() => app.patch({ output: right })}>Publish right side</button>}>
    <div className="studio-columns">{(["left", "right"] as const).map((side) => {
      const token = side === "left" ? leftToken : rightToken;
      return <div key={side}>
        <div className="tool-toolbar"><select aria-label={`${side} source`} value={selectValue(token)} onChange={(event) => app.setting(side, event.target.value)}><option value="">Local text</option>{textSources.map((source) => <option key={source.id} value={`text|${source.id}`}>{source.name} — text</option>)}{fileSources.flatMap((source) => workspaceFiles(source).map((file) => <option key={`${source.id}/${file.id}`} value={`file|${source.id}|${file.id}`}>{source.name} / {file.name}</option>))}</select><label className="tool-file-button">Open file<input aria-label={`Open ${side} file`} type="file" accept=".txt,.csv,.json,.md,.log,text/*,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openLocal(side, file); event.target.value = ""; }} /></label></div>
        <textarea aria-label={`${side} comparison text`} readOnly={!!token} value={side === "left" ? left : right} onChange={(event) => side === "left" ? app.patch({ text: event.target.value }) : app.setting("rightText", event.target.value)} />
      </div>;
    })}</div>
    <label><input type="checkbox" checked={app.state.settings.json === true} onChange={(event) => app.setting("json", event.target.checked)} /> Format JSON before comparing</label>
    <small className="tool-hint">Pick local text, a connected text source, or a file from a connected FileWorkspace. Open file loads text locally.</small>
    <pre className="diff-lines">{lines.map((line, i) => <div className={`diff-${line.kind}`} key={i}>{line.kind === "add" ? "+" : line.kind === "remove" ? "−" : " "} {line.text || " "}</div>)}</pre>
  </StudioShell>;
}
