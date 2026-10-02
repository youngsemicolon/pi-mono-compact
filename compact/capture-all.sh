#!/usr/bin/env bash
# Captures the before/after evidence set: the same scripted session in an upstream pi checkout
# and in this fork, in dark and light themes, at a regular and a tall terminal size, plus
# regular-mode transcripts for counting lines. See compact/README.md.
#
# Usage: compact/capture-all.sh <upstream-pi-checkout> <out-dir>
set -euo pipefail

UPSTREAM="$(cd "$1" && pwd)"
OUT="$2"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FORK="$(cd "$HERE/.." && pwd)"
mkdir -p "$OUT"

run() {
	local name="$1"
	shift
	if ! env "$@" >"$OUT/$name.log" 2>&1; then
		echo "capture $name failed, see $OUT/$name.log" >&2
		return 1
	fi
	echo "captured $name"
}

pids=()
run before env "$HERE/capture.sh" "$UPSTREAM" "$OUT/before" "pi (upstream)" & pids+=($!)
run after env "$HERE/capture.sh" "$FORK" "$OUT/after" "pi-mono-compact" & pids+=($!)
run before-light env THEME=light "$HERE/capture.sh" "$UPSTREAM" "$OUT/before-light" "pi (upstream), light" & pids+=($!)
run after-light env THEME=mono-light "$HERE/capture.sh" "$FORK" "$OUT/after-light" "pi-mono-compact, mono-light" & pids+=($!)
for pid in "${pids[@]}"; do wait "$pid"; done

pids=()
run before-tall env ROWS=62 "$HERE/capture.sh" "$UPSTREAM" "$OUT/before-tall" "pi (upstream)" & pids+=($!)
run after-tall env ROWS=62 "$HERE/capture.sh" "$FORK" "$OUT/after-tall" "pi-mono-compact" & pids+=($!)
run before-regular env TUI_MODE=regular "$HERE/capture.sh" "$UPSTREAM" "$OUT/before-regular" "pi (upstream)" & pids+=($!)
run after-regular env TUI_MODE=regular "$HERE/capture.sh" "$FORK" "$OUT/after-regular" "pi-mono-compact" & pids+=($!)
for pid in "${pids[@]}"; do wait "$pid"; done

# Side-by-side comparisons. `variant` selects the capture set, e.g. "-tall".
compare() {
	local name="$1" scene="$2"
	shift 2
	node "$HERE/ansi-to-png.mjs" "$OUT/compare-$name.png" "$@" \
		--pane "$OUT/before${variant}/$scene.ansi" --title "before: pi (upstream)" \
		--pane "$OUT/after${variant}/$scene.ansi" --title "after: pi-mono-compact"
	echo "compared $name"
}
variant="-tall" compare session 09-done
variant="" compare startup 01-startup
variant="" compare settings 05-settings
variant="" compare running 08-running
variant="-light" compare light 02-session --light

# Line counts of the whole session transcript (regular mode keeps it in scrollback), up to the
# last non-blank line, i.e. including the editor and footer.
count() { awk 'NF { last = NR } END { print last }' "$1"; }
{
	echo "transcript lines (100 columns, same scripted session):"
	echo "  before: $(count "$OUT/before-regular/transcript.txt")"
	echo "  after:  $(count "$OUT/after-regular/transcript.txt")"
} | tee "$OUT/line-counts.txt"
