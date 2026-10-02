#!/usr/bin/env bash
# Drives a fixed pi session in an isolated tmux server and captures each scene as
# .ansi (raw tmux capture), .txt (plain text), and .png (when PLAYWRIGHT_CORE is set).
#
# Usage: compact/capture.sh <pi-checkout> <out-dir> [label]
# Env:   COLS/ROWS     terminal size (default 100x34)
#        TUI_MODE      fullscreen (default) or regular
#        THEME         theme name passed to --use-theme (optional)
#        FD_BIN        fd binary to pre-provision (avoids the download banner)
#        PLAYWRIGHT_CORE, CHROMIUM   see compact/ansi-to-png.mjs
set -euo pipefail

PI_ROOT="$(cd "$1" && pwd)"
OUT="$2"
LABEL="${3:-$(basename "$PI_ROOT")}"
COLS="${COLS:-100}"
ROWS="${ROWS:-34}"
TUI_MODE="${TUI_MODE:-fullscreen}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOCK="pi-compact-$$"
SESSION=demo

mkdir -p "$OUT"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pi-compact-XXXXXX")"
trap 'tmux -L "$SOCK" kill-server 2>/dev/null || true; rm -rf "$WORK"' EXIT

# Isolated HOME so user skills, settings, and sessions never leak into the capture.
export HOME="$WORK/home"
mkdir -p "$HOME/.pi/agent/bin"
cp -r "$HERE/demo-project" "$HOME/demo"
(cd "$HOME/demo" && git init -q . && git add -A && git -c user.email=demo@example.com -c user.name=demo commit -qm init)
if [[ -n "${FD_BIN:-}" ]]; then cp "$FD_BIN" "$HOME/.pi/agent/bin/fd"; fi

cat >"$WORK/tmux.conf" <<'EOF'
set -g extended-keys on
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"
set -g history-limit 20000
set -g status off
EOF

ARGS=(-e "$HERE/demo-provider.ts" --provider demo --model demo-1 --tui-mode "$TUI_MODE")
if [[ -n "${THEME:-}" ]]; then ARGS+=(--use-theme "$THEME"); fi

# A clean environment: no API keys or tokens reach pi, so only the demo provider is configured.
tmux -L "$SOCK" -f "$WORK/tmux.conf" new-session -d -s "$SESSION" -x "$COLS" -y "$ROWS" -c "$HOME/demo" \
	"env -i PATH='$PATH' HOME='$HOME' TERM=tmux-256color COLORTERM=truecolor LANG=C.UTF-8 '$PI_ROOT/pi-test.sh' ${ARGS[*]}; sleep 600"

t() { tmux -L "$SOCK" "$@"; }

wait_for() {
	local needle="$1" deadline=$((SECONDS + ${2:-20}))
	until t capture-pane -t "$SESSION" -p | grep -qF -- "$needle"; do
		if ((SECONDS > deadline)); then
			echo "timeout waiting for: $needle" >&2
			t capture-pane -t "$SESSION" -p >&2
			return 1
		fi
		sleep 0.2
	done
	sleep 0.6
}

shot() {
	local name="$1"
	# -N keeps trailing cells, so full-width backgrounds are captured.
	t capture-pane -t "$SESSION" -p -e -N >"$OUT/$name.ansi"
	t capture-pane -t "$SESSION" -p >"$OUT/$name.txt"
	local cx cy
	read -r cx cy < <(t display -p -t "$SESSION" '#{cursor_x} #{cursor_y}')
	local light=()
	if [[ "${THEME:-}" == *light* ]]; then light=(--light); fi
	node "$HERE/ansi-to-png.mjs" "$OUT/$name.png" "${light[@]}" --pane "$OUT/$name.ansi" --title "$LABEL — $name" --cursor "$cx,$cy"
	echo "captured $OUT/$name"
}

wait_for "demo-1" 30
shot 01-startup

t send-keys -t "$SESSION" "range(1, 3) is missing its last value. Fix it and run the tests." Enter
wait_for "range(a, b - 1)" 30
shot 02-session

t send-keys -t "$SESSION" C-o
sleep 1
shot 03-expanded
t send-keys -t "$SESSION" C-o
sleep 0.5

t send-keys -t "$SESSION" "/"
sleep 1
shot 04-commands
t send-keys -t "$SESSION" Escape
sleep 0.3
t send-keys -t "$SESSION" C-u
sleep 0.3

t send-keys -t "$SESSION" "/settings" Enter
sleep 1.2
t send-keys -t "$SESSION" Down Down
sleep 0.5
shot 05-settings
t send-keys -t "$SESSION" Escape
sleep 0.5

t send-keys -t "$SESSION" "!git diff --stat" Enter
sleep 1.5
shot 06-bash

t send-keys -t "$SESSION" "/model" Enter
sleep 1.2
shot 07-model
t send-keys -t "$SESSION" Escape
sleep 0.5

# A slow second turn: the bash tool sleeps, so the running state is visible.
t send-keys -t "$SESSION" "Run the tests again." Enter
wait_for "sleep 4" 20
sleep 1.4
shot 08-running
wait_for "Still green" 30
shot 09-done

t send-keys -t "$SESSION" "/tree" Enter
sleep 1.2
shot 10-tree
t send-keys -t "$SESSION" Escape
sleep 0.5

if [[ "$TUI_MODE" == "regular" ]]; then
	# Whole transcript including terminal scrollback, used to compare vertical density.
	t capture-pane -t "$SESSION" -p -S - -E - >"$OUT/transcript.txt"
fi
