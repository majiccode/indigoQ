#!/bin/sh
set -eu

REPO="majiccode/indigoQ"
VERSION="${INDIGOQ_VERSION:-}"
INSTALL_DIR="${INDIGOQ_INSTALL_DIR:-$HOME/.local/indigoq}"
BIN_DIR="${INDIGOQ_BIN_DIR:-$HOME/.local/bin}"

info() { printf '%s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || err "Required command not found: $1"; }

need curl
need tar

os=$(uname -s)
case "$os" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) err "Unsupported operating system: $os. Download a bundle from https://github.com/$REPO/releases/latest" ;;
esac

arch=$(uname -m)
case "$arch" in
  arm64|aarch64) arch=arm64 ;;
  x86_64|amd64) arch=x64 ;;
  *) err "Unsupported architecture: $arch" ;;
esac

case "$platform/$arch" in
  darwin/arm64|darwin/x64|linux/x64) ;;
  *) err "No prebuilt bundle for $platform/$arch yet. See https://github.com/$REPO/releases/latest" ;;
esac

if [ -z "$VERSION" ]; then
  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" || true)
  case "$latest_url" in
    */tag/v*) VERSION=${latest_url##*/tag/v} ;;
    *) err "Could not determine the latest release. Set INDIGOQ_VERSION to a version such as 0.1.2." ;;
  esac
fi
VERSION=${VERSION#v}

asset="indigoQ-${VERSION}-${platform}-${arch}-server.tar.gz"
url="https://github.com/$REPO/releases/download/v${VERSION}/${asset}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if [ -n "${INDIGOQ_ARCHIVE:-}" ]; then
  cp "$INDIGOQ_ARCHIVE" "$tmp/$asset"
else
  info "Downloading indigoQ $VERSION for $platform/$arch..."
  curl -fL --retry 3 -o "$tmp/$asset" "$url" || err "Download failed: $url"
fi

info "Installing to $INSTALL_DIR..."
tar -xzf "$tmp/$asset" -C "$tmp"
bundle="$tmp/indigoQ-${VERSION}-${platform}-${arch}-server"
[ -d "$bundle" ] || err "Unexpected archive layout."
rm -rf "$INSTALL_DIR/app"
mkdir -p "$INSTALL_DIR" "$BIN_DIR"
cp -R "$bundle" "$INSTALL_DIR/app"
chmod +x "$INSTALL_DIR/app/indigoq-server" "$INSTALL_DIR/app/Start indigoQ.command" 2>/dev/null || true
if [ "$platform" = darwin ] && command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$INSTALL_DIR/app" 2>/dev/null || true
fi
printf '#!/bin/sh\nexec "%s" "$@"\n' "$INSTALL_DIR/app/indigoq-server" > "$BIN_DIR/indigoq"
chmod +x "$BIN_DIR/indigoq"

info ""
info "indigoQ $VERSION installed."
if [ "$BIN_DIR" = "$HOME/.local/bin" ]; then
  info '  Run:  ~/.local/bin/indigoq'
else
  info "  Run:  \"$BIN_DIR/indigoq\""
fi
info "  Open: http://127.0.0.1:8787"
info 'Keep Terminal open while using indigoQ; press Ctrl+C to stop.'
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) info "Optional: add $BIN_DIR to PATH to run indigoq by name: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
