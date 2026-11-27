#!/bin/sh
set -eu
exec node "$(dirname "$0")/scripts/build-release.mjs" --auto "$@"
