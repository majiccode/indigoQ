"use client";

import { useSyncExternalStore } from "react";
import type { ControlValue } from "./studio";
import { incoming, parseControls } from "./studio";
import type { Graph, TableState } from "./types";

export interface LiveOutput { controls?: Record<string, ControlValue>; text?: string; table?: TableState }
const values = new Map<string, LiveOutput>();
const listeners = new Set<() => void>();
let revision = 0;
export function publishLive(id: string, value: LiveOutput) {
  values.set(id, value); revision++; listeners.forEach((listener) => listener());
}
export function clearLive(id: string) {
  if (values.delete(id)) { revision++; listeners.forEach((listener) => listener()); }
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useLiveRevision() { return useSyncExternalStore(subscribe, () => revision, () => 0); }
export function liveOutput(id: string) { return values.get(id); }
export function connectedControls(graph: Graph, id: string, visited = new Set<string>()): Record<string, ControlValue> {
  if (visited.has(id)) return {};
  const seen = new Set(visited).add(id);
  const result: Record<string, ControlValue> = {};
  for (const source of incoming(graph, id)) {
    if (seen.has(source.id)) continue;
    if (source.tool?.kind === "controls") {
      try { Object.assign(result, Object.fromEntries(parseControls(source.tool.text).map((item) => [item.name, item.value]))); } catch {}
    }
    if (source.tool?.kind === "timeline") {
      try { Object.assign(result, JSON.parse(source.tool.output || "{}")); } catch {}
    }
    Object.assign(result, values.get(source.id)?.controls);
    if (source.tool?.kind === "controls") Object.assign(result, connectedControls(graph, source.id, seen));
  }
  return result;
}
