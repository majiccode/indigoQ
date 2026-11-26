# Install indigoQ

Download packages from <https://github.com/majiccode/indigoQ/releases/latest>.
Python, Node, pnpm, moon, and uv are **not required** for the pre-built downloads.
Ollama and its models are optional and installed separately.

## Desktop application

- **macOS:** choose `arm64` for Apple Silicon or `x64` for Intel. Open the DMG
  and drag indigoQ to Applications, or extract the desktop ZIP.
- **Windows x64:** run the installer EXE, or extract the desktop ZIP and run indigoQ.exe.
- **Linux x64:** make the AppImage executable (`chmod +x indigoQ-*.AppImage`) and run it.
  If FUSE is unavailable, use `./indigoQ-*.AppImage --appimage-extract-and-run`,
  or extract the desktop tar.gz and run `indigoq-desktop`.
  Ubuntu 22.04 or newer (or a compatible glibc-based distribution) is recommended.

Mac builds from **v0.1.1** have an ad-hoc signature for bundle integrity but are
**not Apple Developer ID signed or notarized**. Windows builds are unsigned.
On macOS, if Gatekeeper blocks launch,
try launching once, then use **System Settings → Privacy & Security → Open Anyway**.
On Windows, SmartScreen may show **More info → Run anyway**. Use these overrides
only for downloads you trust from this repository. No automatic updates are installed.

### macOS says the application is damaged

The v0.1.0 desktop downloads had an invalid Mac app signature. Delete that copy,
download **v0.1.1 or later**, and copy the app from the DMG to Applications.
For an M1/M2/M3/M4 Mac, select the **mac-arm64** DMG, not mac-x64.
Then try launching and use **Privacy & Security → Open Anyway** if prompted.

If macOS still blocks a freshly downloaded, trusted copy, check its integrity in Terminal:

```sh
codesign --verify --deep --strict --verbose=2 /Applications/indigoQ.app
```

If verification succeeds but Gatekeeper still reports it as damaged, you can remove
the download quarantine attribute from this app only, then launch it:

```sh
xattr -dr com.apple.quarantine /Applications/indigoQ.app
open /Applications/indigoQ.app
```

Only do this for a verified download you trust from the release page. If signature
verification fails, download a fresh copy rather than bypassing that failure.

The desktop app starts a loopback-only server on an available port and stops it
when the app quits. A regular window close on macOS leaves the app running; use Quit.
Desktop data and server.log live in Electron's per-user `indigoq-desktop` application
data directory (macOS: `~/Library/Application Support/indigoq-desktop`, Windows:
`%APPDATA%/indigoq-desktop`, Linux: `~/.config/indigoq-desktop`).

## Portable browser/server bundle

Choose an archive whose name ends in `-server.zip` or `-server.tar.gz`.
Extract **the entire directory**, keeping `_internal` beside the executable.
Run `Start indigoQ.cmd` on Windows or `Start indigoQ.command` on macOS/Linux
(or `./indigoq-server` in a terminal). A browser opens at <http://127.0.0.1:8787>.
Keep the terminal running; press Ctrl+C to stop the server.
On macOS this unsigned command-line bundle may also require allowing the executable
through Privacy & Security. The DMG is the recommended Mac download.

Options: `--port 9000`, `--port 0` (available port), `--no-browser`, `--host 0.0.0.0`.
Defaults bind only to your machine. The application is intended for a single user
and has no login; keep it on loopback or a trusted private network.

Portable data is separate from the extracted archive:

| System | Default graph location |
|---|---|
| macOS | `~/Library/Application Support/indigoQ/graph.json` |
| Windows | `%APPDATA%/indigoQ/graph.json` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/indigoQ/graph.json` |

Set `INDIGOQ_DATA_FILE` to override the portable server's graph path.
Use **Save JSON / Load JSON** to move work between desktop, browser, and other machines.

## Docker

Download `compose.yaml` from the release, then run in that directory:

```sh
docker compose up -d
```

Open <http://localhost:3000>. Data is kept in the `indigoq-data` named volume.
Stop with `docker compose down`; upgrade with `docker compose pull && docker compose up -d`.
Set `INDIGOQ_VERSION=0.1.0` to pin a release. Images support amd64 and arm64:

```sh
docker run -d --name indigoq -p 127.0.0.1:3000:8787 \
  -v indigoq-data:/data ghcr.io/majiccode/indigoq:0.1.0
```

Desktop/portable builds connect to Ollama at `http://127.0.0.1:11434`.
Compose uses `http://host.docker.internal:11434`. Ollama must accept connections
from Docker's network for that to work; configure `OLLAMA_HOST` on the Ollama
service accordingly, restricted by your local firewall. You can instead set
`OLLAMA_BASE_URL` to another reachable Ollama server.

## Verify downloads

The release includes `SHA256SUMS.txt`. Check the downloaded asset against it:

```sh
shasum -a 256 indigoQ-*.dmg # macOS
sha256sum indigoQ-*.AppImage # Linux
```

Windows PowerShell: `Get-FileHash .\indigoQ-*.exe -Algorithm SHA256`.

## Build and publish from source

Install Node 22+, pnpm 10.33.2, uv 0.11+, Git, and GitHub CLI. Authenticate with
`gh auth login`. Build for the current machine:

```sh
node scripts/build-release.mjs --build-only --desktop
```

Outputs are in `dist/`. Cross-platform installers are built on their native GitHub runners.
From a clean, up-to-date `main` branch, publish a new version with:

```sh
node scripts/build-release.mjs 0.1.1 --wait
```

This command runs checks, updates application versions and the Python lockfile,
commits changed version files, creates an annotated tag, and atomically pushes main
and the tag to origin. GitHub Actions builds and tests all platforms, publishes
multi-architecture Docker images to GHCR, and publishes the GitHub release with
installers, portable archives, Compose, these instructions, and checksums.
The tag must be new; choose a new version after a published release. A failed build
can be rerun in Actions before publication. No signing credentials are required.
