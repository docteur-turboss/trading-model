import { describe, expect, it } from "@jest/globals";
import { safeStringify } from "../../../src/utils/safe-stringify";

describe("safeStringify", () => {
	it("should stringify normal objects", () => {
		expect(safeStringify({ a: 1, b: "hello" })).toBe('{"a":1,"b":"hello"}');
	});

	it("should handle BigInt values", () => {
		expect(safeStringify({ big: BigInt(123) })).toBe('{"big":"123"}');
	});

	it("should handle circular references", () => {
		const obj: Record<string, unknown> = { a: 1 };
		obj.self = obj;
		const result = safeStringify(obj);
		expect(result).toContain("[Circular]");
	});

	it("should use custom replacer", () => {
		const result = safeStringify({ password: "secret" }, 0, (key, val) =>
			key === "password" ? "***" : val
		);
		expect(result).toBe('{"password":"***"}');
	});

	it("should handle pretty printing", () => {
		const result = safeStringify({ a: 1 }, 2);
		expect(result).toContain("\n");
	});
});
