import assert from "node:assert/strict";
import { test } from "node:test";
import { range } from "../src/range.ts";

test("includes end", () => assert.deepEqual(range(1, 3), [1, 2, 3]));
test("honours step", () => assert.deepEqual(range(0, 10, 5), [0, 5, 10]));
test("rejects non-positive step", () => assert.throws(() => range(0, 1, 0)));
