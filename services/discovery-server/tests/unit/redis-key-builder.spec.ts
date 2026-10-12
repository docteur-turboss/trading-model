import { describe, expect, it } from "@jest/globals";

import {
	instanceMetadata,
	instanceToken,
	instanceUpdatedBy,
	parseServiceName,
	serviceInstancesSet,
	servicePattern,
} from "../../src/shared/redis-key-builder";

describe("redis-key-builder", () => {
	const PREFIX = "trading-model:discovery:";

	it("serviceInstancesSet builds the set key", () => {
		expect(
			serviceInstancesSet(PREFIX, "financial-scraper-service" as never)
		).toBe(
			"trading-model:discovery:service:financial-scraper-service:instances"
		);
	});

	it("instanceMetadata builds the metadata key", () => {
		expect(instanceMetadata(PREFIX, "i1" as never)).toBe(
			"trading-model:discovery:instance:i1:metadata"
		);
	});

	it("instanceToken builds the token key", () => {
		expect(instanceToken(PREFIX, "i1" as never)).toBe(
			"trading-model:discovery:instance:i1:token"
		);
	});

	it("instanceUpdatedBy builds the updatedBy key", () => {
		expect(instanceUpdatedBy(PREFIX, "i1" as never)).toBe(
			"trading-model:discovery:instance:i1:updatedBy"
		);
	});

	it("servicePattern builds the glob pattern", () => {
		expect(servicePattern(PREFIX)).toBe(
			"trading-model:discovery:service:*:instances"
		);
	});

	it("parseServiceName extracts the service name from a matching key", () => {
		expect(
			parseServiceName(
				PREFIX,
				"trading-model:discovery:service:financial-scraper-service:instances"
			)
		).toBe("financial-scraper-service");
	});

	it("parseServiceName returns null for non-matching keys", () => {
		expect(
			parseServiceName(PREFIX, "trading-model:discovery:instance:i1:metadata")
		).toBe(null);
	});
});
