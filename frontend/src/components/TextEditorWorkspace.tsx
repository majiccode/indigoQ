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
import { detectSelectionTokens, type SelectionToken } from "@/lib/selectionEditors";
import SelectionEditors from "./SelectionEditors";
import { useSpeechInput } from "./useSpeechInput";
import { appendSpeech } from "@/lib/speech";

const EXAMPLE = `// A living document. Select a value to shape it.\n\nconst signal = {\n  frequency: 220,\n  amplitude: 0.65,\n  phase: 0.25,\n};\n\n// Tune the curve with the controls below.\nconst envelope = {\n  attack: 0.12,\n  decay: 0.45,\n  sustain: 0.7,\n  release: 1.2,\n};\n\nconst points = [0.2, 0.85, 0.4, 0.65, 0.3];\n\n// Select these values for colour wheels, toggles, dials and XY pads.\nconst accent = "#c8a4ff";\nconst overlay = "rgba(200, 164, 255, 0.8)";\nconst tint = "hsv(264, 36%, 100%)";\nconst enabled = true;\nconst spacing = "24px";\nconst rotation = "45deg";\nconst position = { x: 10, y: 20 };\nconst anchor = [0.2, 0.8];\n\n// Wire a FileWorkspace → here to open a file.\n// Wire here → a FileWorkspace to save your document.\n`;

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

const instrumentRoots = new WeakMap<HTMLElement, Root>();

class InlineInstruments extends WidgetType {
  constructor(readonly tokens: SelectionToken[]) { super(); }
  eq(other: InlineInstruments) {
    return JSON.stringify(this.tokens) === JSON.stringify(other.tokens);
  }
  render(container: HTMLElement, view: EditorView) {
    let root = instrumentRoots.get(container);
    if (!root) { root = createRoot(container); instrumentRoots.set(container, root); }
    root.render(<SelectionEditors tokens={this.tokens} onChange={(token, replacement) => {
        // Read the current document rather than a stale React render during dragging.
        const current = detectSelectionTokens(view.state.doc.toString(), 0, view.state.selection.main.from, view.state.selection.main.to)
          .find((item) => item.from === token.from && item.kind === token.kind);
        if (!current) return;
        view.dispatch({ changes: { from: current.from, to: current.to, insert: replacement },
          selection: { anchor: token.from, head: token.from + replacement.length }, userEvent: "input.selection-editor" });
    }} />);
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
  const tokens = detectSelectionTokens(state.doc.toString(), 0, selection.from, selection.to);
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
  const [line, setLine] = useState(1);
  const [status, setStatus] = useState("Draft");
  const [picker, setPicker] = useState<Picker>(null);
  const [fileMenu, setFileMenu] = useState(false);
  const [destination, setDestination] = useState("");
  const [filename, setFilename] = useState(initial.name);
  const [overwrite, setOverwrite] = useState("");
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
            setLine(currentLine.number);
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

  useSpeechInput(graph, workspace.id, (phrase) => {
    const view = viewRef.current;
    if (!view) return;
    const insert = appendSpeech(view.state.doc.toString(), phrase).slice(view.state.doc.length);
    view.dispatch({ changes: { from: view.state.doc.length, insert }, userEvent: "input.speech" });
  }, workspace.autoUpdate !== false);

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
