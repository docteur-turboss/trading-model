import { describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
	setLogger: jest.fn(),
}));
jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		AUDIT_RETENTION_DAYS: 1827,
		AUDIT_ANCHOR_BUCKET: "anchors",
		AUDIT_ANCHOR_PREFIX: "audit-chain/",
		AUDIT_ANCHOR_REGION: "eu-west-3",
		AUDIT_ANCHOR_ENDPOINT: "https://s3.example.test",
		AUDIT_ANCHOR_REQUIRED: true,
	},
}));
jest.mock("../../../src/config/broker-setup", () => ({}));
jest.mock("../../../src/application/server", () => ({}));

import type { Db } from "mongodb";
import promClient from "prom-client";
import {
	type ChainAuditSettings,
	chainAuditSettingsFromEnv,
	createChainAudit,
} from "../../../src/config/container";
import { chainOf } from "../../fixtures/audit-chain";

const DB = { collection: jest.fn(() => ({})) } as unknown as Db;
const SETTINGS: ChainAuditSettings = {
	retentionDays: 1827,
	anchorPrefix: "audit-chain/",
	anchorRegion: "us-east-1",
	anchorRequired: false,
};

async function gauge(name: string): Promise<number | undefined> {
	const metric = await promClient.register.getSingleMetric(name)?.get();
	return metric?.values[0]?.value;
}

describe("createChainAudit", () => {
	it("reads its settings from the environment", () => {
		expect(chainAuditSettingsFromEnv()).toEqual({
			retentionDays: 1827,
			anchorBucket: "anchors",
			anchorPrefix: "audit-chain/",
			anchorRegion: "eu-west-3",
			anchorEndpoint: "https://s3.example.test",
			anchorRequired: true,
		});
	});

	it("refuses to run unanchored when anchors are required", () => {
		expect(() =>
			createChainAudit(DB, { ...SETTINGS, anchorRequired: true })
		).toThrow("AUDIT_ANCHOR_REQUIRED is set but AUDIT_ANCHOR_BUCKET is not");
	});

	it("verifies only, and says so, without a bucket", async () => {
		const audit = createChainAudit(DB, SETTINGS);

		expect(audit.anchoringEnabled).toBe(false);
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			expect.stringContaining("AUDIT_ANCHOR_BUCKET not set")
		);
		expect(await gauge("audit_chain_anchoring_enabled")).toBe(0);
	});

	it("anchors in the bucket when one is set", async () => {
		const audit = createChainAudit(DB, {
			...SETTINGS,
			anchorBucket: "anchors",
			anchorEndpoint: "https://s3.example.test",
		});

		expect(audit.anchoringEnabled).toBe(true);
		expect(await gauge("audit_chain_anchoring_enabled")).toBe(1);
	});

	it("publishes the verification and anchoring metrics", async () => {
		const [event] = chainOf(1);
		const reader = {
			async *eventsAfter() {
				yield event;
			},
			head: async () => ({ chainSequence: 1, dataHash: event.dataHash }),
		};
		const collection = {
			findOne: async () => null,
			replaceOne: async () => ({}),
		};
		const db = {
			collection: (name: string) =>
				name === "audit_events"
					? {
							find: () => ({
								sort: () => ({ batchSize: () => reader.eventsAfter() }),
							}),
							findOne: async () => ({
								chainSequence: 1,
								dataHash: event.dataHash,
							}),
						}
					: collection,
		} as unknown as Db;

		await createChainAudit(db, SETTINGS).runCycle();

		expect(await gauge("audit_chain_broken")).toBe(0);
		expect(await gauge("audit_chain_verified_sequence")).toBe(1);
		expect(
			await gauge("audit_chain_last_verification_timestamp")
		).toBeGreaterThan(0);
	});
});
