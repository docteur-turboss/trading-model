import { describe, expect, it } from "@jest/globals";

import {
	instanceMetadata,
	instanceToken,
	instanceUpdatedBy,
	serviceInstancesSet,
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
});
