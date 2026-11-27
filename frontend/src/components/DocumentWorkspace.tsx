"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getWorkspaceType, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { downloadText, fileText, workspaceFiles } from "@/lib/workspaceData";
import { documentSource, docxText, isDocx, isPdf } from "@/lib/documentData";
import { StudioShell, useStudio } from "./StudioKit";
import PdfDocument from "./PdfDocument";

export function MarkdownDocument({ text }: { text: string }) {
  return <article className="markdown-document"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown></article>;
}
export default function DocumentWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "document-preview");
  const sources = app.sources.filter((source) => getWorkspaceType(source.type)?.outputs.some((type) => type === "text" || type === "files"));
  const token = String(app.state.settings.source ?? "");
  const selected = documentSource(sources, token, app.state.text);
  const file = selected.file;
  const pdf = file && isPdf(file);
  const docx = file && isDocx(file);
  const [loaded, setLoaded] = useState<{ key: string; text: string; error?: string } | null>(null);
  const key = file ? JSON.stringify([file.id, file.dataUrl]) : "";
  const text = file ? loaded?.key === key ? loaded.text : "" : selected.text;
  const error = selected.missing ? "The selected source is no longer connected or the file was removed. Choose another document." : loaded?.key === key ? loaded.error : "";
  const loading = !!file && loaded?.key !== key;
  const latest = useRef(app);
  useEffect(() => { latest.current = app; });
  useEffect(() => {
    if (!file || pdf || docx) return;
    let active = true;
    void fileText(file).then((text) => { if (active) setLoaded({ key, text }); })
      .catch((reason) => { if (active) setLoaded({ key, text: "", error: reason instanceof Error ? reason.message : "Unable to read document" }); });
    return () => { active = false; };
  }, [file, pdf, docx, key]);
  useEffect(() => {
    if (!file || !docx) return;
    let active = true;
    void docxText(file.dataUrl).then((text) => { if (active) setLoaded({ key, text }); })
      .catch((reason) => { if (active) setLoaded({ key, text: "", error: reason instanceof Error ? reason.message : "Unable to read document" }); });
    return () => { active = false; };
  }, [file, docx, key]);
  useEffect(() => {
    if (latest.current.state.output !== text) latest.current.patch({ output: text });
  }, [text, app.state.output]);

  const value = token && token !== "local" && !token.includes("|") ? `text|${token}` : token;
  return <StudioShell kind="document-preview" status={`${app.status}${loading ? " · Reading document…" : ""}`} error={error || app.error} actions={<><button disabled={loading || !!error} onClick={() => downloadText(pdf ? "document.txt" : "document.md", text, pdf ? "text/plain" : "text/markdown")}>{pdf ? "Text ↓" : "Markdown ↓"}</button><button onClick={() => window.print()}>Print / PDF</button></>}>
    <label className="tool-field">Document source<select aria-label="Document source" value={value} onChange={(event) => app.patch({ settings: { ...app.state.settings, source: event.target.value }, output: "" })}>
      <option value="">First connected document</option><option value="local">Local Markdown</option>
      {sources.map((source) => <optgroup key={source.id} label={source.name}>
        {getWorkspaceType(source.type)?.outputs.includes("text") && <option value={`text|${source.id}`}>{source.name} — text</option>}
        {workspaceFiles(source).map((file) => <option key={file.id} value={`file|${source.id}|${file.id}`}>{file.name}</option>)}
      </optgroup>)}
    </select></label>
    {(token === "local" || (!token && !sources.length)) && <textarea aria-label="Markdown source" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} />}
    {file && <small className="tool-hint">{file.name}</small>}
    {pdf && file ? <PdfDocument key={key} file={file} onText={(text) => setLoaded({ key, text })} onError={(error) => setLoaded({ key, text: "", error })} /> : <MarkdownDocument text={text} />}
    {pdf && !loading && !error && !text.trim() && <small className="tool-hint">This PDF has no extractable text. Its pages can be previewed, but comparing scanned documents requires OCR.</small>}
    {docx && !loading && !error && !text.trim() && <small className="tool-hint">This Word document has no extractable text.</small>}
    <small className="tool-hint">The selected document’s text is published automatically. Connect two Document Preview workspaces to Diff / Compare and choose one for each side.</small>
  </StudioShell>;
}
