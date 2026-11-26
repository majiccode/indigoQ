"use client";

import { useEffect, useRef, useState } from "react";
import type { ToolState } from "@/lib/types";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { registerWorkspaceFlush } from "@/lib/workspaceFlush";

export function useToolState<T extends ToolState>(initial: T, onOperation: TypedWorkspaceProps["onOperation"], needsInitialization = false) {
  const [state, setState] = useState(initial);
  const [status, setStatus] = useState("Ready");
  const operation = useRef(onOperation);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(state);
  const pending = useRef(Promise.resolve());
  useEffect(() => { operation.current = onOperation; }, [onOperation]);
  useEffect(() => registerWorkspaceFlush(async () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      pending.current = pending.current.then(async () => {
        await operation.current({ kind: "tool", state: latest.current });
      });
    }
    await pending.current;
  }), []);
  useEffect(() => {
    if (needsInitialization) {
      pending.current = pending.current.then(async () => {
        try { await operation.current({ kind: "tool", state: latest.current }); }
        catch (error) { setStatus(`Save failed: ${(error as Error).message}`); }
      });
    }
  }, [needsInitialization]);
  const persist = (next: T) => {
    pending.current = pending.current.then(async () => {
      try { await operation.current({ kind: "tool", state: next }); setStatus("Saved"); }
      catch (error) { setStatus(`Save failed: ${(error as Error).message}`); }
    });
  };
  const update = (next: T) => {
    latest.current = next; setState(next); setStatus("Editing…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; persist(next); }, 500);
  };
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      const next = latest.current;
      void pending.current.then(() => operation.current({ kind: "tool", state: next })).catch(() => {});
    }
  }, []);
  return { state, update, status };
}
