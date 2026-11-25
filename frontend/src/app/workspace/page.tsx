import CanvasBoard from "@/components/CanvasBoard";
import Link from "next/link";

const TOOLBAR_ICONS = ["grid", "play", "sliders", "search"] as const;

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

export default async function WorkspacePage({
  searchParams,
}: Readonly<{
  searchParams: Promise<{ id?: string }>;
}>) {
  const params = await searchParams;
  const workspaceId = params.id ?? "";
  let workspaceName: string | null = null;

  if (workspaceId) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8787"}/api/graph`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const snapshot = await response.json();
        const workspace = snapshot.workspaces?.find(
          (item: { id: string }) => item.id === workspaceId,
        );
        workspaceName = workspace?.name ?? null;
      }
    } catch {
      workspaceName = null;
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link href="/" className="hud-button" aria-label="Back to canvas" title="Back to canvas">
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
        <div className="brand">
          <BrandMark />
          <div className="brand-copy">
            <span className="brand-name">
              indigo<span className="brand-q">Q</span>
            </span>
            <span className="brand-sub">{workspaceName ?? workspaceId}</span>
          </div>
        </div>
        <div className="topbar-meta">
          {TOOLBAR_ICONS.map((icon) => (
            <button
              key={icon}
              type="button"
              className="hud-button"
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
          <span className="topbar-chip">workspace</span>
        </div>
      </header>

      <div className="stage" style={{ height: "calc(100dvh - 100px)" }}>
        <CanvasBoard focusWorkspaceId={workspaceId || undefined} />
      </div>

      <footer className="workspace-footer">
        <span className="footer-label">{workspaceName ?? workspaceId}</span>
        <span className="footer-divider" />
        <span className="footer-hint">
          Drag a corner to resize · drag header to move · double-click header to rename
        </span>
      </footer>
    </div>
  );
}
