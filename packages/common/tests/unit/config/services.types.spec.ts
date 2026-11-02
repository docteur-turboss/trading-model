import { describe, expect, it } from "@jest/globals";
import {
	ALL_SERVICE_NAMES,
	parseServiceName,
	registerServiceName,
	ServiceInstanceName,
} from "../../../src/config/services.types";

describe("ALL_SERVICE_NAMES", () => {
	it("should contain core service names", () => {
		expect(ALL_SERVICE_NAMES.has(ServiceInstanceName.ApiGatewayService)).toBe(
			true
		);
		expect(
			ALL_SERVICE_NAMES.has(ServiceInstanceName.FinancialScraperService)
		).toBe(true);
	});
});

describe("parseServiceName", () => {
	it("should return valid core names", () => {
		expect(parseServiceName("api-gateway")).toBe("api-gateway");
		expect(parseServiceName("discovery-service")).toBe("discovery-service");
	});

	it("should throw for unknown names", () => {
		expect(() => parseServiceName("not-a-service")).toThrow(
			"Invalid ServiceInstanceName"
		);
	});
});

describe("registerServiceName", () => {
	it("should allow registering extra names", () => {
		const name = "custom-service" as ServiceInstanceName;
		registerServiceName(name);
		expect(parseServiceName("custom-service")).toBe("custom-service");
	});
});
