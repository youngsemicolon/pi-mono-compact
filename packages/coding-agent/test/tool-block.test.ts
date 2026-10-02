import { MouseRegion, Text, type TuiMouseEvent, visibleWidth } from "@earendil-works/pi-tui";
import { beforeAll, describe, expect, test } from "vitest";
import { BashExecutionComponent } from "../src/modes/interactive/components/bash-execution.ts";
import { ToolBlock, type ToolBlockStatus } from "../src/modes/interactive/components/tool-block.ts";
import { initTheme } from "../src/modes/interactive/theme/theme.ts";
import { stripAnsi } from "../src/utils/ansi.ts";

/** Visible text of rendered lines, without the padding that Text adds up to the width. */
const plain = (lines: string[]) => lines.map((line) => stripAnsi(line).trimEnd());

function click(x: number, y: number, width: number, height: number): TuiMouseEvent {
	return {
		type: "click",
		button: "left",
		x,
		y,
		screenX: x,
		screenY: y,
		width,
		height,
		shift: false,
		alt: false,
		ctrl: false,
		clickCount: 1,
	};
}

describe("ToolBlock", () => {
	beforeAll(() => {
		initTheme("mono-dark");
	});

	test("shows the status as a glyph shape and hangs the body behind a gutter", () => {
		let status: ToolBlockStatus = "pending";
		const block = new ToolBlock(() => status);
		block.addChild(new Text("read notes.txt", 0, 0));
		block.addChild(new Text("one\ntwo", 0, 0));

		expect(plain(block.render(40))).toEqual([" ○ read notes.txt", "   ⎿ one", "     two"]);
		status = "success";
		expect(plain(block.render(40))[0]).toBe(" ● read notes.txt");
		status = "error";
		expect(plain(block.render(40))[0]).toBe(" ✗ read notes.txt");
	});

	test("drops blank lines around the header and the body but keeps inner ones", () => {
		const block = new ToolBlock(() => "success");
		block.addChild(new Text("\nheader\n", 0, 0));
		block.addChild(new Text("\n\nfirst", 0, 0));
		block.addChild(new Text("\nlast\n\n", 0, 0));

		expect(plain(block.render(40))).toEqual([" ● header", "   ⎿ first", "", "     last"]);
	});

	test("puts the glyph on the body when the header is empty", () => {
		const block = new ToolBlock(() => "success");
		block.addChild(new Text("", 0, 0));
		block.addChild(new Text("only body", 0, 0));

		expect(plain(block.render(40))).toEqual([" ● only body"]);
	});

	test("keeps every line within the width", () => {
		const block = new ToolBlock(() => "success");
		block.addChild(new Text("h".repeat(100), 0, 0));
		block.addChild(new Text("b".repeat(100), 0, 0));

		for (const line of block.render(30)) expect(visibleWidth(line)).toBeLessThanOrEqual(30);
	});

	test("routes clicks to the child under the row, including the glyph and gutter columns", () => {
		const clicks: Array<{ child: string; x: number; y: number }> = [];
		const region = (name: string, text: string) =>
			new MouseRegion(new Text(text, 0, 0), (event) => {
				clicks.push({ child: name, x: event.x, y: event.y });
				return { handled: true };
			});
		const block = new ToolBlock(() => "success");
		block.addChild(region("header", "header"));
		block.addChild(region("body", "\nfirst\nsecond"));
		const lines = block.render(40);

		expect(block.handleMouse(click(1, 0, 40, lines.length))?.handled).toBe(true);
		expect(block.handleMouse(click(7, 2, 40, lines.length))?.handled).toBe(true);
		// Row 2 shows the body's third line: its first line was blank and trimmed.
		expect(clicks).toEqual([
			{ child: "header", x: 0, y: 0 },
			{ child: "body", x: 2, y: 2 },
		]);
	});
});

describe("BashExecutionComponent", () => {
	beforeAll(() => {
		initTheme("mono-dark");
	});

	test("renders the command as typed with its output in the gutter, without borders", () => {
		const ui = { requestRender: () => {} } as never;
		const component = new BashExecutionComponent("git status", ui);
		component.appendOutput("clean\n");
		component.setComplete(0, false);

		const lines = plain(component.render(40));
		expect(lines).toEqual(["", " ● ! git status", "   ⎿ clean"]);
	});

	test("marks failed and context-excluded commands", () => {
		const ui = { requestRender: () => {} } as never;
		const component = new BashExecutionComponent("false", ui, true);
		component.setComplete(1, false);

		const lines = plain(component.render(40));
		expect(lines).toEqual(["", " ✗ !! false", "   ⎿ (exit 1)"]);
	});
});
