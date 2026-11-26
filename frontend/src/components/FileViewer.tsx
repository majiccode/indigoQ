"use client";

import Image from "next/image";

import type { ContentEntry } from "@/lib/types";

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return new Uint8Array(0);
  const base64 = dataUrl.slice(comma + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

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
          {!isImage && !isAudio && (
            <div className="file-viewer-hex">
              <div className="file-viewer-hex-label">Hex</div>
              <pre className="file-viewer-hex-data">{bytesToHex(dataUrlToBytes(entry.dataUrl))}</pre>
              <div className="file-viewer-hex-label">ASCII</div>
              <pre className="file-viewer-hex-data">{bytesToAscii(dataUrlToBytes(entry.dataUrl))}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
