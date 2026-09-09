import {
	isNonEmptyString,
	isObject,
} from "../src/shared/validation/primitives";

describe("isNonEmptyString", () => {
	it.each([
		["hello", true],
		["a", true],
		[" ", false],
		["", false],
		[123, false],
		[null, false],
		[undefined, false],
		[{}, false],
		[[], false],
	])("returns %p for %p", (input, expected) => {
		expect(isNonEmptyString(input)).toBe(expected);
	});
});

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
