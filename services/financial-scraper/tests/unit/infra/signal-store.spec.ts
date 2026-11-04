import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_QUERY = jest.fn<any>();
jest.mock("../../../src/config/db", () => ({
	DATABASE: { promise: () => ({ query: MOCK_QUERY }) },
}));

import { MySqlSignalStore } from "../../../src/adapters/outbound/persistence/signal-store";
import type { Signal } from "../../../src/domain/signals";

const SIGNAL: Signal = {
	id: "a".repeat(64),
	schemaVersion: 1,
	sourceId: "nws-kansas-wheat-belt",
	dimension: "contextual",
	assetId: null,
	sector: "agriculture",
	metric: "temperature",
	value: 4.3,
	unit: "wmoUnit:degC",
	observedAt: "2026-11-04T12:00:00.000Z",
	collectedAt: "2026-11-04T12:03:00.000Z",
	confidenceScore: 0.7,
	attributes: { latitude: 38.07 },
};

/** The row mysql2 returns for SIGNAL: Dates, JSON column parsed. */
const ROW = {
	id: SIGNAL.id,
	schema_version: 1,
	source_id: SIGNAL.sourceId,
	dimension: SIGNAL.dimension,
	asset_id: null,
	sector: "agriculture",
	metric: SIGNAL.metric,
	value: 4.3,
	unit: "wmoUnit:degC",
	observed_at: new Date(SIGNAL.observedAt),
	collected_at: new Date(SIGNAL.collectedAt),
	confidence_score: 0.7,
	attributes: { latitude: 38.07 },
};

beforeEach(() => {
	jest.clearAllMocks();
	MOCK_QUERY.mockResolvedValue([[]]);
});

describe("MySqlSignalStore", () => {
	it("sends nothing for no signal", async () => {
		await MySqlSignalStore.save([]);

		expect(MOCK_QUERY).not.toHaveBeenCalled();
	});

	it("inserts the signals in one statement, leaving a stored id as it was", async () => {
		await MySqlSignalStore.save([SIGNAL]);

		const [sql, [rows]] = MOCK_QUERY.mock.calls[0];
		expect(sql).toMatch(/ON DUPLICATE KEY UPDATE id = id$/);
		expect(rows).toEqual([
			[
				SIGNAL.id,
				1,
				"nws-kansas-wheat-belt",
				"contextual",
				null,
				"agriculture",
				"temperature",
				4.3,
				"wmoUnit:degC",
				new Date("2026-11-04T12:00:00.000Z"),
				new Date("2026-11-04T12:03:00.000Z"),
				0.7,
				'{"latitude":38.07}',
			],
		]);
	});

	it("reads the signals of the asset and of its sector in the window", async () => {
		MOCK_QUERY.mockResolvedValue([[ROW]]);
		const from = Date.parse("2026-11-04T00:00:00Z");
		const to = Date.parse("2026-11-05T00:00:00Z");

		const signals = await MySqlSignalStore.findForAsset({
			assetId: "WHEAT",
			sector: "agriculture",
			from,
			to,
			limit: 10,
		});

		expect(signals).toEqual([SIGNAL]);
		expect(MOCK_QUERY.mock.calls[0][1]).toEqual([
			"WHEAT",
			"agriculture",
			new Date(from),
			new Date(to),
			10,
		]);
	});
});
