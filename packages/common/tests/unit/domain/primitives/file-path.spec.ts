import { describe, expect, it } from "@jest/globals";
import {
	FilePath,
	fromFilePath,
	toFilePath,
} from "../../../../src/domain/primitives/file-path";

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

describe("toFilePath", () => {
	it("should convert string to FilePath", () => {
		expect(toFilePath("/path/to/file")).toBe("/path/to/file");
	});
});

describe("fromFilePath", () => {
	it("should convert FilePath to string", () => {
		const fp = FilePath.of("/path");
		expect(fromFilePath(fp)).toBe("/path");
	});
});
