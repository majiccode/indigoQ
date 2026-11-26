"use client";

import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { workspaceTable, tableCSV } from "@/lib/workspaceData";
import { studioRequest } from "@/lib/studioApi";
import { StudioShell, useStudio } from "./StudioKit";
import { autoUpdateEnabled } from "@/lib/autoUpdate";
import { useAutoProcess } from "./useAutoProcess";

export default function SqlWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "sql");
  const tables = app.sources.flatMap((source) => { const table = workspaceTable(source, props.graph); return table ? [{ source, table }] : []; });
  const execute = () => app.run(async () => {
    const result = await studioRequest("sql", { query: app.state.text, tables: tables.map((item) => item.table) });
    app.patch({ table: result.table, output: tableCSV(result.table), settings: { ...app.state.settings, truncated: result.truncated } });
  });
  useAutoProcess(autoUpdateEnabled(props.workspace), tables.length ? JSON.stringify([app.state.text, tables.map((item) => [item.source.id, item.table])]) : "", execute);
  return <StudioShell kind="sql" status={app.status} error={app.error} actions={<button disabled={app.busy || !tables.length} onClick={() => void execute()}>Run SQL</button>}>
    <div className="tool-summary">{tables.map(({ source, table }, i) => <div key={source.id}><strong>input{i + 1}</strong> = {source.name}<small> ({table.rows.length} rows): {table.columns.join(", ")}</small></div>)}</div>
    {!tables.length && <p className="tool-hint">Connect one or more table-producing workspaces. Query them as input1, input2, … (in canvas workspace order).</p>}
    <textarea className="studio-code" aria-label="SQL query" value={app.state.text} onChange={(event) => app.patch({ text: event.target.value })} />
    <small className="tool-hint">Read-only SQLite SQL in an isolated in-memory backend database. Supports joins, grouping, aggregates, and CTEs. Queries time out after 3 seconds; results are capped at 10,000 rows.</small>
    {app.state.settings.truncated === true && <p className="tool-warning">Results truncated to 10,000 rows.</p>}
    {app.state.table && <div className="data-table-container"><table className="data-table"><thead><tr>{app.state.table.columns.map((name, i) => <th key={i}>{name}</th>)}</tr></thead><tbody>{app.state.table.rows.slice(0, 200).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}
  </StudioShell>;
}
