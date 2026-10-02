/**
 * Deterministic demo provider used to capture before/after screenshots of the TUI.
 *
 * Registers provider "demo" with model "demo-1". Prompts play scripted turns; tool calls run
 * for real against the current working directory (see compact/demo-project):
 *
 * - a prompt mentioning "again" re-runs the tests slowly, so the running state can be captured;
 * - any other prompt fixes the bug: thinking, a read, an edit, a bash call, and a markdown summary.
 *
 * Usage: pi -e compact/demo-provider.ts --provider demo --model demo-1
 */

import {
	type AssistantMessage,
	fauxAssistantMessage,
	fauxProvider,
	fauxText,
	fauxThinking,
	fauxToolCall,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SUMMARY = `Fixed the off-by-one in \`range()\`: the loop used \`<\` against an inclusive \`end\`, so the last value was dropped.

## Changes
- \`src/range.ts\`: loop condition is now \`i <= end\`
- Added a guard for \`step <= 0\` to avoid an infinite loop

All **3 tests** pass now:

\`\`\`ts
range(1, 3); // [1, 2, 3]
range(0, 10, 5); // [0, 5, 10]
\`\`\`

> Note: callers relying on the old exclusive behaviour should switch to \`range(a, b - 1)\`.`;

interface DemoMessage {
	role: string;
	content?: unknown;
}

function stepsSinceLastUser(messages: readonly DemoMessage[]): number {
	let count = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const role = messages[i].role;
		if (role === "user") break;
		if (role === "assistant") count++;
	}
	return count;
}

function lastUserText(messages: readonly DemoMessage[]): string {
	const last = [...messages].reverse().find((message) => message.role === "user");
	if (!last) return "";
	if (typeof last.content === "string") return last.content;
	if (!Array.isArray(last.content)) return "";
	return last.content.map((block: { text?: string }) => block.text ?? "").join("");
}

function fixTurn(step: number): AssistantMessage {
	switch (step) {
		case 0:
			return fauxAssistantMessage(
				[
					fauxThinking(
						"The user reports that range() drops its last element. I should read the implementation before changing anything.",
					),
					fauxText("I'll start by reading the range helper."),
					fauxToolCall("read", { path: "src/range.ts" }),
				],
				{ stopReason: "toolUse" },
			);
		case 1:
			return fauxAssistantMessage(
				[
					fauxText("The loop uses `<` while `end` is inclusive. Fixing the condition and guarding `step`."),
					fauxToolCall("edit", {
						path: "src/range.ts",
						edits: [
							{
								oldText:
									"export function range(start: number, end: number, step = 1): number[] {\n\tconst out: number[] = [];\n\tfor (let i = start; i < end; i += step) {",
								newText:
									'export function range(start: number, end: number, step = 1): number[] {\n\tif (step <= 0) throw new Error("step must be positive");\n\tconst out: number[] = [];\n\tfor (let i = start; i <= end; i += step) {',
							},
						],
					}),
				],
				{ stopReason: "toolUse" },
			);
		case 2:
			return fauxAssistantMessage([fauxToolCall("bash", { command: "node --test --test-reporter=spec" })], {
				stopReason: "toolUse",
			});
		default:
			return fauxAssistantMessage(SUMMARY);
	}
}

function rerunTurn(step: number): AssistantMessage {
	if (step === 0) {
		return fauxAssistantMessage(
			[
				fauxText("Re-running the suite with a short warm-up."),
				fauxToolCall("bash", { command: "sleep 4 && node --test --test-reporter=dot" }),
			],
			{ stopReason: "toolUse" },
		);
	}
	return fauxAssistantMessage("Still green: **3/3** tests pass.");
}

export default function (pi: ExtensionAPI) {
	const faux = fauxProvider({
		provider: "demo",
		models: [{ id: "demo-1", name: "Demo Model", reasoning: true, contextWindow: 200000, maxTokens: 32000 }],
		tokensPerSecond: 600,
	});
	const respond = (context: { messages: readonly DemoMessage[] }) => {
		const step = stepsSinceLastUser(context.messages);
		return /\bagain\b/i.test(lastUserText(context.messages)) ? rerunTurn(step) : fixTurn(step);
	};
	faux.setResponses(Array.from({ length: 200 }, () => respond));
	pi.registerProvider(faux.provider);
}
