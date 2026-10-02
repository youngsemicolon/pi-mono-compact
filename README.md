# pi-mono-compact (Pi package)

Monochrome themes and compact tool blocks for the [Pi coding agent](https://github.com/earendil-works/pi).
This is the installable part of [pi-mono-compact](https://github.com/youngsemicolon/pi-mono-compact); it works
with stock Pi (tested with 1.0.0).

## Install

```bash
pi install git:github.com/youngsemicolon/pi-mono-compact@pi-package
```

Then start Pi, or run `/reload` in a session that is already open. There is nothing else to configure.

Remove it with:

```bash
pi remove git:github.com/youngsemicolon/pi-mono-compact
```

## What it does

- **Monochrome theme.** Adds `mono-dark` and `mono-light`, and switches to the one matching the light or dark
  appearance of your current theme whenever Pi starts or reloads. Your saved `theme` setting is not changed. To
  keep a mono theme permanently, pick it in `/settings` → Theme.
- **Compact tool blocks.** Pi's built-in tools (read, bash, edit, write, grep, find, ls) render as one header
  line with a status glyph (`○` running, `●` done, `✗` failed) and their output behind a `⎿` gutter, instead
  of a padded, colored panel. The tools themselves are Pi's own definitions built with your settings, so they
  behave the same, and the set of tools the model can use does not change.

To use only one of the two, disable the other extension (`mono-theme.ts` or `compact-tools.ts`) with `pi config`.

The full fork additionally removes padding from prompts, dialogs, `!` commands, the startup header, and the
footer, which an extension cannot change.

## License

MIT, like Pi. See [LICENSE](LICENSE).
