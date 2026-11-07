import { describe, expect, it } from "@jest/globals";
import { FilePath } from "../../../src/primitives/file-path";

describe("FilePath", () => {
	it("should create a file path", () => {
		expect(FilePath.of("/tmp/test.txt")).toBe("/tmp/test.txt");
	});

	it("should throw for empty string", () => {
		expect(() => FilePath.of("")).toThrow(RangeError);
	});

	it("should throw for non-string", () => {
		expect(() => FilePath.of(42 as unknown as string)).toThrow(RangeError);
	});
});
