"""System metrics endpoints. Exposes CPU, memory, disk, network, process, and GPU stats."""

from __future__ import annotations

import shutil
import subprocess

import psutil
from fastapi import APIRouter

router = APIRouter(prefix="/api/system")


def _gpu_info() -> dict | None:
    """Best-effort GPU info via nvidia-smi. Returns None when unavailable."""
    if shutil.which("nvidia-smi") is None:
        return None
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode != 0:
            return None
        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) < 6:
                continue

            def to_float(value: str, default: float = 0.0) -> float:
                return float(value) if value.replace(".", "", 1).isdigit() else default

            gpus.append(
                {
                    "index": int(parts[0]) if parts[0].isdigit() else 0,
                    "name": parts[1],
                    "utilization": to_float(parts[2]),
                    "memory_used": to_float(parts[3]),
                    "memory_total": to_float(parts[4]),
                    "temperature": to_float(parts[5]),
                }
            )
        return {"gpus": gpus, "available": len(gpus) > 0}
    except (subprocess.TimeoutExpired, OSError, ValueError):
        return None


@router.get("/cpu")
def cpu() -> dict:
    return {
        "percent": psutil.cpu_percent(interval=None),
        "count": psutil.cpu_count(),
        "per_cpu": psutil.cpu_percent(interval=None, percpu=True),
    }


@router.get("/memory")
def memory() -> dict:
    mem = psutil.virtual_memory()
    swap = psutil.swap_memory()
    return {
        "total": mem.total,
        "available": mem.available,
        "used": mem.used,
        "percent": mem.percent,
        "free": mem.free,
        "swap_total": swap.total,
        "swap_used": swap.used,
        "swap_percent": swap.percent,
    }


@router.get("/disk")
def disk() -> dict:
    partitions = []
    for part in psutil.disk_partitions(all=False):
        try:
            usage = psutil.disk_usage(part.mountpoint)
        except (OSError, PermissionError):
            continue
        partitions.append(
            {
                "device": part.device,
                "mountpoint": part.mountpoint,
                "fstype": part.fstype,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent,
            }
        )
    return {"partitions": partitions}


@router.get("/network")
def network() -> dict:
    io = psutil.net_io_counters()
    return {
        "bytes_sent": io.bytes_sent,
        "bytes_recv": io.bytes_recv,
        "packets_sent": io.packets_sent,
        "packets_recv": io.packets_recv,
        "errin": io.errin,
        "errout": io.errout,
        "dropin": io.dropin,
        "dropout": io.dropout,
    }


@router.get("/processes")
def processes(limit: int = 10) -> dict:
    procs = []
    for proc in psutil.process_iter(["pid", "name", "cpu_percent", "memory_percent", "username"]):
        try:
            info = proc.info
            procs.append(
                {
                    "pid": info["pid"],
                    "name": info["name"],
                    "cpu_percent": info["cpu_percent"] or 0.0,
                    "memory_percent": round(info["memory_percent"] or 0.0, 2),
                    "username": info["username"],
                }
            )
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    procs.sort(key=lambda p: p["cpu_percent"], reverse=True)
    return {"processes": procs[: max(1, min(limit, 50))]}


@router.get("/gpu")
def gpu() -> dict:
    info = _gpu_info()
    if info is None:
        return {"available": False, "gpus": []}
    return info


@router.get("/metrics")
def metrics() -> dict:
    """All system metrics in a single payload, convenient for polling."""
    return {
        "cpu": cpu(),
        "memory": memory(),
        "disk": disk(),
        "network": network(),
        "gpu": gpu(),
        "processes": processes(limit=8),
    }
