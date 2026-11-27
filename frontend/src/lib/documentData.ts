import type { ContentEntry, Workspace } from "./types";
import { workspaceFiles, workspaceText } from "./workspaceData";

export function isPdf(file: ContentEntry) {
  return file.mimeType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function documentSource(sources: Workspace[], token: string, localText: string): { file?: ContentEntry; text: string; missing?: boolean } {
  if (token === "local" || (!token && !sources.length)) return { text: localText };
  if (token.startsWith("file|")) {
    const [, sourceId, fileId] = token.split("|");
    const source = sources.find((item) => item.id === sourceId);
    const file = source && workspaceFiles(source).find((item) => item.id === fileId);
    return file ? { file, text: "" } : { text: "", missing: true };
  }
  const sourceId = token.startsWith("text|") ? token.slice(5) : token;
  const source = sourceId ? sources.find((item) => item.id === sourceId) : sources[0];
  if (!source) return { text: "", missing: true };
  if (!token || !token.startsWith("text|")) {
    const file = workspaceFiles(source)[0];
    if (file) return { file, text: "" };
  }
  return { text: workspaceText(source) };
}

export function pdfPageText(items: ({ str: string; hasEOL?: boolean } | { type: string })[]) {
  let text = "";
  for (const item of items) {
    if (!("str" in item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  return text.replace(/ +\n/g, "\n").trim();
}
