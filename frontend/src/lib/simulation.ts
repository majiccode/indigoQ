export type SimulationMode = "spring" | "pendulum" | "orbit" | "population" | "epidemic";
export function simulate(mode: SimulationMode, duration: number, parameters: Record<string, number>) {
  const p = parameters;
  let x = p.amplitude ?? 2, v = 0, y = 0, vy = 0.8;
  if (mode === "population") { x = 10; y = 5; }
  if (mode === "epidemic") { x = 0.99; y = 0.01; }
  const count = Math.min(3000, Math.ceil(duration * 60)), dt = duration / Math.max(1, count);
  const rows: number[][] = [];
  for (let i = 0; i <= count; i++) {
    rows.push([i * dt, x, mode === "spring" || mode === "pendulum" ? v : y]);
    const damping = Math.max(0, p.damping ?? 0.15), frequency = Math.max(0.01, p.frequency ?? 1.5);
    if (mode === "spring" || mode === "pendulum") {
      v += (-(frequency ** 2) * (mode === "pendulum" ? Math.sin(x) : x) - damping * v) * dt;
      x += v * dt;
    } else if (mode === "orbit") {
      const r = Math.max(0.1, Math.hypot(x, y)), g = p.gravity ?? 1;
      v -= g * x / r ** 3 * dt; vy -= g * y / r ** 3 * dt;
      x += v * dt; y += vy * dt;
    } else if (mode === "population") {
      const dx = (p.growth ?? 1) * x - (p.predation ?? 0.1) * x * y;
      const dy = (p.conversion ?? 0.05) * x * y - (p.death ?? 0.5) * y;
      x = Math.max(0, x + dx * dt); y = Math.max(0, y + dy * dt);
    } else {
      const infected = (p.transmission ?? 0.8) * x * y;
      x = Math.max(0, x - infected * dt); y = Math.max(0, y + (infected - (p.recovery ?? 0.2) * y) * dt);
    }
    if (![x, y, v, vy].every(Number.isFinite)) throw new Error("Simulation diverged; reduce the parameter values");
  }
  return rows;
}
