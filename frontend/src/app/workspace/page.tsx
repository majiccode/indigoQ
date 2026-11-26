import FullscreenWorkspaceView from "@/components/FullscreenWorkspaceView";
import Link from "next/link";

import type { Workspace } from "@/lib/types";

const TOOLBAR_ICONS = ["grid", "play", "sliders", "search"] as const;

export default async function WorkspacePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ id?: string }>;
}>) {
  const params = await searchParams;
  const workspaceId = params.id ?? "";
  let workspace: Workspace | null = null;

  if (workspaceId) {
    try {
      const response = await fetch(
        `${process.env.INDIGOQ_API_URL ?? "http://127.0.0.1:8787"}/api/graph`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const snapshot = await response.json();
        workspace =
          snapshot.workspaces?.find((item: { id: string }) => item.id === workspaceId) ?? null;
      }
    } catch {
      workspace = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="ws-topbar">
        <Link href="/" className="ws-back" aria-label="Back to canvas" title="Back to canvas">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
            <path
              d="M11 6 5 8l6 2"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="ws-title">{workspace?.name ?? workspaceId}</div>
        <div className="ws-toolbar">
          {TOOLBAR_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className="ws-toolbar-button"
              aria-label={icon}
              title={icon}
            >
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                {icon === "grid" && (
                  <>
                    <path d="M4 4h2v2H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 4h2v2h-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 10h2v2H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M10 10h2v2h-2z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </>
                )}
                {icon === "play" && (
                  <path
                    d="M5 3l5 3.5-5 3.5z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {icon === "sliders" && (
                  <>
                    <path d="M3 4h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M3 8h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    <path d="M3 12h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </>
                )}
                {icon === "search" && (
                  <>
                    <circle
                      cx="7"
                      cy="7"
                      r="3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                    <path d="M10 10l3 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </>
                )}
              </svg>
            </button>
          ))}
        </div>
      </header>

      {workspace ? (
        <FullscreenWorkspaceView
          initialWorkspace={workspace}
        />
      ) : (
        <div className="fs-main">
          <div className="fs-card">
            <div className="fs-card-header">
              <span className="fs-card-name">Workspace not found</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
