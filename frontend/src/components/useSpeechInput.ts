"use client";

import { useEffect, useRef } from "react";
import type { Graph } from "@/lib/types";
import { liveOutput, useLiveRevision } from "@/lib/studioRuntime";

// Only finalized phrases enter editable documents; interim hypotheses stay in the source preview.
export function useSpeechInput(graph: Graph, id: string, receive: (phrase: string) => void, enabled = true) {
  const revision = useLiveRevision();
  const callback = useRef(receive);
  const consumed = useRef(new Map<string, number>());
  useEffect(() => { callback.current = receive; });
  useEffect(() => {
    const sources = new Set(graph.wires.filter((wire) => wire.target === id).map((wire) => wire.source));
    for (const source of sources) {
      const speech = liveOutput(source)?.speech;
      if (!speech) continue;
      const key = `${source}/${speech.session}`, offset = consumed.current.get(key) ?? 0;
      consumed.current.set(key, speech.text.length);
      const phrase = speech.text.slice(offset).trim();
      if (phrase && enabled) callback.current(phrase);
    }
  }, [revision, graph, id, enabled]);
}
