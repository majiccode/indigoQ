"use client";

import { useEffect, useRef } from "react";

export function useAutoProcess(enabled: boolean, signature: string, action: () => Promise<void>) {
  const latest = useRef(action);
  const pending = useRef(false);
  const last = useRef("");
  useEffect(() => { latest.current = action; });
  useEffect(() => {
    if (!enabled || !signature) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(async function run() {
      if (!active) return;
      if (pending.current) { retry = setTimeout(run, 100); return; }
      if (last.current === signature) return;
      last.current = signature; pending.current = true;
      try { await latest.current(); } finally { pending.current = false; }
    }, 350);
    return () => { active = false; clearTimeout(timer); if (retry) clearTimeout(retry); };
  }, [enabled, signature]);
}
