"use client";

import { useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { searchPassages } from "@/lib/studio";
import { fileText, workspaceFiles, workspaceText } from "@/lib/workspaceData";
import { StudioShell, useStudio } from "./StudioKit";

export default function KnowledgeWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "knowledge");
  const [results, setResults] = useState<ReturnType<typeof searchPassages>>([]);
  const [indexed, setIndexed] = useState(0);
  return <StudioShell kind="knowledge" status={`${app.status} · ${indexed} documents searched`} error={app.error} actions={<button disabled={app.busy} onClick={() => void app.run(async () => {
    const documents: { name: string; workspaceId: string; text: string }[] = [];
    for (const source of app.sources) {
      const text = workspaceText(source); if (text) documents.push({ name: source.name, workspaceId: source.id, text });
      for (const file of workspaceFiles(source)) {
        if (file.mimeType.startsWith("image/") || file.mimeType.startsWith("audio/") || file.mimeType.startsWith("video/")) continue;
        try { documents.push({ name: `${source.name} / ${file.name}`, workspaceId: source.id, text: await fileText(file) }); }
        catch { /* Non-UTF-8 documents are not part of this text index. */ }
      }
    }
    if (documents.reduce((n, document) => n + document.text.length, 0) > 5000000) throw new Error("Library limit: 5 million text characters");
    const matches = searchPassages(documents, app.state.text);
    setResults(matches); setIndexed(documents.length);
    app.patch({ output: matches.map((match, i) => `[${i + 1}] ${match.name} (character ${match.offset})\n${match.text}\nSource: /workspace?id=${encodeURIComponent(match.workspaceId)}`).join("\n\n") });
  })}>Search connected documents</button>}>
    <label className="tool-field">Search terms / question<input value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} /></label>
    <p className="tool-hint">Local keyword-ranked passage retrieval over connected text and UTF-8 files. Each search refreshes the index. Connect → Ollama and select this library as context for source-backed answers.</p>
    {results.map((result, i) => <section className="knowledge-result" key={i}><a href={`/workspace?id=${encodeURIComponent(result.workspaceId)}`}>[{i + 1}] {result.name}</a><small>character {result.offset} · {result.score} matching terms</small><p>{result.text}</p></section>)}
    {!results.length && app.state.output && <pre className="studio-output">{app.state.output}</pre>}
  </StudioShell>;
}
