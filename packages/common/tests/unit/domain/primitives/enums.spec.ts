import { describe, expect, it } from "@jest/globals";
import {
	DataSource,
	WorkerStatusCode,
} from "../../../../src/domain/primitives/enums";

describe("WorkerStatusCode", () => {
	it("should have correct values", () => {
		expect(WorkerStatusCode.Active).toBe("active");
		expect(WorkerStatusCode.Draining).toBe("draining");
		expect(WorkerStatusCode.Offline).toBe("offline");
	});
});

describe("DataSource", () => {
	it("should have correct values", () => {
		expect(DataSource.Binance).toBe("binance");
	});
});
