import { describe, expect, it } from "@jest/globals";
import {
	DataSource,
	formatWorkerDisplayName,
	parseWorkerDisplayName,
	WorkerStatusCode,
} from "../../../../src/domain/primitives/enums";

describe("WorkerStatusCode", () => {
	it("should have correct values", () => {
		expect(WorkerStatusCode.Active).toBe("active");
		expect(WorkerStatusCode.Draining).toBe("draining");
		expect(WorkerStatusCode.Offline).toBe("offline");
	});
});

describe("formatWorkerDisplayName", () => {
	it("should format active status", () => {
		expect(formatWorkerDisplayName(WorkerStatusCode.Active)).toBe("Online");
	});

	it("should format draining status", () => {
		expect(formatWorkerDisplayName(WorkerStatusCode.Draining)).toBe("Draining");
	});

	it("should format offline status", () => {
		expect(formatWorkerDisplayName(WorkerStatusCode.Offline)).toBe("Offline");
	});
});

describe("parseWorkerDisplayName", () => {
	it("should parse valid display names", () => {
		expect(parseWorkerDisplayName("Online")).toBe(WorkerStatusCode.Active);
		expect(parseWorkerDisplayName("Draining")).toBe(WorkerStatusCode.Draining);
		expect(parseWorkerDisplayName("Offline")).toBe(WorkerStatusCode.Offline);
	});

	it("should return undefined for unknown display names", () => {
		expect(parseWorkerDisplayName("Unknown")).toBeUndefined();
	});
});

describe("DataSource", () => {
	it("should have correct values", () => {
		expect(DataSource.Binance).toBe("binance");
	});
});
