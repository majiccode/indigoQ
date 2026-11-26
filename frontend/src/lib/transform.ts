import { selectPath } from "./studio";
import { extractRegex } from "./regexWorker";
import { parseTable, stripFence } from "./workspaceData";
import type { StudioState } from "./types";

export async function transformInput(input: string, state: StudioState) {
  const mode = String(state.settings.mode ?? "path");
  let output: string;
  if (mode === "regex") {
    const pattern = String(state.settings.pattern ?? "[0-9]+"), flags = String(state.settings.flags ?? "g");
    if (pattern.length > 200 || input.length > 100000) throw new Error("Regex input limit: 100k chars; pattern limit: 200 chars");
    output = await extractRegex(input, pattern, flags);
  } else {
    const parsed = JSON.parse(stripFence(input));
    if (mode === "path") {
      const value = selectPath(parsed, String(state.settings.path ?? "$"));
      output = JSON.stringify(value, null, 2);
    } else if (mode === "filter") {
      if (!Array.isArray(parsed)) throw new Error("Filter expects a JSON array");
      output = JSON.stringify(parsed.filter((row) => String(selectPath(row, String(state.settings.path ?? "value"))).includes(String(state.settings.contains ?? ""))), null, 2);
    } else {
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      output = rows.map((row) => state.text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, path) => { const value = selectPath(row, path); return typeof value === "object" ? JSON.stringify(value) : String(value); })).join("\n");
    }
  }
  let table = null;
  try { table = parseTable(output); } catch { /* Text-only transformations are valid. */ }
  if (output.trim() === "[]") table = { kind: "data-table" as const, columns: state.table?.columns ?? [], rows: [] };
  return { output, table };
}
