import type { Component, TuiMouseEvent, TuiMouseEventResult } from "@earendil-works/pi-tui";
import { stripAnsi } from "../../../utils/ansi.ts";
import { theme } from "../theme/theme.ts";

export type ToolBlockStatus = "pending" | "success" | "error";

/** Columns before the header: one column of padding, the status glyph, and a space. */
const HEADER_INDENT = 3;
/** Columns before the body: the header indent, the "⎿" gutter, and a space. */
const BODY_INDENT = 5;
/** Columns kept free on the right, matching the padding of chat messages. */
const RIGHT_MARGIN = 1;

/** The glyph before a tool block's header. Its shape carries the state, so it reads without color. */
export function toolStatusGlyph(status: ToolBlockStatus): string {
	switch (status) {
		case "pending":
			return theme.fg("dim", "○");
		case "error":
			return theme.fg("error", "✗");
		default:
			return theme.fg("success", "●");
	}
}

function isBlank(line: string): boolean {
	return stripAnsi(line).trim() === "";
}

interface PlacedChild {
	component: Component;
	/** First row of the block that shows this child. */
	row: number;
	/** Rows shown. */
	rows: number;
	/** Leading child rows that were trimmed. */
	skipped: number;
	/** Full child height and the bounds it was rendered with, for mouse events. */
	height: number;
	x: number;
	width: number;
}

/**
 * A compact tool block in the style of a terminal transcript:
 *
 *    ● read src/range.ts
 *      ⎿ first result line
 *        more result lines
 *
 * The first child is the header, which follows the status glyph; the other children form the body, which
 * hangs behind the "⎿" gutter. Blank lines around the header and the body are dropped, so renderers that
 * separate their parts with empty lines stay compact. Without a header, the body takes the header's place.
 */
export class ToolBlock implements Component {
	children: Component[] = [];
	private status: () => ToolBlockStatus;
	private placed: PlacedChild[] = [];

	constructor(status: () => ToolBlockStatus) {
		this.status = status;
	}

	setStatus(status: () => ToolBlockStatus): void {
		this.status = status;
	}

	addChild(component: Component): void {
		this.children.push(component);
	}

	removeChild(component: Component): void {
		const index = this.children.indexOf(component);
		if (index !== -1) this.children.splice(index, 1);
	}

	clear(): void {
		this.children = [];
		this.placed = [];
	}

	invalidate(): void {
		for (const child of this.children) child.invalidate?.();
	}

	render(width: number): string[] {
		this.placed = [];
		const [header, ...body] = this.children;
		const headerWidth = Math.max(1, width - HEADER_INDENT - RIGHT_MARGIN);
		const bodyWidth = Math.max(1, width - BODY_INDENT - RIGHT_MARGIN);

		const headerPart = header ? this.renderPart([header], headerWidth, HEADER_INDENT) : [];
		const bodyX = headerPart.length > 0 ? BODY_INDENT : HEADER_INDENT;
		const bodyPart = this.renderPart(body, headerPart.length > 0 ? bodyWidth : headerWidth, bodyX);

		const lines: string[] = [];
		const glyph = toolStatusGlyph(this.status());
		for (const line of headerPart) {
			lines.push(lines.length === 0 ? ` ${glyph} ${line}` : `   ${line}`);
		}
		if (headerPart.length === 0) {
			for (const line of bodyPart) {
				lines.push(lines.length === 0 ? ` ${glyph} ${line}` : `   ${line}`);
			}
		} else {
			const gutter = theme.fg("dim", "⎿");
			for (let index = 0; index < bodyPart.length; index++) {
				lines.push(index === 0 ? `   ${gutter} ${bodyPart[index]}` : `     ${bodyPart[index]}`);
			}
		}

		// Children were placed in output order: header rows first, then body rows.
		let row = 0;
		for (const child of this.placed) {
			child.row = row;
			row += child.rows;
		}
		return lines;
	}

	/**
	 * Render children one below the other and drop the blank lines before the first and after the last
	 * visible line. Records where each child ends up for mouse dispatch.
	 */
	private renderPart(children: Component[], width: number, x: number): string[] {
		const rendered = children.map((component) => ({ component, lines: component.render(width) }));
		const all = rendered.flatMap((entry) => entry.lines);
		let start = 0;
		while (start < all.length && isBlank(all[start])) start++;
		let end = all.length;
		while (end > start && isBlank(all[end - 1])) end--;

		let offset = 0;
		for (const { component, lines } of rendered) {
			const first = Math.max(start, offset);
			const last = Math.min(end, offset + lines.length);
			if (last > first) {
				this.placed.push({
					component,
					row: 0,
					rows: last - first,
					skipped: first - offset,
					height: lines.length,
					x,
					width,
				});
			}
			offset += lines.length;
		}
		return all.slice(start, end);
	}

	handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
		for (const child of this.placed) {
			if (event.y < child.row || event.y >= child.row + child.rows) continue;
			// The glyph and gutter columns belong to the row's child, so the whole row stays clickable.
			return child.component.handleMouse?.({
				...event,
				x: Math.max(0, event.x - child.x),
				y: event.y - child.row + child.skipped,
				width: child.width,
				height: child.height,
			});
		}
		return undefined;
	}
}
