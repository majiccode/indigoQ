"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { downloadText } from "@/lib/workspaceData";
import { StudioShell, SourceSelect, sourceText, useStudio } from "./StudioKit";

export function MarkdownDocument({ text }: { text: string }) {
  return <article className="markdown-document"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown></article>;
}
export default function DocumentWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "document-preview");
  const text = sourceText(app.sources, app.state.settings.source, app.state.text);
  return <StudioShell kind="document-preview" status={app.status} error={app.error} actions={<><button onClick={() => downloadText("document.md", text, "text/markdown")}>Markdown ↓</button><button onClick={() => window.print()}>Print / PDF</button></>}>
    <SourceSelect sources={app.sources} value={String(app.state.settings.source ?? "")} onChange={(id) => app.setting("source", id)} />
    {!app.sources.length && <textarea aria-label="Markdown source" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} />}
    <MarkdownDocument text={text} />
    <button onClick={() => app.patch({ output: text })}>Publish document snapshot</button>
  </StudioShell>;
}
