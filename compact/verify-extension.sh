#!/usr/bin/env bash
# Verifies the pi-mono-compact package in a clean Pi setup: an isolated HOME with no settings,
# credentials, or packages, and a clean environment. Installs the package with `pi install`, runs a
# scripted session with the provider-free demo model, checks the result, and removes the package.
#
# Usage: compact/verify-extension.sh <pi-executable> <install-source> <out-dir>
#   e.g. compact/verify-extension.sh "$(command -v pi)" git:github.com/youngsemicolon/pi-mono-compact@pi-package /tmp/verify
# Env:   FD_BIN, PLAYWRIGHT_CORE, CHROMIUM   as for compact/capture.sh
set -euo pipefail

PI_BIN="$1"
SOURCE="$2"
OUT="$3"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOCK="pi-verify-$$"
mkdir -p "$OUT"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/pi-verify-XXXXXX")"
trap 'tmux -L "$SOCK" kill-server 2>/dev/null || true; rm -rf "$WORK"' EXIT

export HOME="$WORK/home"
mkdir -p "$HOME/.pi/agent/bin"
cp -r "$HERE/demo-project" "$HOME/demo"
(cd "$HOME/demo" && git init -q . && git add -A && git -c user.email=demo@example.com -c user.name=demo commit -qm init)
if [[ -n "${FD_BIN:-}" ]]; then cp "$FD_BIN" "$HOME/.pi/agent/bin/fd"; fi
CLEAN_ENV=(env -i "PATH=$PATH" "HOME=$HOME" TERM=tmux-256color COLORTERM=truecolor LANG=C.UTF-8)

pass=0
fail=0
check() {
	if eval "$2"; then
		echo "PASS  $1"
		pass=$((pass + 1))
	else
		echo "FAIL  $1"
		fail=$((fail + 1))
	fi
}

echo "pi: $("${CLEAN_ENV[@]}" "$PI_BIN" --version)"
echo "\$ pi install $SOURCE"
started=$SECONDS
(cd "$HOME/demo" && "${CLEAN_ENV[@]}" "$PI_BIN" install "$SOURCE") 2>&1 | tee "$OUT/install.txt"
echo "install took $((SECONDS - started))s" | tee -a "$OUT/install.txt"
"${CLEAN_ENV[@]}" "$PI_BIN" list 2>&1 | tee "$OUT/list.txt"
cp "$HOME/.pi/agent/settings.json" "$OUT/settings-after-install.json"
check "pi list shows the package" 'grep -q "pi-mono-compact" "$OUT/list.txt"'

cat >"$WORK/tmux.conf" <<'EOF'
set -g extended-keys on
set -g default-terminal "tmux-256color"
set -as terminal-features ",*:RGB"
set -g status off
EOF
tmux -L "$SOCK" -f "$WORK/tmux.conf" new-session -d -s v -x 100 -y 60 -c "$HOME/demo" \
	"${CLEAN_ENV[*]} '$PI_BIN' -e '$HERE/demo-provider.ts' --provider demo --model demo-1; sleep 600"
t() { tmux -L "$SOCK" "$@"; }
wait_for() {
	local deadline=$((SECONDS + ${2:-30}))
	until t capture-pane -t v -p | grep -qF -- "$1"; do
		if ((SECONDS > deadline)); then
			t capture-pane -t v -p >&2
			return 1
		fi
		sleep 0.2
	done
	sleep 0.6
}
shot() {
	t capture-pane -t v -p -e -N >"$OUT/$1.ansi"
	t capture-pane -t v -p >"$OUT/$1.txt"
	node "$HERE/ansi-to-png.mjs" "$OUT/$1.png" --pane "$OUT/$1.ansi" --title "stock pi + pi-mono-compact package — $1"
}

wait_for "demo-1"
shot startup
t send-keys -t v "range(1, 3) is missing its last value. Fix it and run the tests." Enter
wait_for "range(a, b - 1)"
shot session
t send-keys -t v "Run the tests again." Enter
wait_for "sleep 4"
sleep 1.2
shot running
wait_for "Still green"
t send-keys -t v C-d
sleep 1

check "loaded resources list the package's extensions" 'grep -q "mono-theme.ts\|compact-tools.ts\|pi-mono-compact" "$OUT/startup.txt"'
check "tool calls render as compact blocks" 'grep -q "^ ● read src/range.ts" "$OUT/session.txt" && grep -q "^ ● edit src/range.ts" "$OUT/session.txt" && grep -q "^   ⎿ " "$OUT/session.txt"'
check "running tool shows the pending glyph" 'grep -q "^ ○ \$ sleep 4" "$OUT/running.txt"'
check "the edit diff and test output are shown" 'grep -q "+ 3" "$OUT/session.txt" && grep -q "Took" "$OUT/session.txt"'
# Monochrome: every 24-bit color outside the logo (first two rows) is a gray.
check "theme is monochrome" '! tail -n +3 "$OUT/session.ansi" | grep -oE "\[(38|48);2;[0-9]+;[0-9]+;[0-9]+m" | awk -F"[;m]" "{ if (\$3 != \$4 || \$4 != \$5) bad = 1 } END { exit !bad }"'
check "saved theme setting unchanged" '! grep -q "\"theme\"" "$HOME/.pi/agent/settings.json"'
session_file="$(find "$HOME/.pi/agent/sessions" -name "*.jsonl" | head -1)"
node -e '
	const lines = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
	const system = lines.find((entry) => entry.type === "message" && entry.message.role === "system");
	console.log((system?.message.toolsAdded ?? []).map((tool) => tool.name).sort().join(","));
' "$session_file" >"$OUT/active-tools.txt"
check "model sees the default tools only (bash,edit,read,write)" '[[ "$(cat "$OUT/active-tools.txt")" == "bash,edit,read,write" ]]'

echo "\$ pi remove ${SOURCE%@*}"
"${CLEAN_ENV[@]}" "$PI_BIN" remove "${SOURCE%@*}" 2>&1 | tee "$OUT/remove.txt"
"${CLEAN_ENV[@]}" "$PI_BIN" list 2>&1 | tee "$OUT/list-after-remove.txt"
check "pi remove uninstalls the package" '! grep -q "pi-mono-compact" "$OUT/list-after-remove.txt"'

echo "$pass passed, $fail failed" | tee "$OUT/result.txt"
((fail == 0))
