"use client";

import { useEffect, useRef, useState } from "react";

interface NumberFieldProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  disabled?: boolean;
  ariaLabel?: string;
}

export default function NumberField({ value, onChange, min, max, step, disabled, ariaLabel }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    onChange(parsed);
  };

  return <input
    type="number"
    aria-label={ariaLabel}
    min={min}
    max={max}
    step={step}
    disabled={disabled}
    value={draft}
    onFocus={() => { focused.current = true; }}
    onChange={(event) => { setDraft(event.target.value); commit(event.target.value); }}
    onBlur={() => { focused.current = false; commit(draft); setDraft(String(value)); }}
  />;
}
