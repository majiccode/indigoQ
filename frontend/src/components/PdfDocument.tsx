"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ContentEntry } from "@/lib/types";
import { pdfPageText } from "@/lib/documentData";

export default function PdfDocument({ file, onText, onError }: { file: ContentEntry; onText: (text: string) => void; onError: (message: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onText, onError });
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { callbacks.current = { onText, onError }; });

  useEffect(() => {
    let active = true;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    void (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      const response = await fetch(file.dataUrl);
      if (!response.ok) throw new Error("Unable to load PDF");
      const data = await response.arrayBuffer();
      if (!active) return;
      task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      if (!active) return;
      setDocument(pdf);
      const pages: string[] = [];
      for (let index = 1; index <= pdf.numPages && active; index++) {
        const content = await (await pdf.getPage(index)).getTextContent();
        pages.push(pdfPageText(content.items));
      }
      if (active) callbacks.current.onText(pages.join("\n\n"));
    })().catch((reason) => { if (active) callbacks.current.onError(reason instanceof Error ? reason.message : "Unable to read PDF"); });
    return () => { active = false; void task?.destroy(); };
  }, [file.dataUrl]);

  useEffect(() => {
    if (!document || !canvas.current) return;
    let active = true;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    void (async () => {
      const pdfPage = await document.getPage(page);
      if (!active || !canvas.current) return;
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      const target = canvas.current;
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      render = pdfPage.render({ canvas: target, viewport });
      await render.promise;
    })().catch((reason) => { if (active) callbacks.current.onError(reason instanceof Error ? reason.message : "Unable to render PDF"); });
    return () => { active = false; render?.cancel(); };
  }, [document, page]);

  return <section className="document-pdf" aria-label={`PDF preview: ${file.name}`}>
    <div className="tool-toolbar">
      <button disabled={!document || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
      <span>{document ? `Page ${page} of ${document.numPages}` : "Loading PDF…"}</span>
      <button disabled={!document || page >= document.numPages} onClick={() => setPage(page + 1)}>Next</button>
      <a href={file.dataUrl} download={file.name}>Download PDF ↓</a>
    </div>
    <canvas ref={canvas} aria-label={`${file.name}, page ${page}`} />
  </section>;
}
