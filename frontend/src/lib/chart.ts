import type { TableState } from "./types";

export type ChartKind = "line" | "scatter" | "bar" | "histogram";
export interface ChartPoint { x: number; y: number; label: string; series: string; rows: number[]; x0?: number; x1?: number }
export interface ChartOptions { kind: ChartKind; x: string; y: string; series: string; bins: number; logX: boolean; logY: boolean }
export function numericCell(cell: string | undefined): number | null {
  if (!cell?.trim()) return null;
  const value = Number(cell);
  return Number.isFinite(value) ? value : null;
}
export function chartPoints(table: TableState, options: ChartOptions): ChartPoint[] {
  const xi = table.columns.indexOf(options.x), yi = table.columns.indexOf(options.y), si = table.columns.indexOf(options.series);
  if (xi < 0 || (yi < 0 && options.kind !== "histogram")) return [];
  if (options.kind === "histogram") {
    const samples = table.rows.flatMap((row, index) => {
      const value = numericCell(row[xi]);
      return value === null || (options.logX && value <= 0) ? [] : [{ value: options.logX ? Math.log10(value) : value, index }];
    });
    if (!samples.length) return [];
    const min = Math.min(...samples.map((sample) => sample.value)), max = Math.max(...samples.map((sample) => sample.value));
    const count = Math.max(1, Math.min(100, Math.floor(options.bins) || 10));
    const width = (max - min || 1) / count;
    const bins: ChartPoint[] = Array.from({ length: count }, (_, index) => ({ x: min + (index + 0.5) * width, x0: min + index * width, x1: min + (index + 1) * width, y: 0, label: "", series: "Count", rows: [] }));
    for (const sample of samples) {
      const bin = bins[Math.min(count - 1, Math.floor((sample.value - min) / width))];
      bin.rows.push(sample.index); bin.y++;
    }
    return bins.map((bin) => ({ ...bin, label: `${axisValue(bin.x0!, options.logX)} – ${axisValue(bin.x1!, options.logX)}`, y: options.logY ? Math.log10(bin.y || 1) : bin.y })).filter((bin) => !options.logY || bin.rows.length > 0);
  }
  const categories = new Map<string, number>();
  return table.rows.flatMap((row, index) => {
    const label = row[xi], rawX = numericCell(label), rawY = numericCell(row[yi]);
    if (rawY === null || (options.logY && rawY <= 0)) return [];
    if (options.kind !== "bar" && rawX === null) return [];
    if (!categories.has(label)) categories.set(label, categories.size);
    const x = options.kind === "bar" ? categories.get(label)! : rawX!;
    if (options.logX && x <= 0 && options.kind !== "bar") return [];
    return [{ x: options.logX && options.kind !== "bar" ? Math.log10(x) : x, y: options.logY ? Math.log10(rawY) : rawY, label, series: si < 0 ? options.y : row[si], rows: [index] }];
  });
}
export function chartBounds(points: ChartPoint[], kind: ChartKind): [number, number, number, number] {
  if (!points.length) return [0, 1, 0, 1];
  const xs = points.flatMap((point) => [point.x0 ?? point.x, point.x1 ?? point.x]), ys = points.map((point) => point.y);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (kind === "bar" || kind === "histogram") { minY = Math.min(0, minY); maxY = Math.max(0, maxY); }
  const px = (maxX - minX || 1) * 0.06, py = (maxY - minY || 1) * 0.1;
  minX -= px; maxX += px; minY -= py; maxY += py;
  return [minX, maxX, minY, maxY];
}
export function selectedChartRows(points: ChartPoint[], bounds: [number, number, number, number]): number[] {
  const [x0, x1, y0, y1] = bounds;
  return [...new Set(points.filter((point) => point.x >= Math.min(x0, x1) && point.x <= Math.max(x0, x1) && point.y >= Math.min(y0, y1) && point.y <= Math.max(y0, y1)).flatMap((point) => point.rows))].sort((a, b) => a - b);
}
export function axisValue(value: number, log: boolean): string {
  return Number((log ? 10 ** value : value).toPrecision(4)).toString();
}
