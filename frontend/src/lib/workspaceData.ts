import type { ContentEntry, Graph, TableState, Workspace } from "./types";
import { parseMath } from "./mathEngine";
import { parseControls, savedControls } from "./studio";

export function stripFence(text: string) {
  return text.trim().replace(/^```[^\n]*\n/, "").replace(/\n```\s*$/, "");
}

export function parseTable(input: string): TableState {
  const text = stripFence(input).replace(/^\uFEFF/, "");
  let rows: string[][];
  if (/^[\[{]/.test(text.trim())) {
    const data: unknown = JSON.parse(text);
    if (!Array.isArray(data) || !data.length) throw new Error("JSON must be a non-empty array of objects or rows");
    if (data.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
      const columns = [...new Set(data.flatMap((row) => Object.keys(row)))];
      rows = [columns, ...data.map((row) => columns.map((key) => {
        const value = row[key];
        return value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      }))];
    } else if (data.every(Array.isArray)) rows = data.map((row) => row.map(String));
    else throw new Error("Use an array of objects or arrays");
  } else {
    rows = []; let row: string[] = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else if (quoted || !cell) quoted = !quoted;
        else cell += c;
      } else if (c === "," && !quoted) { row.push(cell); cell = ""; }
      else if ((c === "\n" || c === "\r") && !quoted) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (quoted) throw new Error("Unclosed CSV quote");
    if (cell || row.length) { row.push(cell); rows.push(row); }
  }
  const columns = rows.shift() ?? [];
  if (!columns.length) throw new Error("No columns found");
  if (columns.length > 100 || rows.length > 10000) throw new Error("Limit: 100 columns and 10,000 rows");
  if (rows.some((row) => row.length > columns.length)) throw new Error("A row has more cells than the header");
  return { kind: "data-table", columns, rows: rows.map((row) => columns.map((_, i) => row[i] ?? "")) };
}

export function tableCSV(table: TableState) {
  return [table.columns, ...table.rows].map((row) => row.map((cell) => /[",\n\r]/.test(cell) ? `"${cell.replaceAll('"', '""')}"` : cell).join(",")).join("\n");
}

export function workspaceText(workspace: Workspace): string {
  if (workspace.type === "text-editor") return workspace.editor?.text ?? "";
  if (workspace.tool?.kind === "document-preview") return workspace.tool.output ?? "";
  if (workspace.tool?.kind === "ollama") return workspace.tool.output;
  if (workspace.tool?.kind === "data-table") return tableCSV(workspace.tool);
  if (workspace.tool?.kind === "math-lab") return workspace.tool.expressions;
  if (workspace.tool?.kind === "controls") {
    try { return JSON.stringify(Object.fromEntries(parseControls(workspace.tool.text).map((control) => [control.name, control.value])), null, 2); } catch { return workspace.tool.output; }
  }
  if (workspace.tool && "output" in workspace.tool) return workspace.tool.output;
  return "";
}

export function workspaceTable(workspace: Workspace, graph: Graph): TableState | null {
  if (workspace.tool?.kind === "data-table") return workspace.tool;
  if (workspace.tool && "table" in workspace.tool) return workspace.tool.table ?? null;
  if (workspace.tool?.kind !== "math-lab") return null;
  const state = workspace.tool;
  const source = graph.workspaces.find((item) => item.id === state.sourceId && item.type !== "math-lab" && graph.wires.some((wire) => wire.source === item.id && wire.target === workspace.id));
  const parsed = parseMath(source ? workspaceText(source) : state.expressions);
  const scope = { ...Object.fromEntries(Object.entries(parsed.parameters).map(([name, value]) => [name, state.parameters[name]?.value ?? value])), ...Object.fromEntries(Object.entries(savedControls(graph, workspace.id)).filter(([, value]) => typeof value === "number")) } as Record<string, number>;
  const [min, max] = state.bounds;
  return {
    kind: "data-table", columns: ["x", ...parsed.curves.map((_, i) => `y${i + 1}`)],
    rows: Array.from({ length: 201 }, (_, i) => {
      const x = min + (max - min) * i / 200;
      return [String(x), ...parsed.curves.map((curve) => {
        const value = curve.evaluate({ ...scope, x });
        return Number.isFinite(value) ? String(value) : "";
      })];
    }),
  };
}

export function workspaceFiles(workspace: Workspace): ContentEntry[] {
  return [...workspace.contents, ...(workspace.tool && "files" in workspace.tool ? workspace.tool.files ?? [] : [])];
}

export async function fileText(file: ContentEntry) {
  const response = await fetch(file.dataUrl);
  if (!response.ok) throw new Error(`Unable to read ${file.name} (${response.status})`);
  const bytes = await response.arrayBuffer();
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("Choose a UTF-8 text file");
  return text;
}

export async function fileBase64(file: ContentEntry): Promise<string> {
  const response = await fetch(file.dataUrl);
  if (!response.ok) throw new Error(`Unable to read ${file.name} (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(blob);
  });
}

export function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
