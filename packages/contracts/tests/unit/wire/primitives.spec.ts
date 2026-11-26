import { describe, expect, it } from "@jest/globals";
import { isObject } from "../../../src/wire/primitives";

describe("isObject", () => {
	it.each([
		[{}, true],
		[{ key: "value" }, true],
		[null, false],
		[[], false],
		["string", false],
		[42, false],
		[undefined, false],
	])("returns %p for %p", (input, expected) => {
		expect(isObject(input)).toBe(expected);
	});
});
