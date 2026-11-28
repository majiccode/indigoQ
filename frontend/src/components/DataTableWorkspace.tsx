"use client";

import { useState } from "react";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import type { TableState } from "@/lib/types";
import { downloadText, fileText, parseTable, tableCSV, workspaceFiles, workspaceTable, workspaceText } from "@/lib/workspaceData";
import { compileExpression } from "@/lib/mathEngine";
import { useToolState } from "./useToolState";
import { autoUpdateEnabled } from "@/lib/autoUpdate";
import { useAutoProcess } from "./useAutoProcess";
import { inputFingerprint } from "@/lib/dataflow";

const DEFAULT: TableState = { kind: "data-table", columns: ["x", "y"], rows: [["0", "0"], ["1", "0.84"], ["2", "0.91"], ["3", "0.14"], ["4", "-0.76"], ["5", "-0.96"]] };

export default function DataTableWorkspace({ workspace, graph, onOperation }: TypedWorkspaceProps) {
  const { state, update, status } = useToolState(workspace.tool?.kind === "data-table" ? workspace.tool : DEFAULT, onOperation, !workspace.tool);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ column: number; direction: number } | null>(null);
  const [formula, setFormula] = useState("y * 2");
  const [columnName, setColumnName] = useState("computed");
  const [summary, setSummary] = useState(0);
  const [imported, setImported] = useState<{ id: string; name: string; fingerprint: string } | null>(null);
  const incoming = connectedWorkspaces(graph, workspace.id, "incoming", "text");
  const tables = connectedWorkspaces(graph, workspace.id, "incoming", "table");
  const files = connectedWorkspaces(graph, workspace.id, "incoming", "files").map((item) => ({ ...item, contents: workspaceFiles(item) }));
  const attempt = async (action: () => void | Promise<void>) => { try { setError(""); await action(); } catch (reason) { setError((reason as Error).message); } };
  const importText = (text: string) => update(parseTable(text));
  const autoSource = tables[0] ?? incoming[0] ?? files[0];
  useAutoProcess(autoUpdateEnabled(workspace), autoSource ? JSON.stringify([autoSource.id, autoSource.tool, autoSource.editor, autoSource.contents]) : "", () => attempt(async () => {
    if (!autoSource) return;
    const table = workspaceTable(autoSource, graph);
    if (table) update(table);
    else if (incoming.some((source) => source.id === autoSource.id)) importText(workspaceText(autoSource));
    else if (autoSource.contents[0]) importText(await fileText(autoSource.contents[0]));
  }));
  const visible = state.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.some((cell) => cell.toLowerCase().includes(filter.toLowerCase())));
  if (sort) visible.sort((a, b) => {
    const x = a.row[sort.column] ?? "", y = b.row[sort.column] ?? "";
    return sort.direction * (x.trim() && y.trim() && Number.isFinite(Number(x)) && Number.isFinite(Number(y)) ? Number(x) - Number(y) : x.localeCompare(y));
  });
  const values = state.rows.map((row) => row[summary]).filter((value) => value?.trim() && Number.isFinite(Number(value))).map(Number);
  return <div className="tool-workspace" onDoubleClick={(event) => event.stopPropagation()}>
    <div className="tool-toolbar"><strong>▦ Data Table</strong><button onClick={() => update(DEFAULT)}>Example</button><button onClick={() => downloadText("table.csv", tableCSV(state), "text/csv")}>CSV ↓</button><button onClick={() => downloadText("table.json", JSON.stringify(state.rows.map((row) => Object.fromEntries(state.columns.map((name, i) => [name, row[i]]))), null, 2), "application/json")}>JSON ↓</button></div>
    <div className="tool-scroll">
      <div className="tool-toolbar"><select aria-label="Import connected input" value="" onChange={(event) => {
        const [kind, id, fileId] = event.target.value.split("|");
        void attempt(async () => {
           if (kind === "table") { const source = tables.find((item) => item.id === id); const table = source && workspaceTable(source, graph); if (table && source) { update(table); setImported({ id, name: source.name, fingerprint: inputFingerprint(JSON.stringify(source.tool)) }); } else throw new Error("Source table is not ready yet. Run or publish from that workspace first."); }
           else if (kind === "text") { const source = incoming.find((item) => item.id === id); if (source) { importText(workspaceText(source)); setImported({ id, name: source.name, fingerprint: inputFingerprint(JSON.stringify(source.tool ?? source.editor)) }); } }
           else { const file = files.find((item) => item.id === id)?.contents.find((item) => item.id === fileId); if (file) { importText(await fileText(file)); setImported(null); } }
        });
      }}><option value="">Import connected CSV / JSON…</option>{tables.map((item) => <option key={`table-${item.id}`} value={`table|${item.id}`}>{item.name} — {item.type === "math-lab" ? "sampled curves" : "table"}</option>)}{incoming.filter((item) => !tables.some((table) => table.id === item.id)).map((item) => <option key={item.id} value={`text|${item.id}`}>{item.name} — text</option>)}{files.flatMap((item) => item.contents.map((file) => <option key={`${item.id}/${file.id}`} value={`file|${item.id}|${file.id}`}>{item.name} / {file.name}</option>))}</select>
        <label className="tool-file-button">Open file<input aria-label="Import CSV or JSON file" type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void attempt(async () => importText(await file.text())); event.target.value = ""; }} /></label></div>
      <details className="tool-details"><summary>Paste CSV / JSON</summary><textarea aria-label="CSV or JSON input" placeholder={'x,y\n0,0\n1,0.84'} value={input} onChange={(event) => setInput(event.target.value)} /><button onClick={() => void attempt(() => importText(input))}>Replace table</button></details>
      <div className="tool-toolbar"><input aria-label="Filter rows" placeholder="Filter rows…" value={filter} onChange={(event) => setFilter(event.target.value)} /><button disabled={state.rows.length >= 10000} onClick={() => update({ ...state, rows: [...state.rows, state.columns.map(() => "")] })}>+ Row</button><button disabled={state.columns.length >= 100} onClick={() => update({ ...state, columns: [...state.columns, `column${state.columns.length + 1}`], rows: state.rows.map((row) => [...row, ""]) })}>+ Column</button></div>
      {error && <div className="tool-error" role="alert">{error}</div>}
      <p className="tool-hint" role="status">{autoUpdateEnabled(workspace) && autoSource ? `Following ${autoSource.name}; incoming updates can replace table edits.` : imported ? (() => { const source = graph.workspaces.find((s) => s.id === imported.id); return !source ? `Imported snapshot from ${imported.name}; source disconnected.` : inputFingerprint(JSON.stringify(source.tool ?? source.editor)) !== imported.fingerprint ? `New input available from ${imported.name}. Import again to replace this table; your edits are retained until then.` : `Imported snapshot from ${imported.name}. Table edits stay local until you import again.`; })() : "Editable table. Connected inputs are imported explicitly unless Auto-update is enabled."}</p>
      <div className="data-table-container"><table className="data-table"><thead><tr><th>#</th>{state.columns.map((column, i) => <th key={i}><input aria-label={`Column ${i + 1} name`} value={column} onChange={(event) => update({ ...state, columns: state.columns.map((name, j) => i === j ? event.target.value : name) })} /><button aria-label={`Sort by ${column}`} onClick={() => setSort({ column: i, direction: sort?.column === i ? -sort.direction : 1 })}>{sort?.column === i ? sort.direction === 1 ? "↑" : "↓" : "↕"}</button></th>)}<th /></tr></thead><tbody>{visible.slice(0, 500).map(({ row, index }) => <tr key={index}><td>{index + 1}</td>{state.columns.map((_, i) => <td key={i}><input aria-label={`Row ${index + 1}, ${state.columns[i]}`} value={row[i] ?? ""} onChange={(event) => update({ ...state, rows: state.rows.map((cells, j) => j === index ? state.columns.map((_, k) => k === i ? event.target.value : cells[k] ?? "") : cells) })} /></td>)}<td><button aria-label={`Delete row ${index + 1}`} onClick={() => update({ ...state, rows: state.rows.filter((_, j) => j !== index) })}>×</button></td></tr>)}</tbody></table></div>
      {visible.length > 500 && <small className="tool-hint">Showing the first 500 matching rows; exports and connections include all rows.</small>}
      <div className="tool-summary"><label>Summary <select aria-label="Summary column" value={summary} onChange={(event) => setSummary(Number(event.target.value))}>{state.columns.map((column, i) => <option key={i} value={i}>{column}</option>)}</select></label><span>{values.length} numeric · {state.rows.filter((row) => !row[summary]?.trim()).length} empty</span>{!!values.length && <span>min {Math.min(...values).toPrecision(5)} · max {Math.max(...values).toPrecision(5)} · mean {(values.reduce((a, b) => a + b, 0) / values.length).toPrecision(5)}</span>}</div>
      <details className="tool-details"><summary>Computed column</summary><p>Use column names as variables (letters, digits, underscores), e.g. y * 2 or sqrt(x).</p><div className="tool-toolbar"><input aria-label="Computed column name" value={columnName} onChange={(event) => setColumnName(event.target.value)} /><input aria-label="Column formula" value={formula} onChange={(event) => setFormula(event.target.value)} /><button onClick={() => void attempt(() => {
        if (!columnName.trim() || state.columns.includes(columnName.trim())) throw new Error("Choose a unique column name");
        if (state.columns.length >= 100) throw new Error("Limit: 100 columns");
        const evaluate = compileExpression(formula);
        const rows = state.rows.map((row) => {
          const scope = Object.fromEntries(state.columns.map((name, i) => [name, row[i]?.trim() ? Number(row[i]) : NaN]));
          const value = evaluate(scope);
          if (!Number.isFinite(value)) throw new Error("Formula produced a non-numeric result; check empty cells and column names");
          return [...row, String(value)];
        });
        update({ ...state, columns: [...state.columns, columnName.trim()], rows });
      })}>Add computed column</button></div></details>
      <small className="tool-hint">Wire this workspace → Math Lab to plot its first two columns, or → Ollama for analysis. Imports are snapshots; your edits stay yours.</small>
    </div><footer className="tool-footer" role="status">{status} · {visible.length} / {state.rows.length} rows · {state.columns.length} columns</footer>
  </div>;
}
