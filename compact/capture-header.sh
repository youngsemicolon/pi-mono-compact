#!/usr/bin/env bash
# Captures the startup header of one or more pi commands, each in its own isolated HOME and tmux server
# with a clean environment, and renders them stacked into one PNG (when PLAYWRIGHT_CORE is set).
#
# Usage: compact/capture-header.sh <out-dir> <label> <command> [<label> <command>]...
#   e.g. compact/capture-header.sh /tmp/headers "pi 0.87.1" "/opt/pi-0.87.1/bin/pi" "this fork" "$PWD/pi-test.sh"
# Env:   COLS/ROWS (default 100x6), FD_BIN, PLAYWRIGHT_CORE, CHROMIUM (see compact/capture.sh)
set -euo pipefail

OUT="$1"
shift
COLS="${COLS:-100}"
ROWS="${ROWS:-6}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$OUT"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pi-header-XXXXXX")"
SOCK="pi-header-$$"
trap 'tmux -L "$SOCK" kill-server 2>/dev/null || true; rm -rf "$WORK"' EXIT
printf 'set -g default-terminal "tmux-256color"\nset -as terminal-features ",*:RGB"\nset -g status off\n' >"$WORK/tmux.conf"

panes=()
index=0
while (($# >= 2)); do
	label="$1"
	command="$2"
	shift 2
	index=$((index + 1))
	home="$WORK/home-$index"
	mkdir -p "$home/.pi/agent/bin" "$home/project"
	if [[ -n "${FD_BIN:-}" ]]; then cp "$FD_BIN" "$home/.pi/agent/bin/fd"; fi
	tmux -L "$SOCK" -f "$WORK/tmux.conf" new-session -d -s "h$index" -x "$COLS" -y "$((ROWS + 30))" -c "$home/project" \
		"env -i PATH='$PATH' HOME='$home' TERM=tmux-256color COLORTERM=truecolor LANG=C.UTF-8 $command; sleep 600"
	deadline=$((SECONDS + 30))
	until tmux -L "$SOCK" capture-pane -t "h$index" -p | grep -q "interrupt"; do
		if ((SECONDS > deadline)); then
			echo "timeout waiting for the header of: $label" >&2
			tmux -L "$SOCK" capture-pane -t "h$index" -p >&2
			exit 1
		fi
		sleep 0.2
	done
	sleep 1.5
	tmux -L "$SOCK" capture-pane -t "h$index" -p -e -N | head -n "$ROWS" >"$OUT/header-$index.ansi"
	tmux -L "$SOCK" capture-pane -t "h$index" -p | head -n "$ROWS" >"$OUT/header-$index.txt"
	echo "== $label" | tee -a "$OUT/headers.txt"
	tee -a "$OUT/headers.txt" <"$OUT/header-$index.txt"
	panes+=(--pane "$OUT/header-$index.ansi" --title "$label")
done

node "$HERE/ansi-to-png.mjs" "$OUT/headers.png" --stack "${panes[@]}"
