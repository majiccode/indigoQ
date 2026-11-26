"use client";

import { useEffect, useRef, useState } from "react";
import { EditorState, StateField } from "@codemirror/state";
import { EditorView, Decoration, WidgetType, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, type DecorationSet } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting, bracketMatching } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { tags } from "@lezer/highlight";
import { connectedWorkspaces, type TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import type { EditorDocument, Workspace } from "@/lib/types";
import { workspaceText } from "@/lib/workspaceData";
import { registerWorkspaceFlush } from "@/lib/workspaceFlush";

const EXAMPLE = `// A living document. Select a number to shape it.\n\nconst signal = {\n  frequency: 220,\n  amplitude: 0.65,\n  phase: 0.25,\n};\n\n// Tune the curve with the controls below.\nconst envelope = {\n  attack: 0.12,\n  decay: 0.45,\n  sustain: 0.7,\n  release: 1.2,\n};\n\nconst points = [0.2, 0.85, 0.4, 0.65, 0.3];\n\n// Wire a FileWorkspace → here to open a file.\n// Wire here → a FileWorkspace to save your document.\n`;

const highlight = HighlightStyle.define([
  { tag: tags.comment, color: "#788575", fontStyle: "italic" },
  { tag: tags.number, color: "#c3a6f5" },
  { tag: tags.string, color: "#c7dc9b" },
  { tag: tags.keyword, color: "#e4bf87" },
  { tag: tags.propertyName, color: "#9ad6cf" },
  { tag: tags.operator, color: "#a4afa0" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", background: "#192019", color: "#e1e6d9", fontSize: "16px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif", lineHeight: "1.85" },
  ".cm-content": { padding: "18px 0 90px", caretColor: "#d8c0ff" },
  ".cm-line": { padding: "0 24px" },
  ".cm-gutters": { background: "#171e17", color: "#596754", borderRight: "1px solid #364232" },
  ".cm-gutterElement": { padding: "0 12px" },
  ".cm-activeLineGutter, .cm-activeLine": { background: "#242e2266" },
  "&.cm-focused": { outline: "none" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { background: "#a98ac34a !important" },
  ".cm-cursor": { borderLeftColor: "#eadcff" },
}, { dark: true });

interface NumberToken { from: number; to: number; value: number; label: string; raw: string }
function numbersOnLine(text: string, from: number): NumberToken[] {
  return Array.from(text.matchAll(/(?<![\w.])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi), (match, index) => {
    const before = text.slice(0, match.index);
    const name = before.match(/([a-zA-Z_]\w*)\s*[:=]\s*$/)?.[1];
    return { from: from + match.index, to: from + match.index + match[0].length,
      value: Number(match[0]), label: name ?? `value ${index + 1}`, raw: match[0] };
  });
}

function NumberKnob({ token, onChange }: { token: NumberToken; onChange: (value: number) => void }) {
  const [{ min, max }] = useState(() => {
    const radius = Math.max(Math.abs(token.value) * 2, 1);
    return { min: token.value < 0 ? -radius : 0, max: radius };
  });
  const percent = (token.value - min) / (max - min);
  return (
    <label className="editor-knob">
      <span className="editor-knob-face" style={{ background: `conic-gradient(from 220deg, #b997ef ${percent * 280}deg, #3c4938 0deg 280deg, transparent 0)` }}>
        <span><i>{token.label}</i><strong>{Number(token.value.toFixed(4))}</strong></span>
        <input aria-label={`Adjust ${token.label}`} type="range" min={min} max={max}
          step={Math.abs(token.value) >= 10 && !token.raw.includes(".") ? 1 : 0.001}
          value={token.value} onChange={(event) => onChange(Number(event.target.value))} />
      </span>
      <small>{token.label}</small>
    </label>
  );
}

function SelectionGraph({ values, mode }: { values: number[]; mode: string }) {
  const safe = values.length ? values : [0.2, 0.6, 0.3];
  const max = Math.max(1, ...safe.map(Math.abs));
  const points = mode === "wave"
    ? Array.from({ length: 120 }, (_, i) => `${i * 3},${65 - Math.sin(i / 12 * Math.max(0.2, Math.abs(safe[0]) % 10)) * 40 * Math.min(1, Math.abs(safe[1] ?? 0.65))}`).join(" ")
    : safe.map((value, i) => `${12 + i * (336 / Math.max(1, safe.length - 1))},${110 - (value / max) * 90}`).join(" ");
  return <svg className="editor-selection-graph" viewBox="0 0 360 130" role="img" aria-label="Visualization of selected numeric values">
    {[30, 65, 100].map((y) => <path key={y} d={`M0 ${y}H360`} stroke="#3b4836" strokeWidth="0.7" />)}
    <polyline points={points} fill="none" stroke="#b7d595" strokeWidth="2" />
    {mode !== "wave" && points.split(" ").map((point, i) => <circle key={i} cx={point.split(",")[0]} cy={point.split(",")[1]} r="3" fill="#d5b9fc" />)}
  </svg>;
}

const instrumentRoots = new WeakMap<HTMLElement, Root>();

class InlineInstruments extends WidgetType {
  constructor(readonly tokens: NumberToken[]) { super(); }
  eq(other: InlineInstruments) {
    return JSON.stringify(this.tokens) === JSON.stringify(other.tokens);
  }
  render(container: HTMLElement, view: EditorView) {
    let root = instrumentRoots.get(container);
    if (!root) { root = createRoot(container); instrumentRoots.set(container, root); }
    root.render(<div className="editor-instrument-row"><div className="editor-knobs">
      {this.tokens.slice(0, 6).map((token) => <NumberKnob key={token.from} token={token} onChange={(value) => {
        const replacement = String(Number(value.toFixed(4)));
        view.dispatch({ changes: { from: token.from, to: token.to, insert: replacement },
          selection: { anchor: token.from, head: token.from + replacement.length } });
      }} />)}
    </div><SelectionGraph values={this.tokens.map((token) => token.value)} mode="curve" /></div>);
  }
  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "editor-inline-instruments";
    this.render(container, view);
    return container;
  }
  updateDOM(container: HTMLElement, view: EditorView) { this.render(container, view); return true; }
  destroy(container: HTMLElement) {
    const root = instrumentRoots.get(container);
    instrumentRoots.delete(container);
    if (root) queueMicrotask(() => root.unmount());
  }
  ignoreEvent() { return true; }
}

function inlineDecorations(state: EditorState): DecorationSet {
  const selection = state.selection.main;
  const line = state.doc.lineAt(selection.head);
  // Reveal controls beside the edited text only after a deliberate selection.
  if (selection.empty) return Decoration.none;
  const tokens = numbersOnLine(line.text, line.from).filter((token) => token.to > selection.from && token.from < selection.to);
  return tokens.length ? Decoration.set([Decoration.widget({ widget: new InlineInstruments(tokens), block: true, side: 1 }).range(line.to)]) : Decoration.none;
}

const inlineInstrumentField = StateField.define<DecorationSet>({
  create: inlineDecorations,
  update: (value, transaction) => transaction.docChanged || transaction.selection ? inlineDecorations(transaction.state) : value,
  provide: (field) => EditorView.decorations.from(field),
});

type Picker = "open" | "save" | null;

export default function TextEditorWorkspace({ workspace, graph, onOperation }: TypedWorkspaceProps) {
  const initial = workspace.editor ?? { text: "", name: "untitled.txt", sourceWorkspaceId: null, sourceFileId: null };
  const [document, setDocument] = useState<EditorDocument>(initial);
  const [tokens, setTokens] = useState<NumberToken[]>([]);
  const [selectionLabel, setSelectionLabel] = useState("Select a number or a line of values");
  const [line, setLine] = useState(1);
  const [status, setStatus] = useState("Draft");
  const [picker, setPicker] = useState<Picker>(null);
  const [fileMenu, setFileMenu] = useState(false);
  const [destination, setDestination] = useState("");
  const [filename, setFilename] = useState(initial.name);
  const [overwrite, setOverwrite] = useState("");
  const [visualization, setVisualization] = useState("curve");
  const [busy, setBusy] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const documentRef = useRef(document);
  const operationRef = useRef(onOperation);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<unknown>>(Promise.resolve());
  const incoming = connectedWorkspaces(graph, workspace.id, "incoming", "files").filter((item) => item.type === "content-source");
  const outgoing = connectedWorkspaces(graph, workspace.id, "outgoing", "files").filter((item) => item.type === "content-source");
  const textInputs = connectedWorkspaces(graph, workspace.id, "incoming", "text");

  useEffect(() => { operationRef.current = onOperation; }, [onOperation]);
  useEffect(() => registerWorkspaceFlush(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current); timerRef.current = null;
      pendingRef.current = pendingRef.current.catch(() => {}).then(() => operationRef.current({ kind: "draft", document: documentRef.current }));
    }
    await pendingRef.current;
  }), []);

  useEffect(() => {
    if (!hostRef.current) return;
    const initialDocument = documentRef.current;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({ doc: initialDocument.text, extensions: [
        lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), drawSelection(), history(), bracketMatching(), javascript(),
        syntaxHighlighting(highlight), theme, keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping, inlineInstrumentField,
        EditorView.contentAttributes.of({ "aria-label": "Text editor" }),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const selection = update.state.selection.main;
            const currentLine = update.state.doc.lineAt(selection.head);
            const selectedText = update.state.sliceDoc(selection.from, selection.to);
            const isNumberSelection = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(selectedText);
            const all = numbersOnLine(currentLine.text, currentLine.from);
            setTokens(isNumberSelection ? all.filter((token) => token.from >= selection.from && token.to <= selection.to) : all);
            setLine(currentLine.number);
            setSelectionLabel(selectedText ? `Selection · ${selectedText.slice(0, 40)}` : `Line ${currentLine.number} · numeric controls`);
          }
          if (update.docChanged) {
            const next = { ...documentRef.current, text: update.state.doc.toString() };
            documentRef.current = next;
            setDocument(next);
            setStatus("Editing…");
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              pendingRef.current = pendingRef.current.catch(() => {}).then(() => operationRef.current({ kind: "draft", document: documentRef.current }))
                .then(() => setStatus("Draft saved"), (error) => setStatus(error instanceof Error ? error.message : "Unable to save draft"));
            }, 700);
          }
        }),
      ] }),
    });
    viewRef.current = view;
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        const draft = documentRef.current;
        void pendingRef.current.catch(() => {}).then(() => operationRef.current({ kind: "draft", document: draft })).catch(() => {});
      }
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  const flushDraft = async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    await pendingRef.current;
    await operationRef.current({ kind: "draft", document: documentRef.current });
  };

  const applyDocument = (next: Workspace) => {
    if (!next.editor) return;
    documentRef.current = next.editor;
    setDocument(next.editor);
    setFilename(next.editor.name);
    const view = viewRef.current;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next.editor.text }, selection: { anchor: 0 } });
    setPicker(null);
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    try { await operation(); } catch (error) { setStatus(error instanceof Error ? error.message : "Operation failed"); }
    finally { setBusy(false); }
  };

  const openFile = (sourceId: string, fileId: string) => run(async () => {
    await flushDraft();
    applyDocument(await operationRef.current({ kind: "open", workspaceId: sourceId, fileId }));
    setStatus("File opened");
  });

  const saveFile = () => run(async () => {
    if (!destination || !filename.trim()) throw new Error("Choose an output workspace and a filename");
    await flushDraft();
    applyDocument(await operationRef.current({ kind: "save", workspaceId: destination, fileId: overwrite || undefined, name: filename.trim(), text: documentRef.current.text }));
    setStatus("Saved to FileWorkspace");
  });

  return (
    <div className="text-editor-workspace" onDoubleClick={(event) => event.stopPropagation()}>
      <div className="editor-toolbar">
        <div className="editor-file-menu">
          <button type="button" aria-label="File" aria-expanded={fileMenu} onClick={() => setFileMenu(!fileMenu)}>File <span aria-hidden>⌄</span></button>
          {fileMenu && <div role="menu" className="editor-menu">
            <button type="button" role="menuitem" onClick={() => { setPicker("open"); setFileMenu(false); }}>Open… <small>{incoming.length} inputs</small></button>
            <button type="button" role="menuitem" onClick={() => { setPicker("save"); setFileMenu(false); setDestination(outgoing[0]?.id ?? ""); setFilename(document.name); setOverwrite(""); }}>Save… <small>{outgoing.length} outputs</small></button>
            <button type="button" role="menuitem" onClick={() => { viewRef.current?.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: "" } }); documentRef.current = { ...documentRef.current, name: "untitled.txt", sourceFileId: null, sourceWorkspaceId: null }; setDocument(documentRef.current); setFileMenu(false); }}>New document</button>
          </div>}
        </div>
        <span className="editor-document-name">{document.name}</span>
        {!!textInputs.length && <select aria-label="Import connected text" value="" onChange={(event) => {
          const source = textInputs.find((item) => item.id === event.target.value);
          const view = viewRef.current;
          if (source && view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: workspaceText(source) } });
        }}><option value="">Import text…</option>{textInputs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
        <button type="button" className="editor-example" onClick={() => viewRef.current?.dispatch({ changes: { from: 0, to: viewRef.current.state.doc.length, insert: EXAMPLE } })}>Example</button>
        <span className="editor-live-badge">● LIVE TEXT</span>
      </div>
      <div className="editor-surface" ref={hostRef} />
      <section className="editor-instruments" aria-label="Selection instruments">
        <div className="editor-instrument-heading"><span>{selectionLabel}</span><select aria-label="Visualization" value={visualization} onChange={(event) => setVisualization(event.target.value)}><option value="curve">Curve</option><option value="wave">Wave</option></select></div>
        {tokens.length ? <div className="editor-instrument-row">
          <div className="editor-knobs">{tokens.slice(0, 8).map((token) => <NumberKnob key={token.from} token={token} onChange={(value) => {
            const view = viewRef.current;
            if (!view) return;
            const replacement = String(Number(value.toFixed(4)));
            view.dispatch({ changes: { from: token.from, to: token.to, insert: replacement }, selection: { anchor: token.from, head: token.from + replacement.length } });
          }} />)}</div>
          <SelectionGraph values={tokens.map((token) => token.value)} mode={visualization} />
        </div> : <div className="editor-instrument-empty">Highlight a numeric value to reveal a knob. Select a line of values to explore its curve.</div>}
      </section>
      <footer className="editor-footer"><span role="status">{status}</span><span>Ln {line} · {document.text.length} chars · UTF-8</span></footer>

      {picker && <div className="editor-dialog-backdrop"><div className="editor-dialog" role="dialog" aria-label={picker === "open" ? "Open connected file" : "Save to connected workspace"}>
        <header><strong>{picker === "open" ? "Open a file" : "Save document"}</strong><button type="button" aria-label="Close file dialog" onClick={() => setPicker(null)}>×</button></header>
        <p>{picker === "open" ? "Files exposed by incoming FileWorkspace connections." : "Write text to an outgoing FileWorkspace connection."}</p>
        {picker === "open" ? incoming.length ? incoming.map((source) => <section key={source.id}><h4>{source.name}</h4>{source.contents.length ? source.contents.map((file) => <button className="editor-open-file" key={file.id} disabled={busy} onClick={() => openFile(source.id, file.id)}><span>▤ {file.name}</span><small>{file.mimeType}</small></button>) : <small>No files in this workspace.</small>}</section>) : <div className="editor-no-connections">Connect FileWorkspace → TextEditor to open files.</div> : outgoing.length ? <>
          <label>Destination<select aria-label="Save destination" value={destination} onChange={(event) => { setDestination(event.target.value); setOverwrite(""); }}>{outgoing.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
          <label>File<select aria-label="Save file" value={overwrite} onChange={(event) => { setOverwrite(event.target.value); const file = outgoing.find((target) => target.id === destination)?.contents.find((file) => file.id === event.target.value); if (file) setFilename(file.name); }}><option value="">Create a new file</option>{outgoing.find((target) => target.id === destination)?.contents.map((file) => <option key={file.id} value={file.id}>Overwrite {file.name}</option>)}</select></label>
          <label>Filename<input aria-label="Filename" value={filename} onChange={(event) => setFilename(event.target.value)} /></label>
          <button type="button" className="editor-save-button" disabled={busy} onClick={saveFile}>{busy ? "Saving…" : "Save document"}</button>
        </> : <div className="editor-no-connections">Connect TextEditor → FileWorkspace to save files.</div>}
        <small role="status">{status}</small>
      </div></div>}
    </div>
  );
}
