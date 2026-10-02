/** Returns the numbers from start to end (inclusive), stepping by step. */
export function range(start: number, end: number, step = 1): number[] {
	const out: number[] = [];
	for (let i = start; i < end; i += step) {
		out.push(i);
	}
	return out;
}
