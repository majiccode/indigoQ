"use client";

import CanvasBoard from "./CanvasBoard";

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden>
      <svg viewBox="0 0 32 32" width="21" height="21">
        <path
          d="M16 4.8 26.2 16 16 27.2 5.8 16 16 4.8Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="m19.8 19.8 5 5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

export default function IndigoQApp() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <div className="brand-copy">
            <span className="brand-name">
              indigo<span className="brand-q">Q</span>
            </span>
            <span className="brand-sub">workspace canvas</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span className="topbar-chip">alpha</span>
          <span className="topbar-note">infinite canvas · isolated units · dataflow</span>
        </div>
      </header>
      <CanvasBoard />
    </div>
  );
}
