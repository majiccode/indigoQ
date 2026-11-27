# Install indigoQ

indigoQ is a local web app. The pre-built bundles include the frontend, the
backend, and Python itself. You do **not** need Python, Node, pnpm, moon, or uv.
Ollama and its models are optional and installed separately.

## One-line install

### macOS or Linux

```sh
curl -fsSL https://github.com/majiccode/indigoQ/releases/latest/download/install.sh | sh
~/.local/bin/indigoq
```

Then open <http://127.0.0.1:8787>. Keep the terminal running; press `Ctrl+C` to stop.

The installer detects your OS and architecture, installs to `~/.local/indigoq`,
creates a launcher at `~/.local/bin/indigoq`, and removes the macOS quarantine
flag so the unsigned bundle can run.

Run `~/.local/bin/indigoq` each time you want to start the app. This works without
adding the launcher directory to your `PATH`. If you set `INDIGOQ_BIN_DIR`, use
the launcher path printed by the installer instead.

### Windows

```powershell
irm https://github.com/majiccode/indigoQ/releases/latest/download/install.ps1 | iex
indigoq
```

Then open <http://127.0.0.1:8787>. The installer installs to
`%LOCALAPPDATA%\indigoQ`, adds its `bin` folder to your user `PATH`, removes the
Mark-of-the-Web from the bundle, and creates a Start Menu shortcut.

Restart your terminal after installation if `indigoq` is not found.

### Install options

| Variable | Applies to | Purpose |
|---|---|---|
| `INDIGOQ_VERSION` | both | Install a specific version, e.g. `0.1.2` |
| `INDIGOQ_INSTALL_DIR` | both | Override the application install directory |
| `INDIGOQ_BIN_DIR` | macOS/Linux | Override where the `indigoq` launcher is created |
| `INDIGOQ_ARCHIVE` | both | Install from a local archive instead of downloading |

Examples:

```sh
INDIGOQ_VERSION=0.1.2 sh install.sh
INDIGOQ_INSTALL_DIR="$HOME/Applications/indigoQ" sh install.sh
```

## Manual install

Download the archive for your platform from
<https://github.com/majiccode/indigoQ/releases/latest>:

| Platform | Asset |
|---|---|
| macOS Apple Silicon | `indigoQ-<version>-darwin-arm64-server.tar.gz` |
| macOS Intel | `indigoQ-<version>-darwin-x64-server.tar.gz` |
| Linux x64 | `indigoQ-<version>-linux-x64-server.tar.gz` |
| Windows x64 | `indigoQ-<version>-win32-x64-server.zip` |

Extract **the entire directory**, keeping `_internal` beside the executable.

- **macOS/Linux:** run `./Start indigoQ.command`, or run `./indigoq-server` in a terminal.
- **Windows:** run `Start indigoQ.cmd`.

A browser opens at <http://127.0.0.1:8787>.

### If macOS blocks a manually downloaded copy

The bundles are not Apple Developer ID signed or notarized. The one-line
installer avoids this by downloading with `curl` and removing the quarantine
attribute. If you downloaded an archive with a browser instead, remove the
quarantine flag from the extracted directory:

```sh
xattr -dr com.apple.quarantine indigoQ-<version>-darwin-arm64-server
./indigoQ-<version>-darwin-arm64-server/Start\ indigoQ.command
```

Only do this for a download you trust from this repository.

### If Windows blocks a manually downloaded copy

Unblock the archive before extracting it:

```powershell
Unblock-File .\indigoQ-<version>-win32-x64-server.zip
```

Or unblock the extracted files:

```powershell
Get-ChildItem .\indigoQ-<version>-win32-x64-server -Recurse | Unblock-File
```

Then run `Start indigoQ.cmd`.

## Running and data

Options: `--port 9000`, `--port 0` (available port), `--no-browser`,
`--host 0.0.0.0`. Defaults bind only to your machine. The application is intended
for a single user and has no login; keep it on loopback or a trusted private
network.

Data is stored outside the install directory:

| System | Default graph location |
|---|---|
| macOS | `~/Library/Application Support/indigoQ/graph.json` |
| Windows | `%APPDATA%/indigoQ/graph.json` |
| Linux | `${XDG_DATA_HOME:-~/.local/share}/indigoQ/graph.json` |

Set `INDIGOQ_DATA_FILE` to override the graph path. Use **Save JSON / Load JSON**
to move work between machines.

## Ollama (optional)

Portable builds connect to Ollama at `http://127.0.0.1:11434`.
Install Ollama separately, then pull a model, for example:

```sh
ollama pull llama3.2
```

Set `OLLAMA_BASE_URL` to use a different Ollama server.

## Verify downloads

The release includes `SHA256SUMS.txt`. Check the downloaded asset against it:

```sh
shasum -a 256 indigoQ-*.tar.gz # macOS
sha256sum indigoQ-*.tar.gz     # Linux
```

Windows PowerShell:

```powershell
Get-FileHash .\indigoQ-*.zip -Algorithm SHA256
```

## Build and publish from source

Install Node 22+, pnpm 10.33.2, uv 0.11+, Git, and GitHub CLI. Authenticate with
`gh auth login`. Build the portable bundle for the current machine:

```sh
node scripts/build-release.mjs --build-only
```

Outputs are in `dist/`. Cross-platform bundles are built on their native GitHub
runners. From a clean, up-to-date `main` branch, publish a new version with:

```sh
node scripts/build-release.mjs 0.1.2 --wait
```

This command runs checks, updates application versions and the Python lockfile,
commits changed version files, creates an annotated tag, and atomically pushes
main and the tag to origin. GitHub Actions builds and tests the macOS arm64/x64,
Linux x64, and Windows x64 bundles, then publishes the GitHub release with the
bundles, one-line installers, these instructions, and checksums. No signing
credentials are required.
