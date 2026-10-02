/**
 * Monochrome theme for Pi.
 *
 * When Pi starts or reloads, switches to the package's `mono-dark` or `mono-light` theme, matching the
 * light or dark appearance of the theme Pi was using. The switch lasts for the session only: the saved
 * `theme` setting is not changed, so removing or disabling the package restores the previous look.
 * Choosing `mono-dark` or `mono-light` in /settings saves it permanently.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const MONO_THEMES = new Set(["mono-dark", "mono-light"]);

/**
 * Checks after session_start. On /reload, Pi registers the package's themes and re-applies the saved
 * theme only after session_start, so the theme is applied again if that replaced it.
 */
const CHECK_DELAYS_MS = [0, 100, 500, 1500];

export default function (pi: ExtensionAPI) {
	let started = false;
	const timers: NodeJS.Timeout[] = [];

	const apply = (ctx: ExtensionContext) => {
		const current = ctx.ui.theme;
		if (current.name && MONO_THEMES.has(current.name)) return;
		const mono = ctx.ui.getTheme(current.appearance === "light" ? "mono-light" : "mono-dark");
		// A Theme object applies for this session only; a theme name would be saved to settings.
		if (mono) ctx.ui.setTheme(mono);
	};

	pi.on("session_start", (_event, ctx) => {
		// Only once per load, so a theme picked during the session survives /new and /resume.
		if (started || ctx.mode !== "tui") return;
		started = true;
		for (const delay of CHECK_DELAYS_MS) timers.push(setTimeout(() => apply(ctx), delay));
	});

	pi.on("session_shutdown", () => {
		for (const timer of timers) clearTimeout(timer);
		timers.length = 0;
	});
}
