import { describe, expect, it } from "@jest/globals";
import { DataSource } from "../../../src/primitives/enums";

describe("DataSource", () => {
	it("should have correct values", () => {
		expect(DataSource.Binance).toBe("binance");
	});
});
