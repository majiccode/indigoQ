import { stripFence } from "./workspaceData";

export type ComponentType = "power" | "mcu" | "led" | "resistor" | "button" | "lcd" | "ground" | "wire";
export type PinRole = "vcc" | "gnd" | "data" | "signal";
export interface Pin { id: string; role: PinRole; label: string }
export interface Part { id: string; type: ComponentType; label: string; value: string; x: number; y: number; rotation: number; pins: Pin[] }
export interface Wire { id: string; from: { comp: string; pin: string }; to: { comp: string; pin: string }; color: string }
export interface Circuit { components: Part[]; wires: Wire[] }
export const TEMPLATES: Record<ComponentType, { label: string; value: string; width: number; height: number; pins: { role: PinRole; label: string }[] }> = {
  power: { label: "Power", value: "5V", width: 70, height: 40, pins: [{ role: "vcc", label: "V+" }, { role: "gnd", label: "GND" }] },
  mcu: { label: "MCU", value: "ATmega328P", width: 120, height: 140, pins: [{ role: "vcc", label: "VCC" }, { role: "gnd", label: "GND" }, ...["D2", "D3", "D4", "D5", "D6", "D7"].map((label) => ({ role: "signal" as const, label })), { role: "data", label: "SDA" }, { role: "data", label: "SCL" }] },
  led: { label: "LED", value: "Red", width: 60, height: 40, pins: [{ role: "signal", label: "Anode" }, { role: "gnd", label: "Cathode" }] },
  resistor: { label: "Resistor", value: "220Ω", width: 70, height: 40, pins: [{ role: "signal", label: "A" }, { role: "signal", label: "B" }] },
  button: { label: "Button", value: "Tactile", width: 60, height: 40, pins: [{ role: "signal", label: "1" }, { role: "signal", label: "2" }] },
  lcd: { label: "LCD 16×2", value: "HD44780", width: 150, height: 120, pins: [{ role: "vcc", label: "VCC" }, { role: "gnd", label: "GND" }, ...["RS", "R/W", "E", "D4", "D5", "D6", "D7", "A", "K"].map((label) => ({ role: "data" as const, label }))] },
  ground: { label: "Ground", value: "0V", width: 60, height: 40, pins: [{ role: "gnd", label: "GND" }] },
  wire: { label: "Wire", value: "", width: 60, height: 40, pins: [{ role: "signal", label: "A" }, { role: "signal", label: "B" }] },
};
export const PIN_COLORS: Record<PinRole, string> = { vcc: "#e11d48", gnd: "#94a3b8", data: "#06b6d4", signal: "#fbbf24" };
export function makePart(type: ComponentType, id: string, x: number, y: number): Part {
  const template = TEMPLATES[type];
  return { id, type, x, y, rotation: 0, label: template.label, value: template.value, pins: template.pins.map((pin, i) => ({ ...pin, id: `p${i}` })) };
}
export function parseCircuit(text: string): Circuit {
  const data = JSON.parse(stripFence(text));
  if (!data || !Array.isArray(data.components) || !Array.isArray(data.wires) || data.components.length > 200 || data.wires.length > 2000) throw new Error("Use a circuit with up to 200 components and 2,000 wires");
  const ids = new Set<string>();
  const components = data.components.map((raw: Part): Part => {
    if (!raw || !raw.id || ids.has(raw.id)) throw new Error("Components need unique IDs");
    ids.add(raw.id);
    const type = String(raw.type) === "vsource" ? "power" : raw.type;
    if (!Object.hasOwn(TEMPLATES, type)) throw new Error(`Unsupported component type: ${raw.type}`);
    if (![raw.x, raw.y, raw.rotation ?? 0].every(Number.isFinite)) throw new Error("Component positions must be finite numbers");
    const part = makePart(type, raw.id, raw.x, raw.y);
    part.label = String(raw.label ?? part.label); part.value = String(raw.value ?? part.value); part.rotation = raw.rotation ?? 0;
    part.pins = part.pins.map((p, i) => ({ ...p, id: raw.pins?.[i]?.id ?? p.id }));
    if (new Set(part.pins.map((p) => p.id)).size !== part.pins.length) throw new Error("Pin IDs must be unique within a component");
    return part;
  });
  const endpoint = (raw: { comp: string; pin: string | number }) => {
    const part = components.find((c: Part) => c.id === raw?.comp);
    if (!part) throw new Error("Wire references a missing component");
    const pin = typeof raw.pin === "number" ? part.pins[raw.pin] : part.pins.find((p: Pin) => p.id === raw.pin);
    if (!pin) throw new Error("Wire references a missing pin");
    return { comp: part.id, pin: pin.id };
  };
  const wireIds = new Set<string>();
  const wires = data.wires.map((raw: Wire): Wire => {
    if (!raw || !raw.id || wireIds.has(raw.id)) throw new Error("Wires need unique IDs");
    wireIds.add(raw.id);
    return { id: raw.id, from: endpoint(raw.from), to: endpoint(raw.to), color: /^#[0-9a-f]{6}$/i.test(raw.color ?? "") ? raw.color : "#fbbf24" };
  });
  return { components, wires };
}
export function pinPosition(part: Part, index: number, world = true) {
  const t = TEMPLATES[part.type], half = Math.ceil(part.pins.length / 2), left = index < half;
  const count = left ? half : part.pins.length - half, row = left ? index : index - half;
  const x = left ? 0 : t.width, y = t.height * (row + 1) / (count + 1);
  if (!world) return { x, y };
  const angle = part.rotation * Math.PI / 180, dx = x - t.width / 2, dy = y - t.height / 2;
  return { x: part.x + t.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle), y: part.y + t.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
}
export function circuitNets(circuit: Circuit): string[][] {
  const adjacency = new Map<string, Set<string>>();
  const key = (e: Wire["from"]) => `${e.comp}:${e.pin}`;
  for (const wire of circuit.wires) {
    const a = key(wire.from), b = key(wire.to);
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b); adjacency.get(b)!.add(a);
  }
  const seen = new Set<string>(), nets: string[][] = [];
  for (const start of adjacency.keys()) {
    if (seen.has(start)) continue;
    const stack = [start], net: string[] = [];
    while (stack.length) { const node = stack.pop()!; if (seen.has(node)) continue; seen.add(node); net.push(node); stack.push(...adjacency.get(node)!); }
    nets.push(net);
  }
  return nets;
}
export function checkCircuit(circuit: Circuit): string[] {
  const messages: string[] = [], nets = circuitNets(circuit);
  const poweredPins = new Set(circuit.components.filter((p) => p.type === "power").flatMap((p) => p.pins.filter((pin) => pin.role === "vcc").map((pin) => `${p.id}:${pin.id}`)));
  const groundedPins = new Set(circuit.components.filter((p) => p.type === "power" || p.type === "ground").flatMap((p) => p.pins.filter((pin) => pin.role === "gnd").map((pin) => `${p.id}:${pin.id}`)));
  if (!circuit.components.length) return ["No components to check."];
  for (const net of nets) if (net.some((n) => poweredPins.has(n)) && net.some((n) => groundedPins.has(n))) messages.push("Power is directly shorted to ground.");
  for (const part of circuit.components.filter((p) => p.type === "mcu" || p.type === "lcd")) {
    for (const pin of part.pins.filter((p) => p.role === "vcc" || p.role === "gnd")) {
      const net = nets.find((n) => n.includes(`${part.id}:${pin.id}`));
      const sources = pin.role === "vcc" ? poweredPins : groundedPins;
      if (!net?.some((n) => sources.has(n))) messages.push(`${part.label}.${pin.label}: missing ${pin.role === "vcc" ? "power source" : "ground"} connection.`);
    }
  }
  return messages;
}
