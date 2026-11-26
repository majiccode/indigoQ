"""Production entry point for frozen bundles and Docker."""

from __future__ import annotations

import argparse
import json
import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def data_directory() -> Path:
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData/Roaming")) / "indigoQ"
    if sys.platform == "darwin":
        return Path.home() / "Library/Application Support/indigoQ"
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "indigoQ"


def main() -> None:
    parser = argparse.ArgumentParser(description="indigoQ local application server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787, help="Use 0 for an available port")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--parent-pid", type=int, help="Exit if the desktop parent terminates")
    args = parser.parse_args()

    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    static_dir = root / "frontend" / "out"
    if not os.environ.get("INDIGOQ_STATIC_DIR") and static_dir.is_dir():
        os.environ["INDIGOQ_STATIC_DIR"] = str(static_dir)
    os.environ.setdefault("INDIGOQ_DATA_FILE", str(data_directory() / "graph.json"))

    from app.main import create_app

    # Pre-bind so port 0 has no allocation race and readiness reports the actual port.
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    if sys.platform == "win32":
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
    else:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind((args.host, args.port))
    sock.listen(128)
    port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    server = uvicorn.Server(uvicorn.Config(create_app(), host=args.host, port=port))

    def ready() -> None:
        while not server.started and not server.should_exit:
            time.sleep(0.05)
        if server.started:
            print(json.dumps({"event": "ready", "url": url}), flush=True)
            if not args.no_browser:
                webbrowser.open(url)

    def watch_parent() -> None:
        while not server.should_exit:
            try:
                if sys.platform == "win32":
                    import ctypes

                    handle = ctypes.windll.kernel32.OpenProcess(0x100000, False, args.parent_pid)
                    if not handle:
                        break
                    status = ctypes.windll.kernel32.WaitForSingleObject(handle, 0)
                    ctypes.windll.kernel32.CloseHandle(handle)
                    if status != 0x102:
                        break
                else:
                    os.kill(args.parent_pid, 0)
            except OSError:
                break
            time.sleep(1)
        server.should_exit = True

    threading.Thread(target=ready, daemon=True).start()
    if args.parent_pid:
        threading.Thread(target=watch_parent, daemon=True).start()
    try:
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == "__main__":
    main()
