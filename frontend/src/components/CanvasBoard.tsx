"use client";

import {
  useCallback,
  useImperativeHandle,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";
import { useRouter } from "next/navigation";

import {
  drawScene,
  nearestWorkspaceBorder,
  workspaceAt,
} from "@/lib/canvasRenderer";
import {
  MAX_SCALE,
  MIN_SCALE,
  MIN_WORKSPACE_HEIGHT,
  MIN_WORKSPACE_WIDTH,
  clamp,
  closestBorderPoint,
  computeRoute,
  normalizeRect,
  pointInHeader,
  pointInWorkspaceMagnify,
  screenToWorld,
  workspaceResizeAt,
  resizeCursor,
  worldToScreen,
  type Route,
} from "@/lib/geometry";
import { enqueueWorkspaceOperation, fetchGraph, importGraph, saveGraph, uploadContents } from "@/lib/graphApi";
import { flushWorkspaces } from "@/lib/workspaceFlush";
import { createSampleGraph } from "@/lib/graph";
import WorkspaceContent from "@/components/Workspace";
import GraphWorkspace from "@/components/GraphWorkspace";
import type { HoverState, InteractionMode, WireTarget } from "@/lib/interaction";
import {
  readCleared,
  readLocalGraph,
  readLocalViewport,
  writeCleared,
  writeLocalGraph,
  writeLocalViewport,
} from "@/lib/localGraph";
import type {
  Graph,
  Point,
  Viewport,
  Workspace,
  Wire,
} from "@/lib/types";

const PORT_HIT_PX = 10;
const TARGET_HIT_PX = 34;
const CREATE_MIN_PX = 28;
const SAVE_DELAY_MS = 550;
const FIT_PADDING_PX = 140;

type SyncState = "loading" | "saved" | "saving" | "offline";

interface Size {
  width: number;
  height: number;
  dpr: number;
}

interface RenameOverlay {
  id: string;
  left: number;
  top: number;
  width: number;
}

function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function nextWorkspaceName(workspaces: Workspace[]): string {
  const names = new Set(workspaces.map((workspace) => workspace.name));
  let index = 1;
  while (names.has(`Workspace ${index}`)) {
    index += 1;
  }
  return `Workspace ${index}`;
}

function screenPointFromEvent(event: {
  clientX: number;
  clientY: number;
  currentTarget: Element;
}): Point {
  const rect = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function findWireTarget(
  workspaces: Workspace[],
  sourceId: string,
  point: Point,
  tolerance: number,
): WireTarget | null {
  let best: WireTarget | null = null;
  let bestDistance = tolerance;

  for (const workspace of workspaces) {
    if (workspace.id === sourceId) continue;
    const hit = closestBorderPoint(workspace, point);
    if (hit.distance < bestDistance) {
      bestDistance = hit.distance;
      best = {
        workspaceId: workspace.id,
        port: hit.port,
        point: hit.point,
      };
    }
  }

  return best;
}

const EMPTY_HOVER: HoverState = { workspaceId: null, port: null };

interface CanvasBoardProps {
  focusWorkspaceId?: string | null;
  ref?: Ref<CanvasBoardHandle>;
  onReady?: () => void;
}

export interface CanvasBoardHandle {
  snapshot: () => Promise<Graph>;
  load: (graph: Graph) => Promise<void>;
}

export default function CanvasBoard({
  focusWorkspaceId: focusWorkspaceIdProp,
  ref,
  onReady,
}: CanvasBoardProps = {}) {
  const [graph, setGraph] = useState<Graph>(createSampleGraph);
  const [renaming, setRenaming] = useState<RenameOverlay | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [sync, setSync] = useState<SyncState>("loading");
  const [zoomPct, setZoomPct] = useState(100);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [graphEpoch, setGraphEpoch] = useState(0);
  const router = useRouter();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const graphRef = useRef<Graph>(graph);
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, scale: 1 });
  const sizeRef = useRef<Size>({ width: 0, height: 0, dpr: 1 });
  const modeRef = useRef<InteractionMode>({ kind: "idle" });
  const hoverRef = useRef<HoverState>(EMPTY_HOVER);
  const selectedRef = useRef<string | null>(null);
  const renamingRef = useRef<RenameOverlay | null>(null);
  const sceneRevRef = useRef(0);
  const spaceRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const bootstrappedRef = useRef(false);
  const initialFitRef = useRef(false);
  const saveVersionRef = useRef(0);
  const fullscreenViewportRef = useRef<Viewport | null>(null);
  const viewportTimerRef = useRef<number | null>(null);
  const dragOverRef = useRef<string | null>(null);

  const queueRemoteSave = useCallback((next: Graph) => {
    const version = saveVersionRef.current + 1;
    saveVersionRef.current = version;
    setSync("saving");
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      enqueueWorkspaceOperation(() => saveGraph(next))
        .then(() => {
          if (saveVersionRef.current === version) setSync("saved");
        })
        .catch(() => {
          if (saveVersionRef.current === version) setSync("offline");
        });
    }, SAVE_DELAY_MS);
  }, []);

  const queueViewportSave = useCallback(() => {
    writeLocalViewport(viewportRef.current);
    if (viewportTimerRef.current !== null) {
      window.clearTimeout(viewportTimerRef.current);
    }
    viewportTimerRef.current = window.setTimeout(() => {
      viewportTimerRef.current = null;
      writeLocalViewport(viewportRef.current);
    }, 300);
  }, []);

  const commitGraph = useCallback(
    (next: Graph) => {
      graphRef.current = next;
      sceneRevRef.current += 1;
      setGraph(next);
      writeLocalGraph(next);
      queueRemoteSave(next);
    },
    [queueRemoteSave],
  );

  const selectWorkspace = useCallback((id: string | null) => {
    selectedRef.current = id;
  }, []);

  const cancelRename = useCallback(() => {
    renamingRef.current = null;
    setRenaming(null);
    setNameDraft("");
  }, []);

  const commitRename = useCallback(
    (value?: string) => {
      const overlay = renamingRef.current;
      if (!overlay) return;

      const nextName = (value ?? nameDraft).trim().slice(0, 80);
      renamingRef.current = null;
      setRenaming(null);
      setNameDraft("");

      const workspace = graphRef.current.workspaces.find((item) => item.id === overlay.id);
      if (!workspace || !nextName || nextName === workspace.name) return;

      commitGraph({
        ...graphRef.current,
        workspaces: graphRef.current.workspaces.map((item) =>
          item.id === overlay.id ? { ...item, name: nextName } : item,
        ),
      });
    },
    [commitGraph, nameDraft],
  );

  const openRename = useCallback((workspace: Workspace) => {
    const screen = worldToScreen(viewportRef.current, { x: workspace.x, y: workspace.y });
    const overlay: RenameOverlay = {
      id: workspace.id,
      left: screen.x + 10,
      top: screen.y + 7,
      width: Math.max(180, Math.min(workspace.width * viewportRef.current.scale - 24, 380)),
    };
    renamingRef.current = overlay;
    setRenaming(overlay);
    setNameDraft(workspace.name);
  }, []);

  const fitView = useCallback(() => {
    const { width, height } = sizeRef.current;
    if (!width || !height) return;

    const workspaces = graphRef.current.workspaces;
    if (workspaces.length === 0) {
      viewportRef.current = { x: width / 2, y: height / 2, scale: 1 };
      setZoomPct(100);
      return;
    }

    const minX = Math.min(...workspaces.map((workspace) => workspace.x));
    const minY = Math.min(...workspaces.map((workspace) => workspace.y));
    const maxX = Math.max(...workspaces.map((workspace) => workspace.x + workspace.width));
    const maxY = Math.max(...workspaces.map((workspace) => workspace.y + workspace.height));
    const contentWidth = Math.max(1, maxX - minX);
    const contentHeight = Math.max(1, maxY - minY);
    const availableWidth = Math.max(80, width - FIT_PADDING_PX * 2);
    const availableHeight = Math.max(80, height - FIT_PADDING_PX * 2);

    const scale = clamp(
      Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
      MIN_SCALE,
      1.25,
    );
    viewportRef.current = {
      x: (width - contentWidth * scale) / 2 - minX * scale,
      y: (height - contentHeight * scale) / 2 - minY * scale,
      scale,
    };
    setZoomPct(Math.round(scale * 100));
  }, []);

  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      await flushWorkspaces();
      return structuredClone(graphRef.current);
    },
    load: async (incoming) => {
      await flushWorkspaces();
      await enqueueWorkspaceOperation(async () => {
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null;
        }
        saveVersionRef.current += 1;
        const next = await importGraph(incoming);
        graphRef.current = next;
        sceneRevRef.current += 1;
        selectedRef.current = null;
        hoverRef.current = EMPTY_HOVER;
        modeRef.current = { kind: "idle" };
        cancelRename();
        setGraphEpoch((epoch) => epoch + 1);
        setGraph(next);
        writeLocalGraph(next);
        writeCleared(next.workspaces.length === 0);
        fitView();
        writeLocalViewport(viewportRef.current);
        setSync("saved");
      });
    },
  }), [cancelRename, fitView]);

  const zoomBy = useCallback((factor: number, anchor?: Point) => {
    const { width, height } = sizeRef.current;
    const viewport =
      focusWorkspaceIdProp && fullscreenViewportRef.current
        ? fullscreenViewportRef.current
        : viewportRef.current;
    const anchorX = anchor?.x ?? width / 2;
    const anchorY = anchor?.y ?? height / 2;
    const nextScale = clamp(viewport.scale * factor, MIN_SCALE, MAX_SCALE);
    if (nextScale === viewport.scale) return;

    const worldX = (anchorX - viewport.x) / viewport.scale;
    const worldY = (anchorY - viewport.y) / viewport.scale;
    const nextViewport = {
      scale: nextScale,
      x: anchorX - worldX * nextScale,
      y: anchorY - worldY * nextScale,
    };
    if (focusWorkspaceIdProp && fullscreenViewportRef.current) {
      fullscreenViewportRef.current = nextViewport;
    } else {
      viewportRef.current = nextViewport;
    }
    setZoomPct(Math.round(nextScale * 100));
    if (!focusWorkspaceIdProp) queueViewportSave();
  }, [queueViewportSave, focusWorkspaceIdProp]);

  const maybeInitialFit = useCallback(() => {
    if (initialFitRef.current || !bootstrappedRef.current) return;
    if (!sizeRef.current.width || !sizeRef.current.height) return;
    initialFitRef.current = true;

    if (focusWorkspaceIdProp) return;

    const saved = readLocalViewport();
    if (saved) {
      viewportRef.current = saved;
      setZoomPct(Math.round(saved.scale * 100));
      return;
    }
    fitView();
  }, [fitView, focusWorkspaceIdProp]);

  // Reset the isolated fullscreen viewport whenever the focused workspace changes
  // so each workspace view is fitted independently (its own pan/zoom state).
  useEffect(() => {
    fullscreenViewportRef.current = null;
  }, [focusWorkspaceIdProp]);

  const handleDragOver = useCallback(
    (event: ReactDragEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      const canvas = event.currentTarget;
      const screen = screenPointFromEvent({
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: canvas,
      });
      const world = screenToWorld(viewportRef.current, screen);
      const workspace = workspaceAt(graphRef.current.workspaces, world);
      dragOverRef.current = workspace ? workspace.id : null;
      canvas.style.cursor = workspace ? "copy" : "no-drop";
    },
    [],
  );

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    dragOverRef.current = null;
    event.currentTarget.style.cursor = "default";
  }, []);

  const handleDrop = useCallback(
    async (event: ReactDragEvent<HTMLCanvasElement>) => {
      event.preventDefault();
      dragOverRef.current = null;
      const canvas = event.currentTarget;
      canvas.style.cursor = "default";

      const files = event.dataTransfer.files;
      if (!files || files.length === 0) return;

      const screen = screenPointFromEvent({
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: canvas,
      });
      const world = screenToWorld(viewportRef.current, screen);
      const workspace = workspaceAt(graphRef.current.workspaces, world);
      if (!workspace) return;

      const targetId = workspace.id;
      try {
        const updated = await uploadContents(targetId, files);
        const next = {
          ...updated,
          workspaces: updated.workspaces,
          wires: updated.wires,
        };
        graphRef.current = next;
        sceneRevRef.current += 1;
        setGraph(next);
        writeLocalGraph(next);
        selectWorkspace(targetId);
        setUploadError(null);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "Upload failed");
        setTimeout(() => setUploadError(null), 4000);
      }
    },
    [selectWorkspace],
  );

  const cancelInteraction = useCallback(() => {
    const mode = modeRef.current;
    if (mode.kind === "move") {
      const workspace = graphRef.current.workspaces.find((item) => item.id === mode.id);
      if (workspace) {
        workspace.x = mode.origin.x;
        workspace.y = mode.origin.y;
        sceneRevRef.current += 1;
      }
    }
    modeRef.current = { kind: "idle" };
    hoverRef.current = EMPTY_HOVER;
    const canvas = canvasRef.current;
    if (canvas) canvas.style.cursor = spaceRef.current ? "grab" : "default";
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const local = readLocalGraph();
      const cleared = readCleared();
      let remote: Graph | null = null;
      let reachable = false;

      try {
        const snapshot = await fetchGraph();
        remote = { workspaces: snapshot.workspaces, wires: snapshot.wires };
        reachable = true;
      } catch {
        reachable = false;
      }

      if (cancelled) return;

      const remoteGraph =
        remote && (remote.workspaces.length > 0 || remote.wires.length > 0) ? remote : null;

      let next: Graph;
      let fromRemote = false;
      if (cleared && (!local || local.workspaces.length === 0)) {
        next = { workspaces: [], wires: [] };
      } else if (remoteGraph) {
        next = remoteGraph;
        fromRemote = true;
      } else if (local && local.workspaces.length > 0) {
        next = local;
      } else {
        next = createSampleGraph();
      }

      graphRef.current = next;
      sceneRevRef.current += 1;
      setGraph(next);
      selectedRef.current = null;
      hoverRef.current = EMPTY_HOVER;
      modeRef.current = { kind: "idle" };
      writeLocalGraph(next);
      writeCleared(cleared && next.workspaces.length === 0);

      if (reachable) {
        setSync(fromRemote ? "saved" : "saving");
        if (!fromRemote) {
          saveGraph(next)
            .then(() => {
              if (!cancelled) setSync("saved");
            })
            .catch(() => {
              if (!cancelled) setSync("offline");
            });
        }
      } else {
        setSync("offline");
      }

      bootstrappedRef.current = true;
      maybeInitialFit();
      onReady?.();
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [maybeInitialFit, onReady]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const width = Math.max(1, Math.round(rect.width));
      const height = Math.max(1, Math.round(rect.height));
      sizeRef.current = { width, height, dpr };
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      maybeInitialFit();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    window.addEventListener("resize", resize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [maybeInitialFit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      // Let an interactive workspace scroll its own grid/viewer. Modified wheel
      // remains graph zoom; preview surfaces bubble wheel events to the graph.
      if (!event.ctrlKey && !event.metaKey && event.target instanceof Element &&
          event.target.closest('.graph-workspace-content[data-detail="interactive"]')) return;
      event.preventDefault();
      if (renamingRef.current) cancelRename();

      const screen = screenPointFromEvent({
        clientX: event.clientX,
        clientY: event.clientY,
        currentTarget: canvas,
      });

      if (event.ctrlKey || event.metaKey) {
        zoomBy(Math.exp(-event.deltaY * 0.0018), screen);
        return;
      }

      let deltaX = event.deltaX;
      let deltaY = event.deltaY;
      if (event.deltaMode === 1) {
        deltaX *= 16;
        deltaY *= 16;
      } else if (event.deltaMode === 2) {
        deltaX *= sizeRef.current.width;
        deltaY *= sizeRef.current.height;
      }
      if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
        deltaX = deltaY;
        deltaY = 0;
      }

      const viewport =
        focusWorkspaceIdProp && fullscreenViewportRef.current
          ? fullscreenViewportRef.current
          : viewportRef.current;
      const nextViewport = {
        ...viewport,
        x: viewport.x - deltaX,
        y: viewport.y - deltaY,
      };
      if (focusWorkspaceIdProp && fullscreenViewportRef.current) {
        fullscreenViewportRef.current = nextViewport;
      } else {
        viewportRef.current = nextViewport;
        queueViewportSave();
      }
    };

    const handleContextMenu = (event: Event) => {
      event.preventDefault();
    };

    const wheelTarget: HTMLElement = stageRef.current ?? canvas;
    wheelTarget.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("contextmenu", handleContextMenu);

    return () => {
      wheelTarget.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [cancelRename, zoomBy, focusWorkspaceIdProp, queueViewportSave]);

  useEffect(() => {
    const isEditable = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditable(event.target)) return;

      if (event.code === "Space") {
        event.preventDefault();
        if (!spaceRef.current) {
          spaceRef.current = true;
          const canvas = canvasRef.current;
          if (canvas && modeRef.current.kind === "idle") canvas.style.cursor = "grab";
        }
        return;
      }

      if (event.key === "Escape") {
        cancelInteraction();
        cancelRename();
        selectWorkspace(null);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        const selected = selectedRef.current;
        if (!selected) return;
        event.preventDefault();
        commitGraph({
          workspaces: graphRef.current.workspaces.filter((item) => item.id !== selected),
          wires: graphRef.current.wires.filter(
            (wire) => wire.source !== selected && wire.target !== selected,
          ),
        });
        selectWorkspace(null);
        cancelRename();
        return;
      }

      if (event.key === "Enter") {
        const selected = selectedRef.current;
        if (!selected) return;
        const workspace = graphRef.current.workspaces.find((item) => item.id === selected);
        if (workspace) {
          event.preventDefault();
          openRename(workspace);
        }
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.2);
      } else if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        zoomBy(1 / 1.2);
      } else if (event.key === "0") {
        event.preventDefault();
        fitView();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      spaceRef.current = false;
      const canvas = canvasRef.current;
      if (canvas && modeRef.current.kind === "idle") canvas.style.cursor = "default";
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    cancelInteraction,
    cancelRename,
    commitGraph,
    fitView,
    openRename,
    selectWorkspace,
    zoomBy,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (viewportTimerRef.current !== null) {
        window.clearTimeout(viewportTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrame = 0;
    let lastRevision = -1;
    let routes = new Map<string, Route>();

    const render = (time: number) => {
      const size = sizeRef.current;
      if (size.width && size.height) {
        const currentGraph = graphRef.current;

        let viewWorkspaces = currentGraph.workspaces;
        let viewWires = currentGraph.wires;
        if (focusWorkspaceIdProp) {
          viewWorkspaces = currentGraph.workspaces.filter(
            (workspace) => workspace.id === focusWorkspaceIdProp,
          );
          viewWires = currentGraph.wires.filter(
            (wire) =>
              wire.source === focusWorkspaceIdProp || wire.target === focusWorkspaceIdProp,
          );
        }

        if (lastRevision !== sceneRevRef.current) {
          const byId = new Map(viewWorkspaces.map((workspace) => [workspace.id, workspace]));
          const nextRoutes = new Map<string, Route>();
          const existing: Route[] = [];

          for (const wire of viewWires) {
            const source = byId.get(wire.source);
            const target = byId.get(wire.target);
            if (!source || !target) continue;
            const obstacles = viewWorkspaces.filter(
              (workspace) => workspace.id !== source.id && workspace.id !== target.id,
            );
            const route = computeRoute(
              source,
              wire.sourcePort,
              target,
              wire.targetPort,
              obstacles,
              wire.id,
              existing,
            );
            nextRoutes.set(wire.id, route);
            existing.push(route);
          }

          routes = nextRoutes;
          lastRevision = sceneRevRef.current;
        }

        let renderViewport = viewportRef.current;
        if (focusWorkspaceIdProp) {
          const workspace = currentGraph.workspaces.find(
            (item) => item.id === focusWorkspaceIdProp,
          );
          if (workspace && fullscreenViewportRef.current) {
            renderViewport = fullscreenViewportRef.current;
          } else if (workspace) {
            const { width, height } = size;
            const padding = 60;
            const scale = clamp(
              Math.min(
                (width - padding * 2) / workspace.width,
                (height - padding * 2) / workspace.height,
              ),
              MIN_SCALE,
              MAX_SCALE,
            );
            const worldX = workspace.x + workspace.width / 2;
            const worldY = workspace.y + workspace.height / 2;
            fullscreenViewportRef.current = {
              scale,
              x: width / 2 - worldX * scale,
              y: height / 2 - worldY * scale,
            };
            renderViewport = fullscreenViewportRef.current;
            setZoomPct(Math.round(scale * 100));
            selectWorkspace(workspace.id);
          }
        }

        drawScene({
          ctx,
          width: size.width,
          height: size.height,
          dpr: size.dpr,
          viewport: renderViewport,
          workspaces: viewWorkspaces,
          wires: viewWires,
          routes,
          selectedId: selectedRef.current,
          renamingId: renamingRef.current?.id ?? null,
          hover: hoverRef.current,
          mode: modeRef.current,
          time,
        });

      }

      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [focusWorkspaceIdProp, selectWorkspace]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0 && event.button !== 1) return;

      if (renamingRef.current) commitRename();

      const canvas = event.currentTarget;
      const screen = screenPointFromEvent(event);
      const viewport =
        focusWorkspaceIdProp && fullscreenViewportRef.current
          ? fullscreenViewportRef.current
          : viewportRef.current;
      const world = screenToWorld(viewport, screen);

      if (event.button === 1 || spaceRef.current) {
        event.preventDefault();
        canvas.setPointerCapture(event.pointerId);
        modeRef.current = {
          kind: "pan",
          startScreen: screen,
          startViewport: { ...viewport },
        };
        canvas.style.cursor = "grabbing";
        return;
      }

      const workspace = workspaceAt(graphRef.current.workspaces, world);
      if (workspace && pointInWorkspaceMagnify(workspace, world, viewport.scale)) {
        event.preventDefault();
        selectWorkspace(workspace.id);
        writeLocalViewport(viewportRef.current);
        router.push(`/workspace?id=${encodeURIComponent(workspace.id)}`);
        return;
      }
      const resize = workspaceResizeAt(graphRef.current.workspaces, world, viewport.scale);
      if (resize) {
        const { workspace, corner } = resize;
        selectWorkspace(workspace.id);
        canvas.setPointerCapture(event.pointerId);
        modeRef.current = {
          kind: "resize",
          id: workspace.id,
          corner,
          origin: {
            x: workspace.x,
            y: workspace.y,
            width: workspace.width,
            height: workspace.height,
          },
          start: world,
        };
        canvas.style.cursor = resizeCursor(corner);
        return;
      }

      const border = nearestWorkspaceBorder(
        graphRef.current.workspaces,
        world,
        PORT_HIT_PX / viewport.scale,
      );
      if (border) {
        selectWorkspace(border.workspace.id);
        canvas.setPointerCapture(event.pointerId);
        modeRef.current = {
          kind: "wire",
          sourceId: border.workspace.id,
          sourcePort: border.port,
          current: world,
          target: null,
        };
        canvas.style.cursor = "crosshair";
        return;
      }

      if (workspace) {
        selectWorkspace(workspace.id);
        canvas.setPointerCapture(event.pointerId);
        if (pointInHeader(workspace, world)) {
          modeRef.current = {
            kind: "move",
            id: workspace.id,
            offset: { x: world.x - workspace.x, y: world.y - workspace.y },
            origin: { x: workspace.x, y: workspace.y },
          };
          canvas.style.cursor = "grabbing";
        } else {
          modeRef.current = { kind: "idle" };
          canvas.style.cursor = "default";
        }
        return;
      }

      selectWorkspace(null);
      canvas.setPointerCapture(event.pointerId);
      modeRef.current = { kind: "create", start: world, current: world };
      canvas.style.cursor = "crosshair";
    },
    [commitRename, selectWorkspace, focusWorkspaceIdProp, router],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      const screen = screenPointFromEvent(event);
      const viewport = focusWorkspaceIdProp && fullscreenViewportRef.current
        ? fullscreenViewportRef.current : viewportRef.current;
      const world = screenToWorld(viewport, screen);
      const mode = modeRef.current;

      if (mode.kind === "pan") {
        const nextViewport = {
          ...mode.startViewport,
          x: mode.startViewport.x + (screen.x - mode.startScreen.x),
          y: mode.startViewport.y + (screen.y - mode.startScreen.y),
        };
        if (focusWorkspaceIdProp && fullscreenViewportRef.current) {
          fullscreenViewportRef.current = nextViewport;
        } else {
          viewportRef.current = nextViewport;
        }
        if (!focusWorkspaceIdProp) queueViewportSave();
        return;
      }

      if (mode.kind === "create") {
        mode.current = world;
        canvas.style.cursor = "crosshair";
        return;
      }

      if (mode.kind === "move") {
        const workspace = graphRef.current.workspaces.find((item) => item.id === mode.id);
        if (workspace) {
          workspace.x = world.x - mode.offset.x;
          workspace.y = world.y - mode.offset.y;
          sceneRevRef.current += 1;
        }
        return;
      }

      if (mode.kind === "wire") {
        mode.current = world;
        mode.target = findWireTarget(
          graphRef.current.workspaces,
          mode.sourceId,
          world,
          TARGET_HIT_PX / viewport.scale,
        );
        canvas.style.cursor = "crosshair";
        return;
      }

      if (mode.kind === "resize") {
        canvas.style.cursor = resizeCursor(mode.corner);
        const workspace = graphRef.current.workspaces.find((item) => item.id === mode.id);
        if (workspace) {
          const dx = world.x - mode.start.x;
          const dy = world.y - mode.start.y;
          const { x: ox, y: oy, width: ow, height: oh } = mode.origin;
          let nx = ox;
          let ny = oy;
          let nw = ow;
          let nh = oh;
          switch (mode.corner) {
            case "bottom-right":
              nw = Math.max(MIN_WORKSPACE_WIDTH, ow + dx);
              nh = Math.max(MIN_WORKSPACE_HEIGHT, oh + dy);
              break;
            case "bottom-left":
              nx = ox + dx;
              nw = Math.max(MIN_WORKSPACE_WIDTH, ow - dx);
              nh = Math.max(MIN_WORKSPACE_HEIGHT, oh + dy);
              break;
            case "top-right":
              nw = Math.max(MIN_WORKSPACE_WIDTH, ow + dx);
              ny = oy + dy;
              nh = Math.max(MIN_WORKSPACE_HEIGHT, oh - dy);
              break;
            case "top-left":
              nx = ox + dx;
              nw = Math.max(MIN_WORKSPACE_WIDTH, ow - dx);
              ny = oy + dy;
              nh = Math.max(MIN_WORKSPACE_HEIGHT, oh - dy);
              break;
          }
          workspace.x = nx;
          workspace.y = ny;
          workspace.width = nw;
          workspace.height = nh;
          sceneRevRef.current += 1;
        }
        return;
      }

      const resize = !spaceRef.current
        ? workspaceResizeAt(graphRef.current.workspaces, world, viewport.scale) : null;
      if (resize) {
        hoverRef.current = {
          workspaceId: resize.workspace.id,
          port: null,
          resize: { workspaceId: resize.workspace.id, corner: resize.corner },
        };
        canvas.style.cursor = resizeCursor(resize.corner);
        return;
      }

      const border = nearestWorkspaceBorder(
        graphRef.current.workspaces,
        world,
        PORT_HIT_PX / viewport.scale,
      );
      hoverRef.current = border
        ? {
            workspaceId: border.workspace.id,
            port: {
              workspaceId: border.workspace.id,
              port: border.port,
              point: border.point,
            },
          }
        : EMPTY_HOVER;

      const workspace = workspaceAt(graphRef.current.workspaces, world);
      if (workspace && !spaceRef.current && pointInWorkspaceMagnify(workspace, world, viewport.scale)) {
        canvas.style.cursor = "pointer";
      } else if (border) {
        canvas.style.cursor = "crosshair";
      } else if (workspace && pointInHeader(workspace, world)) {
        canvas.style.cursor = "grab";
      } else if (spaceRef.current) {
        canvas.style.cursor = "grab";
      } else {
        canvas.style.cursor = "default";
      }
    },
    [queueViewportSave, focusWorkspaceIdProp],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      const mode = modeRef.current;
      const viewport = viewportRef.current;

      if (mode.kind === "create") {
        const rect = normalizeRect(mode.start, mode.current);
        if (
          rect.width * viewport.scale >= CREATE_MIN_PX &&
          rect.height * viewport.scale >= CREATE_MIN_PX * 0.75
        ) {
          const workspace: Workspace = {
            id: createId("ws"),
            name: nextWorkspaceName(graphRef.current.workspaces),
            x: rect.x,
            y: rect.y,
            width: Math.max(rect.width, MIN_WORKSPACE_WIDTH),
            height: Math.max(rect.height, MIN_WORKSPACE_HEIGHT),
            type: null,
            contents: [],
          };
          writeCleared(false);
          commitGraph({
            ...graphRef.current,
            workspaces: [...graphRef.current.workspaces, workspace],
          });
          selectWorkspace(workspace.id);
        }
      } else if (mode.kind === "move") {
        const workspace = graphRef.current.workspaces.find((item) => item.id === mode.id);
        if (
          workspace &&
          (workspace.x !== mode.origin.x || workspace.y !== mode.origin.y)
        ) {
          commitGraph({
            ...graphRef.current,
            workspaces: graphRef.current.workspaces.map((item) => ({ ...item })),
          });
        }
      } else if (mode.kind === "wire") {
        const target = mode.target;
        if (target) {
          const duplicate = graphRef.current.wires.some(
            (wire) =>
              wire.source === mode.sourceId && wire.target === target.workspaceId,
          );
          if (!duplicate) {
            const wire: Wire = {
              id: createId("wire"),
              source: mode.sourceId,
              sourcePort: { ...mode.sourcePort },
              target: target.workspaceId,
              targetPort: { ...target.port },
            };
            commitGraph({
              ...graphRef.current,
              wires: [...graphRef.current.wires, wire],
            });
          }
        }
      } else if (mode.kind === "resize") {
        const workspace = graphRef.current.workspaces.find((item) => item.id === mode.id);
        if (
          workspace &&
          (workspace.x !== mode.origin.x ||
            workspace.y !== mode.origin.y ||
            workspace.width !== mode.origin.width ||
            workspace.height !== mode.origin.height)
        ) {
          commitGraph({
            ...graphRef.current,
            workspaces: graphRef.current.workspaces.map((item) => ({ ...item })),
          });
        }
      }

      modeRef.current = { kind: "idle" };
      hoverRef.current = EMPTY_HOVER;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
      canvas.style.cursor = spaceRef.current ? "grab" : "default";
      handlePointerMove(event);
    },
    [commitGraph, selectWorkspace, handlePointerMove],
  );

  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      cancelInteraction();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [cancelInteraction],
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const screen = screenPointFromEvent(event);
      const world = screenToWorld(viewportRef.current, screen);
      const workspace = workspaceAt(graphRef.current.workspaces, world);
      if (!workspace) return;
      if (pointInHeader(workspace, world)) {
        selectWorkspace(workspace.id);
        openRename(workspace);
        return;
      }

      writeLocalViewport(viewportRef.current);
      router.push(`/workspace?id=${workspace.id}`);
    },
    [router, openRename, selectWorkspace],
  );

  const handlePointerLeave = useCallback(() => {
    if (modeRef.current.kind === "idle") {
      hoverRef.current = EMPTY_HOVER;
    }
  }, []);

  const handleClear = useCallback(() => {
    if (graphRef.current.workspaces.length === 0) return;
    if (!window.confirm("Clear all workspaces and wires from this canvas?")) return;

    const empty: Graph = { workspaces: [], wires: [] };
    graphRef.current = empty;
    sceneRevRef.current += 1;
    setGraph(empty);
    selectedRef.current = null;
    modeRef.current = { kind: "idle" };
    hoverRef.current = EMPTY_HOVER;
    renamingRef.current = null;
    setRenaming(null);
    setNameDraft("");
    writeLocalGraph(empty);
    writeCleared(true);
    queueRemoteSave(empty);
  }, [queueRemoteSave]);

  const syncLabel =
    sync === "loading"
      ? "Connecting"
      : sync === "saving"
        ? "Saving…"
        : sync === "offline"
          ? "Offline · local"
          : "Saved";

  const syncTitle =
    sync === "offline"
      ? "The API is unreachable. Changes are being kept in this browser."
      : sync === "saved"
        ? "The canvas is synced with the indigoQ API."
        : "Syncing the canvas with the indigoQ API.";

  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        className="canvas-surface"
        role="application"
        aria-label="indigoQ infinite workspace canvas. Drag on empty space to draw a workspace, drag from a border to connect workspaces."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />
      <div className="workspace-layer">
        {graph.workspaces.map((workspace) => (
          <GraphWorkspace
            key={`${graphEpoch}:${workspace.id}`}
            workspace={workspace}
            graphRef={graphRef}
            viewportRef={viewportRef}
            onDrop={async (event) => {
              event.preventDefault();
              event.stopPropagation();
              const files = Array.from(event.dataTransfer.files);
              if (!files.length) return;
              if (workspace.type !== null && workspace.type !== "content-source") {
                setUploadError("This workspace does not accept file drops");
                return;
              }
              try {
                if (saveTimerRef.current !== null) {
                  window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
                await saveGraph(graphRef.current);
                const snapshot = await uploadContents(workspace.id, files);
                graphRef.current = snapshot;
                sceneRevRef.current += 1;
                setGraph(snapshot);
                writeLocalGraph(snapshot);
                setUploadError(null);
              } catch (reason) {
                setUploadError(reason instanceof Error ? reason.message : "Unable to import files");
              }
            }}
            onPointerDown={(event) => {
              selectWorkspace(workspace.id);
              // Preserve canvas panning over child components.
              if (spaceRef.current || event.button === 1) {
                canvasRef.current?.dispatchEvent(new PointerEvent("pointerdown", {
                  bubbles: true, clientX: event.clientX, clientY: event.clientY,
                  button: event.button, pointerId: event.pointerId,
                }));
                event.preventDefault();
              }
            }}
            onOpen={() => {
              writeLocalViewport(viewportRef.current);
              router.push(`/workspace?id=${encodeURIComponent(workspace.id)}`);
            }}
          >
            <WorkspaceContent
              workspace={workspace}
              onExpand={() => {
                writeLocalViewport(viewportRef.current);
                router.push(`/workspace?id=${encodeURIComponent(workspace.id)}`);
              }}
              graph={graph}
              onBeforeOperation={async () => {
                if (saveTimerRef.current !== null) {
                  window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
                await saveGraph(graphRef.current);
              }}
              onGraphChange={(snapshot) => {
                const updated = { ...graphRef.current, workspaces: graphRef.current.workspaces.map((item) => {
                  const remote = snapshot.workspaces.find((next) => next.id === item.id);
                  return remote ? { ...item, type: remote.type, autoUpdate: remote.autoUpdate, contents: remote.contents, editor: remote.editor, tool: remote.tool } : item;
                }) };
                graphRef.current = updated;
                sceneRevRef.current += 1;
                setGraph(updated);
                writeLocalGraph(updated);
              }}
              onUpload={async (id, files) => {
                if (saveTimerRef.current !== null) {
                  window.clearTimeout(saveTimerRef.current);
                  saveTimerRef.current = null;
                }
                await saveGraph(graphRef.current);
                const snapshot = await uploadContents(id, files);
                const next = snapshot.workspaces.find((item) => item.id === id);
                if (!next) throw new Error("Workspace missing from upload response");
                return next;
              }}
              onWorkspaceChange={(next) => {
                const updated = { ...graphRef.current, workspaces: graphRef.current.workspaces.map((item) => item.id === next.id ? { ...item, type: next.type, contents: next.contents, editor: next.editor, tool: next.tool } : item) };
                graphRef.current = updated;
                sceneRevRef.current += 1;
                setGraph(updated);
                writeLocalGraph(updated);
                setSync("saved");
              }}
            />
          </GraphWorkspace>
        ))}
      </div>

      {graph.workspaces.length === 0 ? (
        <div className="canvas-empty" aria-hidden>
          <div className="canvas-empty-card">
            <div className="empty-mark">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                <path
                  d="M4.5 6.5h9v9h-9zM10.5 10.5h9v9h-9z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h2>Create your first workspace</h2>
            <p>Click and drag anywhere on the canvas to draw an isolated workspace.</p>
            <p className="foot">Then drag from a workspace border to wire it to another.</p>
          </div>
        </div>
      ) : null}

      {renaming ? (
        <input
          className="rename-input"
          style={{
            left: renaming.left,
            top: renaming.top,
            width: renaming.width,
          }}
          value={nameDraft}
          maxLength={80}
          autoFocus
          aria-label="Workspace name"
          onChange={(event) => setNameDraft(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
          onPointerDown={(event) => event.stopPropagation()}
          onBlur={() => commitRename(nameDraft)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              commitRename(nameDraft);
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancelRename();
            }
          }}
        />
      ) : null}

      {uploadError && (
        <div className="canvas-error" aria-live="polite">
          <span>Upload failed: {uploadError}</span>
          <button
            type="button"
            className="hud-button"
            onClick={() => setUploadError(null)}
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
              <path
                d="M4 4l8 8M4 12l8-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      )}

      <div className="canvas-hints" aria-hidden>
        <span>
          <kbd>Drag</kbd> create
        </span>
        <span>
          <kbd>Space</kbd> + drag pan
        </span>
        <span>
          <kbd>⌘/Ctrl</kbd> + scroll zoom
        </span>
        <span>
          <kbd>Drag corner</kbd> resize
        </span>
        <span>
          <kbd>Double-click body</kbd> open workspace
        </span>
        <span>
          <kbd>Double-click header</kbd> rename
        </span>
      </div>

      <div className="canvas-hud">
        <div className="hud-panel">
          <button
            type="button"
            className="hud-button"
            onClick={() => zoomBy(1 / 1.2)}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <span className="zoom-value">{zoomPct}%</span>
          <button
            type="button"
            className="hud-button"
            onClick={() => zoomBy(1.2)}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path
                d="M8 3.5v9M3.5 8h9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <span className="hud-divider" />
          <button type="button" className="hud-text" onClick={fitView}>
            Fit
          </button>
        </div>

        <div className={`hud-panel hud-info sync-${sync}`} title={syncTitle}>
          <span className="sync-dot" aria-hidden />
          <span className="sync-label">{syncLabel}</span>
          <span className="hud-divider" />
          <span className="hud-count">
            {graph.workspaces.length} workspace{graph.workspaces.length === 1 ? "" : "s"}
            <span className="hud-dot-sep">·</span>
            {graph.wires.length} wire{graph.wires.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            className="hud-button hud-clear"
            onClick={handleClear}
            disabled={graph.workspaces.length === 0}
            aria-label="Clear canvas"
            title="Clear canvas"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path
                d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <p className="sr-only">
        Use the canvas to create isolated workspaces. Drag from a workspace border to create a
        dataflow wire. Drag the workspace header to move it, or a corner to resize it.
        Double-click the body to open a workspace. Double-click the header to rename it. Drag a
        corner to resize. Press Delete to remove the selected workspace, and press Escape to cancel.
      </p>

    </div>
  );
}
