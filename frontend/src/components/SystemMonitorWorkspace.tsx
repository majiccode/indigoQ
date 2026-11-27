"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TypedWorkspaceProps } from "@/lib/workspaceRegistry";
import { StudioShell, useStudio } from "./StudioKit";

const POLL_MS = 2000;
const HISTORY = 60; // ~2 minutes at 2s polls

type SystemMetrics = {
  cpu: { percent: number; count: number; per_cpu: number[] };
  memory: { total: number; available: number; used: number; percent: number; free: number; swap_total: number; swap_used: number; swap_percent: number };
  disk: { partitions: Array<{ device: string; mountpoint: string; fstype: string; total: number; used: number; free: number; percent: number }> };
  network: { bytes_sent: number; bytes_recv: number; packets_sent: number; packets_recv: number; errin: number; errout: number; dropin: number; dropout: number };
  gpu: { available: boolean; gpus: Array<{ index: number; name: string; utilization: number; memory_used: number; memory_total: number; temperature: number }> };
  processes: Array<{ pid: number; name: string; cpu_percent: number; memory_percent: number; username: string }>;
};

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(1)} ${units[unit]}`;
}

// Render a filled area sparkline as JSX SVG elements that re-render when history updates.
function AreaChart({ points, width, height, color }: { points: number[]; width: number; height: number; color: string }) {
  if (points.length === 0) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1 || 1);
  const coords = points.map((p, i) => {
    const x = i * step;
    const y = height - ((p - min) / range) * height;
    return [x, y] as [number, number];
  });
  const pathCoords = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  return (
    <path
      d={`${pathCoords} L${width.toFixed(1)},${height.toFixed(1)}L0,${height.toFixed(1)}Z`}
      stroke={color}
      strokeWidth={2}
      fill={color}
      fillOpacity={0.15}
    />
  );
}

export default function SystemMonitorWorkspace(props: TypedWorkspaceProps) {
  const app = useStudio(props, "system-monitor");
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [error, setError] = useState("");
  const [cpuHistory, setCpuHistory] = useState<number[]>([]);
  const [memHistory, setMemHistory] = useState<number[]>([]);
  const [netSentHistory, setNetSentHistory] = useState<number[]>([]);
  const [netRecvHistory, setNetRecvHistory] = useState<number[]>([]);
  const lastNet = useRef<{ sent: number; recv: number } | null>(null);
  const mounted = useRef(true);

  const poll = useCallback(async () => {
    if (!mounted.current) return;
    try {
      const response = await fetch("/api/system/metrics", { cache: "no-store" });
      if (!response.ok) throw new Error(`System metrics failed (${response.status})`);
      const next = (await response.json()) as SystemMetrics;
      setMetrics(next);
      setCpuHistory((prev) => [...prev.slice(-(HISTORY - 1)), next.cpu.percent]);
      setMemHistory((prev) => [...prev.slice(-(HISTORY - 1)), next.memory.percent]);
      const last = lastNet.current;
      if (last) {
        setNetSentHistory((prev) => [...prev.slice(-(HISTORY - 1)), next.network.bytes_sent - last.sent]);
        setNetRecvHistory((prev) => [...prev.slice(-(HISTORY - 1)), next.network.bytes_recv - last.recv]);
      } else {
        setNetSentHistory((prev) => [...prev.slice(-(HISTORY - 1)), 0]);
        setNetRecvHistory((prev) => [...prev.slice(-(HISTORY - 1)), 0]);
      }
      lastNet.current = { sent: next.network.bytes_sent, recv: next.network.bytes_recv };
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const timer = window.setTimeout(poll, 0);
    const interval = window.setInterval(poll, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [poll]);

  const cpu = metrics?.cpu;
  const memory = metrics?.memory;
  const disk = metrics?.disk;
  const network = metrics?.network;
  const gpu = metrics?.gpu;
  const processes = metrics?.processes;

  return <StudioShell kind="system-monitor" status={app.status} error={app.error || error}>
    <div className="tool-toolbar">
      {cpu && (
        <>
          <span className="stat-card"><strong>CPU</strong><span>{cpu.percent.toFixed(1)}%</span></span>
          <span className="stat-card"><strong>Cores</strong><span>{cpu.count}</span></span>
        </>
      )}
      {memory && (
        <>
          <span className="stat-card"><strong>RAM</strong><span>{memory.percent.toFixed(1)}%</span></span>
          <span className="stat-card"><strong>Used</strong><span>{formatBytes(memory.used)}</span></span>
        </>
      )}
      {disk && (
        <>
          <span className="stat-card"><strong>Disk</strong><span>{disk.partitions.reduce((a, p) => a + p.percent, 0) / disk.partitions.length || 0}%</span></span>
        </>
      )}
      {network && (
        <>
          <span className="stat-card"><strong>Net↑</strong><span>{formatBytes(network.bytes_sent)}</span></span>
          <span className="stat-card"><strong>Net↓</strong><span>{formatBytes(network.bytes_recv)}</span></span>
        </>
      )}
    </div>

    <div className="sys-charts">
      {cpu && (
        <div className="sys-chart">
          <div className="sys-chart-header">CPU Usage</div>
          <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none">
            <rect width="320" height="120" fill="#101810" />
            <AreaChart points={cpuHistory} width={320} height={90} color="#c8a4ff" />
            <text x="6" y="18" fill="#bac9ae" fontSize="10">{cpu.percent.toFixed(1)}%</text>
            <text x="6" y="30" fill="#9cad91" fontSize="9">{cpu.count} cores</text>
          </svg>
        </div>
      )}
      {memory && (
        <div className="sys-chart">
          <div className="sys-chart-header">Memory Usage</div>
          <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none">
            <rect width="320" height="120" fill="#101810" />
            <AreaChart points={memHistory} width={320} height={90} color="#9cdbbd" />
            <text x="6" y="18" fill="#bac9ae" fontSize="10">{memory.percent.toFixed(1)}%</text>
            <text x="6" y="30" fill="#9cad91" fontSize="9">{formatBytes(memory.used)} / {formatBytes(memory.total)}</text>
          </svg>
        </div>
      )}
      {network && (
        <div className="sys-chart">
          <div className="sys-chart-header">Network I/O (per poll)</div>
          <svg width="100%" height="120" viewBox="0 0 320 120" preserveAspectRatio="none">
            <rect width="320" height="120" fill="#101810" />
            <AreaChart points={netSentHistory} width={320} height={90} color="#f2bd78" />
            <AreaChart points={netRecvHistory} width={320} height={90} color="#86bdf6" />
            <text x="6" y="18" fill="#f2bd78" fontSize="10">↑ {formatBytes(network.bytes_sent)}</text>
            <text x="6" y="30" fill="#86bdf6" fontSize="10">↓ {formatBytes(network.bytes_recv)}</text>
          </svg>
        </div>
      )}
      {gpu?.available && gpu.gpus.length > 0 && (
        <div className="sys-chart">
          <div className="sys-chart-header">GPU</div>
          {gpu.gpus.map((g) => (
            <div key={g.index} className="sys-gpu-card">
              <strong>{g.name}</strong>
              <div className="sys-bar"><div className="sys-bar-fill" style={{ width: `${g.utilization}%`, background: "#c8a4ff" }} /></div>
              <span className="sys-label">{g.utilization.toFixed(1)}% util</span>
              <div className="sys-bar"><div className="sys-bar-fill" style={{ width: `${(g.memory_used / g.memory_total) * 100 || 0}%`, background: "#86bdf6" }} /></div>
              <span className="sys-label">{formatBytes(g.memory_used * 1024 * 1024)} / {formatBytes(g.memory_total * 1024 * 1024)} mem · {g.temperature.toFixed(0)}°C</span>
            </div>
          ))}
        </div>
      )}
      {disk?.partitions && (
        <div className="sys-chart">
          <div className="sys-chart-header">Disk Partitions</div>
          {disk.partitions.map((p) => (
            <div key={p.mountpoint} className="sys-bar-row">
              <span className="sys-label">{p.mountpoint}</span>
              <div className="sys-bar"><div className="sys-bar-fill" style={{ width: `${p.percent}%`, background: "#9cdbbd" }} /></div>
              <span className="sys-label">{p.percent.toFixed(1)}% · {formatBytes(p.used)} / {formatBytes(p.total)}</span>
            </div>
          ))}
        </div>
      )}
      {processes && processes.length > 0 && (
        <div className="sys-chart">
          <div className="sys-chart-header">Top Processes (CPU)</div>
          {processes.map((p) => (
            <div key={p.pid} className="sys-bar-row">
              <span className="sys-label">{p.name}</span>
              <div className="sys-bar"><div className="sys-bar-fill" style={{ width: `${Math.min(p.cpu_percent, 100)}%`, background: "#f2bd78" }} /></div>
              <span className="sys-label">{p.cpu_percent.toFixed(1)}% · PID {p.pid}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </StudioShell>;
}
