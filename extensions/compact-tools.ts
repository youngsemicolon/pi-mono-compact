/**
 * Compact tool blocks for Pi's built-in tools.
 *
 * Re-registers read, bash, edit, write, grep, find, and ls with Pi's own definitions, so the tools behave
 * exactly as before, and only changes how their calls are framed in the transcript:
 *
 *    ● read src/range.ts
 *    ● $ npm test
 *      ⎿ first result line
 *        more result lines
 *
 * The glyph carries the state without color: ○ running, ● done, ✗ failed. The padded, colored panel and
 * the blank lines inside it are gone. Pi's renderers still produce the content, so previews, diffs,
 * truncation notices, and expansion (ctrl+o or click) keep working.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createBashToolDefinition,
	createEditToolDefinition,
	createFindToolDefinition,
	createGrepToolDefinition,
	createLsToolDefinition,
	createReadToolDefinition,
	createWriteToolDefinition,
	type ExtensionAPI,
	type Theme,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

/** The context Pi passes to tool renderers. */
type RenderContext = Parameters<NonNullable<ToolDefinition["renderCall"]>>[2];

/** Columns before the header: padding, the status glyph, and a space. */
const HEADER_INDENT = 3;
/** Columns before the result: the header indent, the "⎿" gutter, and a space. */
const BODY_INDENT = 5;
/** Columns kept free on the right, matching the padding of chat messages. */
const RIGHT_MARGIN = 1;

const ANSI_PATTERN = /\x1b\[[0-9;:]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;

function isBlank(line: string): boolean {
	return line.replace(ANSI_PATTERN, "").trim() === "";
}

function trimBlankLines(lines: string[]): string[] {
	let start = 0;
	while (start < lines.length && isBlank(lines[start])) start++;
	let end = lines.length;
	while (end > start && isBlank(lines[end - 1])) end--;
	return lines.slice(start, end);
}

/**
 * Render a renderer's component without its frame. Containers and boxes (Pi's edit preview is a padded
 * box) render child by child, so their padding, background, and separating spacers drop out.
 */
function renderContent(component: Component, width: number): string[] {
	const children = (component as { children?: unknown }).children;
	if (Array.isArray(children)) {
		return trimBlankLines((children as Component[]).flatMap((child) => trimBlankLines(child.render(width))));
	}
	return trimBlankLines(component.render(width));
}

/** Wraps a renderer's component and hangs its lines behind a prefix: a glyph or the result gutter. */
class Hanging implements Component {
	readonly inner: Component;
	private readonly first: string;
	private readonly indent: number;
	private readonly tightHeader: boolean;

	constructor(inner: Component, first: string, indent: number, tightHeader: boolean) {
		this.inner = inner;
		this.first = first;
		this.indent = indent;
		this.tightHeader = tightHeader;
	}

	render(width: number): string[] {
		let lines = renderContent(this.inner, Math.max(1, width - this.indent - RIGHT_MARGIN));
		// A call's first line is its header; content it shows below (e.g. write's file preview) follows directly.
		if (this.tightHeader) lines = [...lines.slice(0, 1), ...trimBlankLines(lines.slice(1))];
		const rest = " ".repeat(this.indent);
		return lines.map((line, index) => (index === 0 ? this.first : rest) + line);
	}

	invalidate(): void {
		this.inner.invalidate?.();
	}
}

function statusGlyph(theme: Theme, context: RenderContext): string {
	if (context.isError) return theme.fg("error", "✗");
	if (context.isPartial) return theme.fg("dim", "○");
	return theme.fg("success", "●");
}

/** The renderer's previous component, unwrapped, so Pi's renderers can update it in place. */
function unwrap(context: RenderContext): RenderContext {
	const last = context.lastComponent;
	return { ...context, lastComponent: last instanceof Hanging ? last.inner : last };
}

// Tool definitions are generic over their own parameter schemas.
function compact(definition: ToolDefinition<any, any, any>): ToolDefinition<any, any, any> {
	const { renderCall, renderResult } = definition;
	return {
		...definition,
		// Re-registering a tool would activate it. Keep Pi's active set: a tool stays active only where the
		// user's --tools or defaultTools setting names it.
		defaultActive: false,
		renderShell: "self",
		renderCall: renderCall
			? (args, theme, context) =>
					new Hanging(
						renderCall(args, theme, unwrap(context)),
						` ${statusGlyph(theme, context)} `,
						HEADER_INDENT,
						true,
					)
			: undefined,
		renderResult: renderResult
			? (result, options, theme, context) =>
					new Hanging(
						renderResult(result, options, theme, unwrap(context)),
						`   ${theme.fg("dim", "⎿")} `,
						BODY_INDENT,
						false,
					)
			: undefined,
	};
}

/** Pi's normalization of the `shellPath` setting: `~` and `file://` paths, and MSYS paths on Windows. */
function normalizeShellPath(shellPath: string | undefined): string | undefined {
	if (!shellPath) return shellPath;
	let value = shellPath;
	if (process.platform === "win32" && value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
		const match = value.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
		if (match) value = `${match[1].toUpperCase()}:\\${match[2]?.replaceAll("/", "\\") ?? ""}`;
	}
	if (value === "~") return homedir();
	if (value.startsWith("~/") || (process.platform === "win32" && value.startsWith("~\\"))) {
		return join(homedir(), value.slice(2));
	}
	return value.startsWith("file://") ? fileURLToPath(value) : value;
}

/**
 * A tool whose behavior depends on settings. Settings can only be read once Pi has finished loading
 * extensions, but tools must be registered while loading, so each call builds the definition with the
 * current settings. The settings do not change the name, schema, or description the model sees.
 */
function withSettings<T extends ToolDefinition<any, any, any>>(base: T, create: () => T): T {
	return {
		...base,
		execute: (toolCallId, params, signal, onUpdate, ctx) =>
			create().execute(toolCallId, params, signal, onUpdate, ctx),
	};
}

export default function (pi: ExtensionAPI) {
	// Built the way Pi builds its own tools. Tools resolve paths against the session's working directory
	// at run time, so the load-time directory only serves as a fallback.
	const cwd = process.cwd();
	const definitions = [
		withSettings(createReadToolDefinition(cwd), () =>
			createReadToolDefinition(cwd, { autoResizeImages: pi.getSettings().images?.autoResize ?? true }),
		),
		withSettings(createBashToolDefinition(cwd), () => {
			const settings = pi.getSettings();
			return createBashToolDefinition(cwd, {
				commandPrefix: settings.shellCommandPrefix,
				shellPath: normalizeShellPath(settings.shellPath),
			});
		}),
		createEditToolDefinition(cwd),
		createWriteToolDefinition(cwd),
		createGrepToolDefinition(cwd),
		createFindToolDefinition(cwd),
		createLsToolDefinition(cwd),
	];
	for (const definition of definitions) pi.registerTool(compact(definition));
}
