#!/usr/bin/env node
// Renders `tmux capture-pane -e -p` dumps (ANSI SGR) to HTML and, when playwright-core is
// resolvable, to PNG via headless Chromium. Several panes render side by side.
//
// Usage: node ansi-to-png.mjs <output.png> [--light] (--pane <input.ansi> [--title T] [--cursor X,Y])...
// Env:   PLAYWRIGHT_CORE (path to playwright-core), CHROMIUM (executable path)

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const output = args[0];
const light = args.includes("--light");
const panes = [];
for (let i = 1; i < args.length; i++) {
	if (args[i] === "--pane") panes.push({ input: args[++i], title: "", cursor: undefined });
	else if (args[i] === "--title") panes.at(-1).title = args[++i];
	else if (args[i] === "--cursor") panes.at(-1).cursor = args[++i].split(",").map(Number);
}

const DEFAULT_FG = light ? "#1f1f1f" : "#d4d4d4";
const DEFAULT_BG = light ? "#fafafa" : "#161616";
const BASE16 = light
	? ["#000000", "#c4372d", "#2e8a3c", "#a07400", "#2f5fcc", "#9b3fb0", "#1f8a9c", "#bfbfbf", "#666666", "#e05a50", "#3fa84f", "#c99700", "#4a7af0", "#b65ccb", "#2aa7bb", "#ffffff"]
	: ["#000000", "#e06c6c", "#7fc27f", "#e0c070", "#6f9be8", "#c886d8", "#5fc0cf", "#c8c8c8", "#6b6b6b", "#ff8a8a", "#9de09d", "#ffe08a", "#8fb6ff", "#e3a6f0", "#84dbe8", "#ffffff"];

const rgb = (r, g, b) => `rgb(${r},${g},${b})`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function xterm256(n) {
	if (n < 16) return BASE16[n];
	if (n < 232) {
		const v = [0, 95, 135, 175, 215, 255];
		const i = n - 16;
		return rgb(v[Math.floor(i / 36)], v[Math.floor(i / 6) % 6], v[i % 6]);
	}
	const g = 8 + (n - 232) * 10;
	return rgb(g, g, g);
}

const plain = () => ({ fg: undefined, bg: undefined, bold: false, dim: false, italic: false, underline: false, inverse: false, strike: false });

function renderLine(line) {
	let st = plain();
	let html = "";
	let buf = "";
	const flush = () => {
		if (!buf) return;
		let fg = st.fg ?? DEFAULT_FG;
		let bg = st.bg;
		if (st.inverse) [fg, bg] = [bg ?? DEFAULT_BG, fg];
		const css = [`color:${fg}`];
		if (bg) css.push(`background:${bg}`);
		if (st.bold) css.push("font-weight:700");
		if (st.dim) css.push("opacity:.6");
		if (st.italic) css.push("font-style:italic");
		const deco = [st.underline && "underline", st.strike && "line-through"].filter(Boolean);
		if (deco.length) css.push(`text-decoration:${deco.join(" ")}`);
		html += `<span style="${css.join(";")}">${esc(buf)}</span>`;
		buf = "";
	};
	// Strip OSC sequences (hyperlinks, shell-integration marks); only SGR is rendered.
	line = line.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "");
	const re = /\x1b\[([0-9;:]*)([A-Za-z])/g;
	let last = 0;
	for (let m = re.exec(line); m; m = re.exec(line)) {
		buf += line.slice(last, m.index);
		last = re.lastIndex;
		if (m[2] !== "m") continue;
		flush();
		const p = m[1] === "" ? [0] : m[1].split(/[;:]/).map((x) => Number(x || 0));
		for (let i = 0; i < p.length; i++) {
			const c = p[i];
			if (c === 0) st = plain();
			else if (c === 1) st.bold = true;
			else if (c === 2) st.dim = true;
			else if (c === 3) st.italic = true;
			else if (c === 4) st.underline = true;
			else if (c === 7) st.inverse = true;
			else if (c === 9) st.strike = true;
			else if (c === 22) st.bold = st.dim = false;
			else if (c === 23) st.italic = false;
			else if (c === 24) st.underline = false;
			else if (c === 27) st.inverse = false;
			else if (c === 29) st.strike = false;
			else if (c >= 30 && c <= 37) st.fg = BASE16[c - 30];
			else if (c >= 90 && c <= 97) st.fg = BASE16[c - 90 + 8];
			else if (c >= 40 && c <= 47) st.bg = BASE16[c - 40];
			else if (c >= 100 && c <= 107) st.bg = BASE16[c - 100 + 8];
			else if (c === 39) st.fg = undefined;
			else if (c === 49) st.bg = undefined;
			else if (c === 38 || c === 48) {
				let color;
				if (p[i + 1] === 5) {
					color = xterm256(p[i + 2]);
					i += 2;
				} else if (p[i + 1] === 2) {
					color = rgb(p[i + 2], p[i + 3], p[i + 4]);
					i += 4;
				}
				if (c === 38) st.fg = color;
				else st.bg = color;
			}
		}
	}
	buf += line.slice(last);
	flush();
	return html;
}

function renderPane({ input, title, cursor }) {
	const lines = readFileSync(input, "utf8").replace(/\n$/, "").split("\n");
	const width = (l) => [...l.replace(/\x1b\[[0-9;:]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "")].length;
	const cols = Math.max(...lines.map(width), 80);
	const rows = lines.map((l) => `<div class="row">${renderLine(l) || " "}</div>`).join("");
	const cursorEl = cursor
		? `<div class="cursor" style="left:calc(${cursor[0]}ch + 14px);top:calc(${cursor[1]} * var(--lh) + 14px)"></div>`
		: "";
	return `<div class="win"><div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="ttl">${esc(title)}</span></div><div class="term" style="width:${cols}ch">${rows}${cursorEl}</div></div>`;
}

const chrome = light ? "#e6e6e6" : "#2a2a2a";
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--lh:19px}
body{margin:0;background:${light ? "#d0d0d0" : "#0b0b0b"};padding:18px;display:inline-flex;gap:18px;align-items:flex-start}
.win{border-radius:8px;overflow:hidden;box-shadow:0 6px 24px rgba(0,0,0,.35);background:${DEFAULT_BG}}
.bar{height:26px;background:${chrome};display:flex;align-items:center;gap:7px;padding:0 10px;font:12px system-ui,sans-serif;color:${light ? "#555" : "#aaa"}}
.dot{width:11px;height:11px;border-radius:50%;background:${light ? "#bbb" : "#555"}}
.ttl{margin-left:10px}
.term{position:relative;padding:14px;font-family:"DejaVu Sans Mono","Liberation Mono",monospace;font-size:14px;line-height:var(--lh);color:${DEFAULT_FG};white-space:pre}
.row{height:var(--lh)}
.cursor{position:absolute;width:1ch;height:var(--lh);background:${DEFAULT_FG};opacity:.55}
</style></head><body>${panes.map(renderPane).join("")}</body></html>`;

const htmlPath = output.replace(/\.png$/, ".html");
writeFileSync(htmlPath, html);

const pwPath = process.env.PLAYWRIGHT_CORE;
if (pwPath) {
	const require = createRequire(import.meta.url);
	const { chromium } = require(pwPath);
	const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
	const page = await browser.newPage({ deviceScaleFactor: 2 });
	await page.goto(`file://${htmlPath}`);
	await page.locator("body").screenshot({ path: output });
	await browser.close();
}
