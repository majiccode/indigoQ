"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { ContentEntry } from "@/lib/types";
import { isVideo } from "@/lib/media";
import VideoPreview from "./VideoPreview";

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let index = 0; index < bytes.length; index += 1) {
    hex += bytes[index].toString(16).padStart(2, "0");
    if ((index + 1) % 16 === 0) hex += "\n";
    else if ((index + 1) % 2 === 0) hex += " ";
  }
  return hex;
}

function bytesToAscii(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const code = bytes[index];
    text += code >= 32 && code < 127 ? String.fromCharCode(code) : ".";
    if ((index + 1) % 16 === 0) text += "\n";
  }
  return text;
}

interface FileViewerProps {
  entry: ContentEntry;
  onClose: () => void;
}

export default function FileViewer({
  entry,
  onClose,
}: FileViewerProps) {

  const isImage = entry.mimeType.startsWith("image/");
  const isAudio = entry.mimeType.startsWith("audio/");
  const video = isVideo(entry);
  const [bytes, setBytes] = useState(new Uint8Array());
  const [error, setError] = useState("");
  useEffect(() => {
    if (isImage || isAudio || video) return;
    const controller = new AbortController();
    void fetch(entry.dataUrl, { signal: controller.signal, headers: { Range: "bytes=0-65535" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load file");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!controller.signal.aborted) setBytes(bytes.subarray(0, 65536));
      }).catch((reason) => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [entry.dataUrl, isImage, isAudio, video]);

  return (
    <div className="file-viewer" role="region" aria-label={`Viewing ${entry.name}`}>
      <div className="file-viewer-panel">
        <div className="file-viewer-header">
          <button
            type="button"
            className="file-viewer-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path
                d="M4 4l8 8M4 12l8-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <div className="file-viewer-meta">
            <span className="file-viewer-name">{entry.name}</span>
            <span className="file-viewer-mime">{entry.mimeType}</span>
            <span className="file-viewer-size">
              {(entry.size / 1024).toFixed(1)} KB
            </span>
          </div>
          <button
            type="button"
            className="file-viewer-download"
            onClick={(event) => {
              event.stopPropagation();
              const link = document.createElement("a");
              link.href = entry.dataUrl;
              link.download = entry.name;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            aria-label="Download"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M8 3v8M8 11l-3 3M8 11l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="file-viewer-content">
          {isImage && (
            <Image
              unoptimized
              width={1200}
              height={900}
              className="file-viewer-image"
              src={entry.dataUrl}
              alt={entry.name}
            />
          )}
          {isAudio && (
            <audio
              className="file-viewer-audio"
              controls
              src={entry.dataUrl}
            />
          )}
          {video && <VideoPreview key={`${entry.id}-${entry.dataUrl}`} file={entry} />}
          {!isImage && !isAudio && !video && (
            <div className="file-viewer-hex">
              {error && <p role="alert">{error}</p>}
              <div className="file-viewer-hex-label">Hex</div>
              <pre className="file-viewer-hex-data">{bytesToHex(bytes)}</pre>
              <div className="file-viewer-hex-label">ASCII</div>
              <pre className="file-viewer-hex-data">{bytesToAscii(bytes)}</pre>
              {entry.size > 65536 && <p>Showing the first 64 KB. Download to view the complete file.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
