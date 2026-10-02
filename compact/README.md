# compact/: before/after verification tooling

Scripts that drive the same scripted pi session in an upstream checkout and in this fork, and
render the terminal to PNG. No model provider, API key, or network access is needed for the
session itself: `demo-provider.ts` is an extension that registers a deterministic provider
(`demo/demo-1`) built on pi-ai's faux provider.

| File | Purpose |
|---|---|
| `demo-provider.ts` | Scripted provider. A prompt fixes an off-by-one bug in `demo-project` (thinking, `read`, `edit`, `bash`, markdown summary); a prompt containing "again" re-runs the tests slowly so the running state can be captured. Tools run for real. |
| `demo-project/` | Fixture project with the bug. Copied into a temporary `HOME` for every run. |
| `capture.sh` | Runs one session in an isolated tmux server and `HOME` with a clean environment, and captures each scene as `.ansi`, `.txt`, and `.png`. |
| `capture-all.sh` | Runs `capture.sh` for upstream and the fork (dark, light, tall, regular mode), renders side-by-side comparisons, and counts transcript lines. |
| `verify-extension.sh` | Installs the Pi package with `pi install` into a clean, isolated Pi setup, runs a scripted session, checks the result (compact blocks, monochrome theme, unchanged tool set and saved settings), and removes it again. |
| `capture-header.sh` | Captures the startup header of several pi commands (e.g. an older release and this fork) in isolated, clean setups and stacks them into one image. |
| `ansi-to-png.mjs` | Renders `tmux capture-pane -e` output to HTML and, with playwright-core, to PNG. |
| `assets/` | Monochrome versions of the README logo (`https://pi.dev/logo-auto.svg`): identical paths, gray fills. `pi-logo-mono-dark.svg` and `pi-logo-mono-light.svg` are picked by GitHub's color scheme; `pi-logo-mono.svg` is the fallback and keeps at least 3:1 contrast on white and on GitHub's dark background. |
| `screenshots/` | The committed evidence set. |

## Reproduce

```bash
# Build an upstream checkout to compare against
git clone https://github.com/earendil-works/pi /tmp/pi-upstream
(cd /tmp/pi-upstream && npm install --ignore-scripts && npm run build)

# Build this fork
npm install --ignore-scripts && npm run build

# Optional: PNG output needs playwright-core and a Chromium binary
export PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core
export CHROMIUM=/path/to/chrome-headless-shell
# Optional: an fd binary avoids the "fd not found. Downloading..." notice in the capture
export FD_BIN=$(command -v fd)

compact/capture-all.sh /tmp/pi-upstream /tmp/pi-compact-evidence
```

Single session, for example the light theme in a 120x40 terminal:

```bash
COLS=120 ROWS=40 THEME=mono-light compact/capture.sh . /tmp/out "pi-mono-compact"
```

To verify the Pi package against stock Pi in a clean setup:

```bash
npm install -g --prefix /tmp/stock-pi @earendil-works/pi-coding-agent
compact/verify-extension.sh /tmp/stock-pi/bin/pi git:github.com/youngsemicolon/pi-mono-compact@pi-package /tmp/verify
```

To try the demo interactively: `./pi-test.sh -e compact/demo-provider.ts --provider demo --model demo-1`
from a copy of `compact/demo-project`.
