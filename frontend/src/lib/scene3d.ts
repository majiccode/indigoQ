import { stripFence } from "./workspaceData";

export interface Vec3 { x: number; y: number; z: number }
export interface Mesh { name: string; vertices: Vec3[]; faces: number[][]; color: string }
export interface Transform { tx: number; ty: number; tz: number; rx: number; ry: number; rz: number; sx: number; sy: number; sz: number }
export interface Instance extends Transform { id: string; modelName: string; visible: boolean }
export const IDENTITY: Transform = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 };
export function parseMeshes(text: string): { name: string; meshes: Mesh[] } {
  const data = JSON.parse(stripFence(text));
  const raw = Array.isArray(data.meshes) ? data.meshes : data.vertices ? [data] : null;
  if (!raw || raw.length > 100) throw new Error("Use a model with up to 100 meshes");
  const names = new Set<string>();
  const meshes = raw.map((item: Record<string, unknown>, index: number): Mesh => {
    if (!item || !Array.isArray(item.vertices) || !Array.isArray(item.faces) || item.vertices.length > 10000 || item.faces.length > 20000) throw new Error("Each mesh needs vertices and faces (limit: 10,000 vertices, 20,000 faces)");
    const vertices = item.vertices.map((point: unknown): Vec3 => {
      const p = Array.isArray(point) ? { x: point[0], y: point[1], z: point[2] } : point as Vec3;
      if (!p || ![p.x, p.y, p.z].every((n) => typeof n === "number" && Number.isFinite(n))) throw new Error("Vertices need finite x, y, z coordinates");
      return { x: p.x, y: p.y, z: p.z };
    });
    const faces = item.faces.map((face: unknown) => {
      if (!Array.isArray(face) || face.length < 3 || !face.every((n) => Number.isInteger(n) && n >= 0 && n < vertices.length)) throw new Error("Faces need at least three valid vertex indices");
      return face as number[];
    });
    let name = String(item.name ?? `Mesh ${index + 1}`);
    if (names.has(name)) name = `${name} ${index + 1}`;
    names.add(name);
    return { name, vertices, faces, color: typeof item.color === "string" && /^#[0-9a-f]{6}$/i.test(item.color) ? item.color : "#3b82f6" };
  });
  return { name: String(data.name ?? "My Model"), meshes };
}
export function parseWorld(text: string): { name: string; instances: Instance[]; meshes: Mesh[] } {
  const data = JSON.parse(stripFence(text));
  if (!Array.isArray(data.instances) || data.instances.length > 1000) throw new Error("Use a scene with up to 1,000 instances");
  const ids = new Set<string>();
  const instances = data.instances.map((item: Record<string, unknown>, index: number): Instance => {
    if (!item || typeof item.modelName !== "string") throw new Error("Instances need a modelName");
    const transform = { ...IDENTITY };
    for (const key of Object.keys(transform) as (keyof Transform)[]) {
      if (item[key] !== undefined) {
        if (typeof item[key] !== "number" || !Number.isFinite(item[key])) throw new Error("Instance transforms must be finite numbers");
        transform[key] = item[key] as number;
      }
    }
    const id = String(item.id ?? `instance-${index}`);
    if (ids.has(id)) throw new Error("Instance IDs must be unique");
    ids.add(id);
    return { ...transform, id, modelName: item.modelName, visible: item.visible !== false };
  });
  return { name: String(data.name ?? "Scene"), instances, meshes: data.meshes ? parseMeshes(JSON.stringify(data)).meshes : [] };
}
export function transformVertex(p: Vec3, t: Transform): Vec3 {
  let x = p.x * t.sx, y = p.y * t.sy, z = p.z * t.sz;
  const radians = Math.PI / 180;
  const rx = t.rx * radians, ry = t.ry * radians, rz = t.rz * radians;
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  return { x: x + t.tx, y: y + t.ty, z: z + t.tz };
}
export function projectVertex(p: Vec3, width: number, height: number, distance: number): Vec3 | null {
  const depth = distance - p.z;
  if (depth <= 0.1) return null;
  const focal = height / (2 * Math.tan(Math.PI / 6));
  return { x: width / 2 + p.x * focal / depth, y: height / 2 - p.y * focal / depth, z: depth };
}
export function drawScene(canvas: HTMLCanvasElement, items: { mesh: Mesh; transform: Transform }[], options: { wireframe?: boolean; culling?: boolean; distance?: number } = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const width = Math.max(1, canvas.clientWidth || 600), height = Math.max(1, canvas.clientHeight || 420);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#0b1120"; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#374151"; ctx.beginPath(); ctx.moveTo(width / 2, 0); ctx.lineTo(width / 2, height); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
  const radius = items.reduce((max, { mesh }) => mesh.vertices.reduce((bound, p) => Math.max(bound, Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)), max), 0);
  const distance = options.distance ?? Math.max(8, radius * 3);
  const polygons: { points: Vec3[]; depth: number; color: string }[] = [];
  for (const { mesh, transform } of items) {
    const vertices = mesh.vertices.map((p) => transformVertex(p, transform));
    for (const face of mesh.faces) {
      const points = face.map((i) => vertices[i]);
      const [a, b, c] = points;
      const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }, v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
      const normal = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
      if (options.culling && normal.x * -a.x + normal.y * -a.y + normal.z * (distance - a.z) <= 0) continue;
      const projected = points.map((p) => projectVertex(p, width, height, distance));
      if (projected.some((p) => !p)) continue;
      polygons.push({ points: projected as Vec3[], depth: points.reduce((sum, p) => sum + p.z, 0) / points.length, color: mesh.color });
    }
  }
  polygons.sort((a, b) => a.depth - b.depth);
  for (const { points, color } of polygons) {
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y)); ctx.closePath();
    if (options.wireframe === false) { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#111827"; }
    else ctx.strokeStyle = color;
    ctx.lineWidth = 1.5; ctx.stroke();
  }
}
