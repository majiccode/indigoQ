"use client";

import { useState } from "react";
import type { ContentEntry } from "@/lib/types";

export default function VideoPreview({ file }: { file: ContentEntry }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  return <figure className="video-preview">
    <video key={file.dataUrl} controls playsInline preload="metadata" aria-label={`Video preview: ${file.name}`} src={file.dataUrl} onError={() => setFailedSource(file.dataUrl)}>
      Your browser cannot play this video. Download it to use another player.
    </video>
    {failedSource === file.dataUrl && <p role="alert" className="tool-error">Unable to play this video. The file may be unavailable or its codec may not be supported by this browser.</p>}
    <figcaption><a href={file.dataUrl} download={file.name}>Download {file.name}</a><small>Playback depends on your browser’s supported video formats and codecs.</small></figcaption>
  </figure>;
}
