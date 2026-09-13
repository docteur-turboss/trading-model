import { describe, expect, it } from "@jest/globals";
import { parseCommaSeparated } from "../../../src/utils/comma-separated";

describe("parseCommaSeparated", () => {
	it("should split and trim parts", () => {
		expect(parseCommaSeparated(" a ,b , c ")).toEqual(["a", "b", "c"]);
	});

	it("should filter empty parts", () => {
		expect(parseCommaSeparated("a,,b,")).toEqual(["a", "b"]);
	});

	it("should handle whitespace-only entries", () => {
		expect(parseCommaSeparated("a,   ,b")).toEqual(["a", "b"]);
	});

	it("should return empty array for empty string", () => {
		expect(parseCommaSeparated("")).toEqual([]);
	});

	it("should return single element", () => {
		expect(parseCommaSeparated("solo")).toEqual(["solo"]);
	});
});
