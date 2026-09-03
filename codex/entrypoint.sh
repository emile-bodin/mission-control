#!/bin/sh
set -eu

umask 077
mkdir -p "$CODEX_HOME"
install -m 600 /opt/codex/runtime-config.toml "$CODEX_HOME/config.toml"

exec "$@"
