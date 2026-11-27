import {
  CORNER_RADIUS,
  HEADER_HEIGHT,
  TAU,
  closestBorderPoint,
  computeRoute,
  cubicPoint,
  cubicTangent,
  gridStep,
  hashString,
  normalizeRect,
  pointInRect,
  portNormal,
  portPoint,
  previewRoute,
  type Route,
} from "./geometry";
import type { HoverState, InteractionMode } from "./interaction";
import type { Point, Port, Viewport, Wire, Workspace } from "./types";

const FONT_SANS =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const COLORS = {
  wireStart: "rgba(129, 140, 248, 0.62)",
  wireMid: "rgba(165, 180, 252, 0.78)",
  wireEnd: "rgba(192, 132, 252, 0.74)",
  wireCore: "rgba(232, 237, 255, 0.3)",
  pulse: "rgba(238, 242, 255, 0.95)",
  text: "#eef0ff",
  port: "rgba(224, 231, 255, 0.92)",
  portFill: "rgba(13, 13, 31, 0.96)",
};

export interface SceneFrame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  viewport: Viewport;
  workspaces: Workspace[];
  wires: Wire[];
  routes: Map<string, Route>;
  selectedId: string | null;
  renamingId: string | null;
  hover: HoverState;
  mode: InteractionMode;
  time: number;
}

export function drawScene(frame: SceneFrame): void {
  const { ctx, width, height, dpr, viewport } = frame;
  const scale = viewport.scale;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintBackground(ctx, width, height);
  paintGrid(ctx, width, height, viewport);

  ctx.save();
  ctx.translate(viewport.x, viewport.y);
  ctx.scale(scale, scale);

  frame.wires.forEach((wire) => {
    const route = frame.routes.get(wire.id);
    if (route) {
      paintWire(ctx, route, wire.id, frame.time, scale);
    }
  });

  frame.workspaces.forEach((workspace) => {
    paintWorkspace(ctx, workspace, frame);
  });

  paintEndpoints(ctx, frame);
  paintHoverPort(ctx, frame);

  if (frame.mode.kind === "create") {
    paintDraft(ctx, frame.mode.start, frame.mode.current, scale);
  }

  if (frame.mode.kind === "zoom-rect") {
    paintDraft(ctx, frame.mode.start, frame.mode.current, scale, "Zoom to area");
  }

  if (frame.mode.kind === "wire") {
    paintWirePreview(ctx, frame);
  }

  ctx.restore();
}

function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const base = ctx.createLinearGradient(0, 0, 0, height);
  base.addColorStop(0, "#090916");
  base.addColorStop(0.55, "#070710");
  base.addColorStop(1, "#05050c");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.08,
    0,
    width * 0.5,
    height * 0.08,
    Math.max(width, height) * 0.9,
  );
  glow.addColorStop(0, "rgba(70, 58, 170, 0.22)");
  glow.addColorStop(0.45, "rgba(38, 30, 102, 0.09)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.2,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.78,
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  viewport: Viewport,
): void {
  const spacing = gridStep(viewport.scale) * viewport.scale;
  const startColumn = Math.floor(-viewport.x / spacing);
  const startRow = Math.floor(-viewport.y / spacing);
  const columns = Math.ceil(width / spacing) + 2;
  const rows = Math.ceil(height / spacing) + 2;

  for (let column = 0; column <= columns; column += 1) {
    const columnIndex = startColumn + column;
    const screenX = columnIndex * spacing + viewport.x;
    for (let row = 0; row <= rows; row += 1) {
      const rowIndex = startRow + row;
      const screenY = rowIndex * spacing + viewport.y;
      const major = columnIndex % 4 === 0 && rowIndex % 4 === 0;
      const size = major ? 1.9 : 1.25;
      ctx.fillStyle = major ? "rgba(165, 180, 252, 0.2)" : "rgba(129, 140, 248, 0.12)";
      ctx.fillRect(screenX - size / 2, screenY - size / 2, size, size);
    }
  }
}

function screenWidth(pixels: number, scale: number): number {
  return pixels / scale;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
}

function paintWire(
  ctx: CanvasRenderingContext2D,
  route: Route,
  seed: string,
  time: number,
  scale: number,
): void {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const gradient = ctx.createLinearGradient(route.p0.x, route.p0.y, route.p1.x, route.p1.y);
  gradient.addColorStop(0, COLORS.wireStart);
  gradient.addColorStop(0.5, COLORS.wireMid);
  gradient.addColorStop(1, COLORS.wireEnd);

  ctx.beginPath();
  ctx.moveTo(route.p0.x, route.p0.y);
  ctx.bezierCurveTo(route.c1.x, route.c1.y, route.c2.x, route.c2.y, route.p1.x, route.p1.y);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = screenWidth(1.7, scale);
  ctx.shadowColor = "rgba(99, 102, 241, 0.45)";
  ctx.shadowBlur = 12;
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = COLORS.wireCore;
  ctx.lineWidth = screenWidth(0.7, scale);
  ctx.stroke();
  ctx.restore();

  paintWireArrow(ctx, route, scale);
  paintPulse(ctx, route, seed, time, scale);
}

function paintWireArrow(
  ctx: CanvasRenderingContext2D,
  route: Route,
  scale: number,
): void {
  const tangent = cubicTangent(route, 0.94);
  const length = Math.hypot(tangent.x, tangent.y);
  if (length < 0.0001) return;

  const directionX = tangent.x / length;
  const directionY = tangent.y / length;
  const tip = cubicPoint(route, 0.985);
  const size = Math.min(14, screenWidth(7, scale));
  const baseX = tip.x - directionX * size;
  const baseY = tip.y - directionY * size;
  const perpendicularX = -directionY * size * 0.52;
  const perpendicularY = directionX * size * 0.52;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(tip.x, tip.y);
  ctx.lineTo(baseX + perpendicularX, baseY + perpendicularY);
  ctx.lineTo(baseX - perpendicularX, baseY - perpendicularY);
  ctx.closePath();
  ctx.fillStyle = "rgba(216, 224, 255, 0.9)";
  ctx.shadowColor = "rgba(129, 140, 248, 0.7)";
  ctx.shadowBlur = 10;
  ctx.fill();
  ctx.restore();
}

function paintPulse(
  ctx: CanvasRenderingContext2D,
  route: Route,
  seed: string,
  time: number,
  scale: number,
): void {
  const phase = (time * 0.000105 + (hashString(seed) % 1000) / 1000) % 1;
  const headRadius = Math.min(13, screenWidth(4, scale));

  ctx.save();
  for (let trail = 4; trail >= 1; trail -= 1) {
    const t = phase - trail * 0.011;
    if (t < 0.02) continue;
    const point = cubicPoint(route, t);
    const radius = Math.max(0.5, headRadius * (1 - trail * 0.17));
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.fillStyle = `rgba(199, 210, 254, ${Math.max(0, 0.42 - trail * 0.08).toFixed(3)})`;
    ctx.fill();
  }

  const head = cubicPoint(route, phase);
  const glowRadius = headRadius * 3.4;
  const glow = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, glowRadius);
  glow.addColorStop(0, "rgba(238, 242, 255, 0.95)");
  glow.addColorStop(0.35, "rgba(165, 180, 252, 0.55)");
  glow.addColorStop(1, "rgba(129, 140, 248, 0)");
  ctx.beginPath();
  ctx.arc(head.x, head.y, glowRadius, 0, TAU);
  ctx.fillStyle = glow;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(head.x, head.y, Math.max(0.8, headRadius * 0.6), 0, TAU);
  ctx.fillStyle = COLORS.pulse;
  ctx.fill();
  ctx.restore();
}

function paintWorkspace(
  ctx: CanvasRenderingContext2D,
  workspace: Workspace,
  frame: SceneFrame,
): void {
  const { scale } = frame.viewport;
  const selected = frame.selectedId === workspace.id;
  const radius = CORNER_RADIUS;

  ctx.save();

  roundedRectPath(ctx, workspace.x, workspace.y, workspace.width, workspace.height, radius);
  const body = ctx.createLinearGradient(
    workspace.x,
    workspace.y,
    workspace.x,
    workspace.y + workspace.height,
  );
  body.addColorStop(0, selected ? "#1b1b40" : "#161632");
  body.addColorStop(1, selected ? "#101028" : "#0e0e21");
  ctx.fillStyle = body;
  ctx.shadowColor = selected ? "rgba(99, 102, 241, 0.4)" : "rgba(0, 0, 0, 0.5)";
  ctx.shadowBlur = selected ? 34 : 22;
  ctx.shadowOffsetY = 10;
  ctx.fill();

  ctx.save();
  roundedRectPath(ctx, workspace.x, workspace.y, workspace.width, workspace.height, radius);
  ctx.clip();
  const header = ctx.createLinearGradient(
    workspace.x,
    workspace.y,
    workspace.x + workspace.width,
    workspace.y + HEADER_HEIGHT,
  );
  header.addColorStop(0, "rgba(99, 102, 241, 0.28)");
  header.addColorStop(0.55, "rgba(129, 140, 248, 0.12)");
  header.addColorStop(1, "rgba(168, 85, 247, 0.16)");
  ctx.fillStyle = header;
  ctx.fillRect(workspace.x, workspace.y, workspace.width, HEADER_HEIGHT);

  ctx.beginPath();
  ctx.moveTo(workspace.x, workspace.y + HEADER_HEIGHT);
  ctx.lineTo(workspace.x + workspace.width, workspace.y + HEADER_HEIGHT);
  ctx.strokeStyle = "rgba(129, 140, 248, 0.22)";
  ctx.lineWidth = screenWidth(1, scale);
  ctx.stroke();
  ctx.restore();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  roundedRectPath(ctx, workspace.x, workspace.y, workspace.width, workspace.height, radius);
  ctx.strokeStyle = selected ? "rgba(199, 210, 254, 0.95)" : "rgba(129, 140, 248, 0.48)";
  ctx.lineWidth = screenWidth(selected ? 2 : 1.4, scale);
  ctx.stroke();

  if (selected) {
    roundedRectPath(ctx, workspace.x, workspace.y, workspace.width, workspace.height, radius);
    ctx.strokeStyle = "rgba(129, 140, 248, 0.28)";
    ctx.lineWidth = screenWidth(7, scale);
    ctx.stroke();
  }

  paintWorkspaceChrome(ctx, workspace, frame);
  paintWorkspaceBody(ctx, workspace, scale);
  ctx.restore();
}

function paintWorkspaceChrome(
  ctx: CanvasRenderingContext2D,
  workspace: Workspace,
  frame: SceneFrame,
): void {
  const { scale } = frame.viewport;
  if (scale < 0.3) return;

  const centerY = workspace.y + HEADER_HEIGHT / 2;

  ctx.save();
  ctx.fillStyle = "rgba(199, 210, 254, 0.38)";
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 2; column += 1) {
      ctx.beginPath();
      ctx.arc(
        workspace.x + 20 + column * 6,
        centerY - 5 + row * 5,
        Math.max(0.8, screenWidth(0.9, scale)),
        0,
        TAU,
      );
      ctx.fill();
    }
  }

  const toolbarVisible = scale > 0.5 && workspace.width > 240;
  const iconSize = 13;
  const toolbarWidth = toolbarVisible ? iconSize : 0;
  const reservedRight = toolbarVisible ? toolbarWidth + 34 : 20;
  const maxNameWidth = Math.max(24, workspace.width - 46 - reservedRight);

  if (frame.renamingId !== workspace.id) {
    ctx.font = `600 ${14}px ${FONT_SANS}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = frame.selectedId === workspace.id ? "#ffffff" : COLORS.text;
    const label = fitText(ctx, workspace.name, maxNameWidth);
    ctx.fillText(label, workspace.x + 38, centerY + 0.5);
  }

  if (workspace.contents.length > 0 && scale > 0.3) {
    const badgeSize = Math.max(6, screenWidth(3, scale));
    const badgeX = workspace.x + workspace.width - badgeSize - 8;
    const badgeY = workspace.y + workspace.height - badgeSize - 8;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeSize, 0, TAU);
    ctx.fillStyle = "rgba(139, 92, 246, 0.9)";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = screenWidth(1, scale);
    ctx.stroke();
  }

  if (toolbarVisible) {
    const startCenter =
      workspace.x + workspace.width - 18 - toolbarWidth + iconSize / 2;
    const pillHeight = 24;
    const pillX = startCenter - iconSize / 2 - 9;
    const pillY = centerY - pillHeight / 2;

    roundedRectPath(ctx, pillX, pillY, toolbarWidth + 18, pillHeight, 8);
    ctx.fillStyle = "rgba(255, 255, 255, 0.045)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = screenWidth(1, scale);
    ctx.stroke();

    drawMagnifyIcon(ctx, startCenter, centerY, iconSize, "rgba(206, 214, 255, 0.62)", scale);
  }

  ctx.restore();
}

function paintWorkspaceBody(
  ctx: CanvasRenderingContext2D,
  workspace: Workspace,
  scale: number,
): void {
  if (scale < 0.52) return;

  const bodyTop = workspace.y + HEADER_HEIGHT;
  const bodyHeight = workspace.height - HEADER_HEIGHT;
  if (bodyHeight < 80) return;

  const inset = 16;
  const centerX = workspace.x + workspace.width / 2;
  const centerY = bodyTop + bodyHeight / 2;

  ctx.save();
  roundedRectPath(
    ctx,
    workspace.x + inset,
    bodyTop + inset * 0.8,
    workspace.width - inset * 2,
    bodyHeight - inset * 1.6,
    10,
  );
  ctx.setLineDash([5, 7]);
  ctx.strokeStyle = "rgba(129, 140, 248, 0.1)";
  ctx.lineWidth = screenWidth(1, scale);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${10.5}px ${FONT_SANS}`;
  ctx.fillStyle = "rgba(199, 210, 254, 0.34)";
  ctx.fillText("ISOLATED WORKSPACE", centerX, centerY - 7);
  ctx.font = `400 ${10}px ${FONT_SANS}`;
  ctx.fillStyle = "rgba(148, 163, 184, 0.36)";
  ctx.fillText("Drag a border port to connect", centerX, centerY + 12);
  ctx.restore();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, middle).trimEnd()}…`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low > 0 ? `${text.slice(0, low).trimEnd()}…` : "…";
}

function drawMagnifyIcon(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
  color: string,
  scale: number,
): void {
  const half = size / 2;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.strokeStyle = color;
  ctx.lineWidth = screenWidth(1.15, scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.arc(-half * 0.12, -half * 0.12, half * 0.44, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(half * 0.24, half * 0.24);
  ctx.lineTo(half * 0.68, half * 0.68);
  ctx.stroke();

  ctx.restore();
}

function paintEndpoints(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const radius = Math.min(7, screenWidth(3.2, frame.viewport.scale));
  frame.wires.forEach((wire) => {
    const route = frame.routes.get(wire.id);
    if (!route) return;
    paintEndpointDot(ctx, route.p0, radius, "rgba(199, 210, 254, 0.75)", frame.viewport.scale);
    paintEndpointDot(ctx, route.p1, radius, "rgba(216, 180, 254, 0.8)", frame.viewport.scale);
  });
}

function paintEndpointDot(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  color: string,
  scale: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, TAU);
  ctx.fillStyle = COLORS.portFill;
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = screenWidth(1.4, scale);
  ctx.stroke();
  ctx.restore();
}

function paintHoverPort(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  const hover = frame.hover.port;
  if (!hover || frame.mode.kind !== "idle") return;

  const { scale } = frame.viewport;
  const radius = Math.min(11, screenWidth(5.5, scale));

  ctx.save();
  ctx.shadowColor = "rgba(165, 180, 252, 0.85)";
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(hover.point.x, hover.point.y, radius, 0, TAU);
  ctx.fillStyle = COLORS.portFill;
  ctx.fill();
  ctx.strokeStyle = COLORS.port;
  ctx.lineWidth = screenWidth(1.6, scale);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.moveTo(hover.point.x - radius * 0.45, hover.point.y);
  ctx.lineTo(hover.point.x + radius * 0.45, hover.point.y);
  ctx.moveTo(hover.point.x, hover.point.y - radius * 0.45);
  ctx.lineTo(hover.point.x, hover.point.y + radius * 0.45);
  ctx.strokeStyle = "rgba(238, 242, 255, 0.95)";
  ctx.lineWidth = screenWidth(1.4, scale);
  ctx.stroke();
  ctx.restore();
}

function paintDraft(
  ctx: CanvasRenderingContext2D,
  start: Point,
  current: Point,
  scale: number,
  caption?: string,
): void {
  const rect = normalizeRect(start, current);
  if (rect.width < 1 || rect.height < 1) return;

  ctx.save();
  roundedRectPath(ctx, rect.x, rect.y, rect.width, rect.height, 12);
  ctx.fillStyle = "rgba(99, 102, 241, 0.1)";
  ctx.fill();
  ctx.setLineDash([screenWidth(7, scale), screenWidth(5, scale)]);
  ctx.strokeStyle = "rgba(199, 210, 254, 0.85)";
  ctx.lineWidth = screenWidth(1.6, scale);
  ctx.shadowColor = "rgba(99, 102, 241, 0.55)";
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;

  const label = caption ?? `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
  ctx.font = `500 ${screenWidth(11, scale)}px ${FONT_SANS}`;
  const labelWidth = ctx.measureText(label).width;
  const padding = screenWidth(6, scale);
  const labelHeight = screenWidth(20, scale);
  const labelX = rect.x;
  const labelY = rect.y - labelHeight - screenWidth(8, scale);

  roundedRectPath(
    ctx,
    labelX,
    labelY,
    labelWidth + padding * 2,
    labelHeight,
    screenWidth(6, scale),
  );
  ctx.fillStyle = "rgba(10, 10, 24, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "rgba(129, 140, 248, 0.35)";
  ctx.lineWidth = screenWidth(1, scale);
  ctx.stroke();
  ctx.fillStyle = "rgba(224, 231, 255, 0.9)";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX + padding, labelY + labelHeight / 2);
  ctx.restore();
}

function paintWirePreview(ctx: CanvasRenderingContext2D, frame: SceneFrame): void {
  if (frame.mode.kind !== "wire") return;

  const mode = frame.mode;
  const { scale } = frame.viewport;
  const source = frame.workspaces.find((workspace) => workspace.id === mode.sourceId);
  if (!source) return;

  const p0 = portPoint(source, mode.sourcePort);
  const normal = portNormal(mode.sourcePort.side);
  const targetWorkspace = mode.target
    ? frame.workspaces.find((workspace) => workspace.id === mode.target?.workspaceId)
    : undefined;

  let route: Route;
  if (mode.target && targetWorkspace) {
    const obstacles = frame.workspaces.filter(
      (workspace) =>
        workspace.id !== source.id && workspace.id !== targetWorkspace.id,
    );
    route = computeRoute(
      source,
      mode.sourcePort,
      targetWorkspace,
      mode.target.port,
      obstacles,
      "wire-preview",
    );
  } else {
    route = previewRoute(p0, normal, mode.target?.point ?? mode.current);
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(route.p0.x, route.p0.y);
  ctx.bezierCurveTo(route.c1.x, route.c1.y, route.c2.x, route.c2.y, route.p1.x, route.p1.y);
  ctx.setLineDash([screenWidth(9, scale), screenWidth(6, scale)]);
  ctx.lineDashOffset = -frame.time * 0.03;
  ctx.strokeStyle = "rgba(216, 224, 255, 0.85)";
  ctx.lineWidth = screenWidth(1.8, scale);
  ctx.shadowColor = "rgba(129, 140, 248, 0.7)";
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();

  const sourceRadius = Math.min(11, screenWidth(5.5, scale));
  paintEndpointDot(ctx, route.p0, sourceRadius, COLORS.port, scale);

  if (mode.target && targetWorkspace) {
    const pulse = 0.4 + 0.32 * Math.sin(frame.time * 0.006);
    ctx.save();
    roundedRectPath(
      ctx,
      targetWorkspace.x - screenWidth(4, scale),
      targetWorkspace.y - screenWidth(4, scale),
      targetWorkspace.width + screenWidth(8, scale),
      targetWorkspace.height + screenWidth(8, scale),
      CORNER_RADIUS + screenWidth(4, scale),
    );
    ctx.strokeStyle = `rgba(165, 180, 252, ${pulse.toFixed(3)})`;
    ctx.lineWidth = screenWidth(2, scale);
    ctx.shadowColor = "rgba(129, 140, 248, 0.6)";
    ctx.shadowBlur = 20;
    ctx.stroke();
    ctx.restore();
    paintTargetPulse(ctx, mode.target.point, frame.time, scale);
  } else {
    const cursorRadius = Math.min(10, screenWidth(4.5, scale));
    ctx.save();
    ctx.beginPath();
    ctx.arc(mode.current.x, mode.current.y, cursorRadius, 0, TAU);
    ctx.fillStyle = "rgba(216, 224, 255, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(216, 224, 255, 0.8)";
    ctx.lineWidth = screenWidth(1.4, scale);
    ctx.stroke();
    ctx.restore();
  }
}

function paintTargetPulse(
  ctx: CanvasRenderingContext2D,
  point: Point,
  time: number,
  scale: number,
): void {
  const period = 1150;
  const phase = (time % period) / period;

  ctx.save();
  for (let ring = 0; ring < 2; ring += 1) {
    const progress = (phase + ring * 0.5) % 1;
    const radius = screenWidth(8 + progress * 18, scale);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, TAU);
    ctx.strokeStyle = `rgba(165, 180, 252, ${(1 - progress) * 0.7})`;
    ctx.lineWidth = screenWidth(2, scale);
    ctx.stroke();
  }

  const coreRadius = screenWidth(5.5, scale);
  ctx.beginPath();
  ctx.arc(point.x, point.y, coreRadius, 0, TAU);
  ctx.fillStyle = "rgba(238, 242, 255, 0.95)";
  ctx.shadowColor = "rgba(129, 140, 248, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(point.x, point.y, screenWidth(9, scale), 0, TAU);
  ctx.strokeStyle = "rgba(199, 210, 254, 0.55)";
  ctx.lineWidth = screenWidth(1, scale);
  ctx.stroke();
  ctx.restore();
}


export function nearestWorkspaceBorder(
  workspaces: Workspace[],
  point: Point,
  tolerance: number,
): { workspace: Workspace; port: Port; point: Point } | null {
  for (let index = workspaces.length - 1; index >= 0; index -= 1) {
    const workspace = workspaces[index];
    const hit = closestBorderPoint(workspace, point);
    if (hit.distance <= tolerance) {
      return { workspace, port: hit.port, point: hit.point };
    }
  }
  return null;
}

export function workspaceAt(workspaces: Workspace[], point: Point): Workspace | null {
  for (let index = workspaces.length - 1; index >= 0; index -= 1) {
    if (pointInRect(point, workspaces[index])) {
      return workspaces[index];
    }
  }
  return null;
}
