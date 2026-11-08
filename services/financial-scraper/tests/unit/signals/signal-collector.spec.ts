import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	debug: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import {
	SignalCollector,
	signalId,
	zeroCollectionFailures,
} from "../../../src/application/signal-collector";
import { SIGNAL_COLLECTIONS_TOTAL } from "../../../src/config/metrics";
import {
	InvalidPayloadError,
	type Observation,
	type SourceAdapter,
} from "../../../src/domain/ports/signal-source.port";
import type { Source } from "../../../src/domain/signals";

const NOW = Date.parse("2026-11-04T12:03:00.000Z");
const OBSERVED_AT = Date.parse("2026-11-04T12:00:00.000Z");

const SOURCE: Source = {
	id: "test-source",
	protocol: "rest_api",
	adapter: "test-adapter",
	schedule: "*/5 * * * *",
	reliabilityScore: 0.3,
	covers: [{ assetType: "crypto", dimension: "social" }],
	accessPolicy: {
		terms: "public-domain",
		termsUrl: "https://a.test/terms",
		auth: "none",
		maxRequestsPerMinute: 30,
	},
	requests: [
		{
			subject: { assetId: "BTC" },
			dimension: "social",
			url: "https://a.test/btc",
			params: {},
		},
		{
			subject: { sector: "crypto" },
			dimension: "social",
			url: "https://a.test/all",
			params: {},
		},
	],
};

const PAYLOAD = {
	metric: "pageviews",
	value: 67,
	unit: "views",
	platform: "en.wikipedia",
	topic: "Bitcoin",
	period: { start: "2026-11-03", end: "2026-11-03" },
};

const OBSERVATION: Observation = {
	key: "2026-11-03",
	observedAt: OBSERVED_AT,
	payload: PAYLOAD,
};

const normalize = jest.fn<SourceAdapter["normalize"]>();
const worker = jest.fn<(request: unknown) => Promise<unknown>>();
const save = jest.fn<(signals: unknown) => Promise<void>>();
const sleep = jest.fn<(ms: number) => Promise<void>>();

function collector(): SignalCollector {
	return new SignalCollector({
		workers: { rest_api: worker },
		adapters: new Map([
			["test-adapter", { dimensions: ["social"], normalize }],
		]),
		store: { save, findForAsset: jest.fn<(...args: any[]) => any>() },
		now: () => NOW,
		sleep,
	});
}

async function counted(): Promise<Record<string, number>> {
	const { values } = await SIGNAL_COLLECTIONS_TOTAL.get();
	return Object.fromEntries(
		values.map((v) => [`${v.labels.source}:${v.labels.result}`, v.value])
	);
}

const ONE_REQUEST: Source = { ...SOURCE, requests: [SOURCE.requests[0]] };

beforeEach(() => {
	jest.clearAllMocks();
	SIGNAL_COLLECTIONS_TOTAL.reset();
	worker.mockResolvedValue({ payload: true });
	normalize.mockReturnValue([OBSERVATION]);
	save.mockResolvedValue(undefined);
	sleep.mockResolvedValue(undefined);
});

describe("SignalCollector", () => {
	it("wraps each canonical payload in a signal of the request's dimension and stores it", async () => {
		await collector().collect(SOURCE);

		expect(worker).toHaveBeenCalledWith(SOURCE.requests[0]);
		expect(normalize).toHaveBeenCalledWith({ payload: true }, { params: {} });
		expect(save).toHaveBeenNthCalledWith(1, [
			{
				id: signalId(
					"test-source",
					{ assetId: "BTC" },
					"pageviews",
					"2026-11-03"
				),
				schemaVersion: 1,
				sourceId: "test-source",
				dimension: "social",
				assetId: "BTC",
				sector: null,
				observedAt: "2026-11-04T12:00:00.000Z",
				ingestedAt: "2026-11-04T12:03:00.000Z",
				// The source reliability, kept for the consumers to weigh.
				confidenceScore: 0.3,
				payload: PAYLOAD,
			},
		]);
		await expect(counted()).resolves.toEqual({ "test-source:success": 2 });
	});

	it("spaces the requests of a source by its maxRequestsPerMinute", async () => {
		await collector().collect(SOURCE);

		// 30 a minute: 2 s between the two requests, none before the first.
		expect(sleep.mock.calls).toEqual([[2000]]);
	});

	it("puts the dates of the collection in place of the {date-N} placeholders", async () => {
		const url =
			"https://a.test/pageviews/daily/{date-8}/{date-1}?today={date-0}";

		await collector().collect({
			...SOURCE,
			requests: [{ ...SOURCE.requests[0], url }],
		});

		expect(worker).toHaveBeenCalledWith({
			...SOURCE.requests[0],
			url: "https://a.test/pageviews/daily/20261027/20261103?today=20261104",
		});
	});

	it("stores a sector request once, on the sector", async () => {
		await collector().collect(SOURCE);

		const [[sectorSignal]] = save.mock.calls[1] as [any[]];
		expect(sectorSignal).toMatchObject({ assetId: null, sector: "crypto" });
	});

	it("gives a replayed observation the same id, another subject another id", async () => {
		await collector().collect(SOURCE);
		await collector().collect(SOURCE);

		const ids = save.mock.calls.map(([signals]) => (signals as any[])[0].id);
		expect(ids[0]).toBe(ids[2]);
		expect(ids[0]).not.toBe(ids[1]);
	});

	it("counts a failed fetch and goes on with the next request", async () => {
		worker.mockRejectedValueOnce(new Error("HTTP 503 from a.test"));

		await collector().collect(SOURCE);

		expect(save).toHaveBeenCalledTimes(1);
		expect(MOCK_LOGGER.error).toHaveBeenCalledWith(
			"Signal collection failed",
			expect.objectContaining({
				context: {
					source: "test-source",
					subject: { assetId: "BTC" },
					result: "fetch_error",
				},
			})
		);
		await expect(counted()).resolves.toEqual({
			"test-source:fetch_error": 1,
			"test-source:success": 1,
		});
	});

	it("stamps an observation without release time with the collection time", async () => {
		const { observedAt: _, ...undated } = OBSERVATION;
		normalize.mockReturnValueOnce([undated]);

		await collector().collect(ONE_REQUEST);

		expect(save.mock.calls[0][0]).toMatchObject([
			{ observedAt: "2026-11-04T12:03:00.000Z" },
		]);
	});

	it.each([
		[
			"a body that is not JSON",
			() =>
				worker.mockRejectedValueOnce(
					new InvalidPayloadError("Body from example.org is not JSON")
				),
		],
		[
			"a payload the adapter refuses",
			() =>
				normalize.mockImplementationOnce(() => {
					throw new Error("format changed");
				}),
		],
		[
			"a payload outside the schema of its dimension",
			() =>
				normalize.mockReturnValueOnce([
					{ ...OBSERVATION, payload: { ...PAYLOAD, platform: undefined } },
				]),
		],
		[
			"a value that is no number",
			() =>
				normalize.mockReturnValueOnce([
					{ ...OBSERVATION, payload: { ...PAYLOAD, value: Number.NaN } },
				]),
		],
		[
			"an invalid observation date",
			() =>
				normalize.mockReturnValueOnce([
					{ ...OBSERVATION, observedAt: Number.NaN },
				]),
		],
	])(
		"counts %s as an invalid payload and stores nothing of it",
		async (_label, arrange) => {
			arrange();

			await collector().collect(ONE_REQUEST);

			expect(save).not.toHaveBeenCalled();
			await expect(counted()).resolves.toEqual({
				"test-source:invalid_payload": 1,
			});
		}
	);

	it("counts a source whose adapter is unknown as an invalid payload", async () => {
		await collector().collect({ ...ONE_REQUEST, adapter: "missing" });

		expect(save).not.toHaveBeenCalled();
		expect(MOCK_LOGGER.error.mock.calls[0][1]).toMatchObject({
			error: new Error("No source adapter named missing"),
		});
	});

	it("starts every failure counter of a source at 0", async () => {
		zeroCollectionFailures([SOURCE]);

		expect(await counted()).toEqual({
			[`${SOURCE.id}:fetch_error`]: 0,
			[`${SOURCE.id}:invalid_payload`]: 0,
			[`${SOURCE.id}:store_error`]: 0,
		});
	});

	it("counts a store failure", async () => {
		save.mockRejectedValueOnce(new Error("MySQL down"));

		await collector().collect(ONE_REQUEST);

		await expect(counted()).resolves.toEqual({
			"test-source:store_error": 1,
		});
	});
});
