import { describe, expect, it } from "@jest/globals";
import { z } from "zod";
import { brand } from "../../../src/wire/brand";

describe("brand", () => {
	const Even = {
		of(value: number) {
			if (value % 2 !== 0) {
				throw new RangeError(`Even expected, got ${value}`);
			}
			return value as number & { readonly brand: "Even" };
		},
	};
	const schema = z.object({ n: z.number().transform(brand(Even.of)) });

	it("applies the brand", () => {
		expect(schema.parse({ n: 2 })).toEqual({ n: 2 });
	});

	it("turns a rejected value into a validation issue instead of throwing", () => {
		const result = schema.safeParse({ n: 3 });

		expect(result.success).toBe(false);
		expect(result.error?.issues).toEqual([
			expect.objectContaining({ path: ["n"], message: "Even expected, got 3" }),
		]);
	});

	it("reports a non-Error rejection", () => {
		const throwsString = z.string().transform(
			brand(() => {
				// biome-ignore lint/style/useThrowOnlyError: brand must survive a library that throws a string
				throw "nope";
			})
		);

		expect(throwsString.safeParse("x").error?.issues[0].message).toBe("nope");
	});
});
