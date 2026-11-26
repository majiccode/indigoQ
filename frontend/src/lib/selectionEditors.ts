export interface HSV { h: number; s: number; v: number; a: number }
export interface SelectionToken {
  kind: "colour" | "boolean" | "angle" | "unit" | "xy" | "array" | "number";
  from: number;
  to: number;
  raw: string;
  label: string;
  values: number[];
  unit?: string;
}

const NUMBER = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[-+]?\\d+)?";
const numbers = new RegExp(NUMBER, "gi");
export const rounded = (value: number) => String(Number(value.toFixed(4)));
const clamp = (value: number, max = 1) => Math.max(0, Math.min(max, value));
export function hsvRGB({ h, s, v }: HSV): number[] {
  const sector = ((h % 360 + 360) % 360) / 60;
  const c = v * s, x = c * (1 - Math.abs(sector % 2 - 1)), m = v - c;
  const rgb = sector < 1 ? [c, x, 0] : sector < 2 ? [x, c, 0] : sector < 3 ? [0, c, x] : sector < 4 ? [0, x, c] : sector < 5 ? [x, 0, c] : [c, 0, x];
  return rgb.map((channel) => (channel + m) * 255);
}
function rgbHSV(rgb: number[], a: number): HSV {
  const [r, g, b] = rgb.map((value) => clamp(value / 255));
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const h = !delta ? 0 : max === r ? 60 * (((g - b) / delta + 6) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h, s: max ? delta / max : 0, v: max, a: clamp(a) };
}

export function parseColour(raw: string): HSV | null {
  if (/^#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8})$/i.test(raw)) {
    const hex = raw.slice(1), expanded = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return rgbHSV([0, 2, 4].map((offset) => parseInt(expanded.slice(offset, offset + 2), 16)), expanded.length === 8 ? parseInt(expanded.slice(6), 16) / 255 : 1);
  }
  const fn = raw.match(/^(rgba?|hsla?|hsva?|hsba?)\(([^()]*)\)$/i);
  if (!fn) return null;
  const parts = fn[2].trim().split(/\s*[,/]\s*|\s+/);
  if (parts.length < 3 || parts.length > 4 || parts.some((part) => !new RegExp(`^${NUMBER}(?:%|deg|rad|turn|grad)?$`, "i").test(part))) return null;
  const values = parts.map(parseFloat);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const a = parts[3] ? clamp(values[3] / (parts[3].endsWith("%") ? 100 : 1)) : 1;
  if (/^rgb/i.test(fn[1])) return rgbHSV(values.slice(0, 3).map((value, i) => value * (parts[i].endsWith("%") ? 2.55 : 1)), a);
  const h = values[0] * (parts[0].endsWith("grad") ? 0.9 : parts[0].endsWith("rad") ? 180 / Math.PI : parts[0].endsWith("turn") ? 360 : 1);
  const hsv = /^hs[vb]/i.test(fn[1]);
  const normalized = hsv && !parts[1].endsWith("%") && !parts[2].endsWith("%") && values[1] <= 1 && values[2] <= 1;
  const s = clamp(values[1] / (normalized ? 1 : 100)), third = clamp(values[2] / (normalized ? 1 : 100));
  if (hsv) return { h: (h % 360 + 360) % 360, s, v: third, a };
  const v = third + s * Math.min(third, 1 - third);
  return { h: (h % 360 + 360) % 360, s: v ? 2 * (1 - third / v) : 0, v, a };
}

export function formatColour(raw: string, colour: HSV): string {
  const rgb = hsvRGB(colour);
  if (raw.startsWith("#")) {
    const alpha = raw.length === 5 || raw.length === 9 || colour.a < 1;
    const bytes = [...rgb, ...(alpha ? [colour.a * 255] : [])].map((value) => Math.round(clamp(value, 255)).toString(16).padStart(2, "0"));
    const short = raw.length <= 5 && bytes.every((byte) => byte[0] === byte[1]);
    const hex = bytes.map((byte) => short ? byte[0] : byte).join("");
    return "#" + (/[A-F]/.test(raw) ? hex.toUpperCase() : hex);
  }
  const name = raw.slice(0, raw.indexOf("("));
  const l = colour.v * (1 - colour.s / 2);
  const saturation = l === 0 || l === 1 ? 0 : (colour.v - l) / Math.min(l, 1 - l);
  const values = /^rgb/i.test(name) ? rgb : /^hsl/i.test(name) ? [colour.h, saturation * 100, l * 100] : [colour.h, colour.s * 100, colour.v * 100];
  const originalParts = raw.slice(raw.indexOf("(") + 1, -1).trim().split(/\s*[,/]\s*|\s+/);
  const normalizedHSV = /^hs[vb]/i.test(name) && !originalParts[1].endsWith("%") && !originalParts[2].endsWith("%") && parseFloat(originalParts[1]) <= 1 && parseFloat(originalParts[2]) <= 1;
  let index = 0;
  let result = raw.replace(new RegExp(`${NUMBER}(?:%|deg|rad|turn|grad)?`, "gi"), (part) => {
    const i = index++;
    let value = i === 3 ? colour.a : values[i];
    if (normalizedHSV && (i === 1 || i === 2)) value /= 100;
    if (i === 3 && part.endsWith("%")) value *= 100;
    if (/^rgb/i.test(name) && i < 3) value = part.endsWith("%") ? value / 2.55 : Math.round(value);
    if (!/^rgb/i.test(name) && i === 0) value *= part.endsWith("grad") ? 1 / 0.9 : part.endsWith("rad") ? Math.PI / 180 : part.endsWith("turn") ? 1 / 360 : 1;
    return rounded(value) + (part.match(/(?:%|deg|rad|turn|grad)$/i)?.[0] ?? "");
  });
  if (index === 3 && colour.a < 1) {
    result = result.slice(0, -1) + (raw.includes(",") ? ", " : " / ") + rounded(colour.a) + ")";
    if (raw.includes(",") && !/a$/i.test(name)) result = result.replace(name, name + "a");
  }
  return result;
}

export function replaceTokenValues(token: SelectionToken, values: number[]): string {
  let index = 0;
  return token.raw.replace(numbers, () => rounded(values[index++]));
}

export function detectSelectionTokens(text: string, offset: number, from: number, to: number): SelectionToken[] {
  if (from === to) return [];
  const tokens: SelectionToken[] = [];
  const occupied: { from: number; to: number }[] = [];
  const add = (pattern: RegExp, kind: SelectionToken["kind"], validate?: (raw: string) => boolean) => {
    for (const match of text.matchAll(pattern)) {
      const start = offset + match.index, end = start + match[0].length;
      if (occupied.some((item) => start < item.to && end > item.from)) continue;
      if (validate && !validate(match[0])) continue;
      occupied.push({ from: start, to: end });
      if (end <= from || start >= to) continue;
      const raw = match[0], values = Array.from(raw.matchAll(numbers), (number) => Number(number[0]));
      const label = text.slice(0, match.index).match(/([a-zA-Z_]\w*)["']?\s*[:=]\s*["']?\s*$/)?.[1] ?? kind;
      const unit = kind === "unit" || kind === "angle" ? raw.match(/[a-z%]+$/i)?.[0] : undefined;
      tokens.push({ kind, from: start, to: end, raw, label, values, unit });
    }
  };
  add(/#[a-f\d]+\b|\b(?:rgba?|hsla?|hsva?|hsba?)\([^()]*\)/gi, "colour", (raw) => !!parseColour(raw));
  add(new RegExp(`\\{\\s*["']?x["']?\\s*:\\s*${NUMBER}\\s*,\\s*["']?y["']?\\s*:\\s*${NUMBER}\\s*\\}`, "gi"), "xy");
  add(new RegExp(`\\[\\s*${NUMBER}(?:\\s*,\\s*${NUMBER}){1,63}\\s*\\]`, "gi"), "array");
  add(new RegExp(`(?<![\\w.])${NUMBER}\\s*(?:deg|rad|turn|grad)\\b`, "gi"), "angle");
  add(new RegExp(`(?<![\\w.])${NUMBER}\\s*(?:px|em|rem|vh|vw|vmin|vmax|ms|s|Hz|kHz|MHz|cm|mm|in|pt|%)\\b|(?<![\\w.])${NUMBER}\\s*%`, "gi"), "unit");
  add(/\b(?:true|false)\b/g, "boolean");
  add(new RegExp(`(?<![\\w.#])${NUMBER}(?![\\w.])`, "gi"), "number");
  return tokens.sort((a, b) => a.from - b.from).slice(0, 6).map((token) => token.kind === "array" && token.values.length === 2 ? { ...token, kind: "xy" } : token);
}
