import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_LOGGER = {
	debug: jest.fn<(...args: any[]) => any>(),
	error: jest.fn<(...args: any[]) => any>(),
	warn: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import {
	recordSourceTerms,
	restoreFreshness,
	SignalCollector,
	signalId,
	zeroCollectionFailures,
} from "../../../src/application/signal-collector";
import {
	SIGNAL_COLLECTIONS_TOTAL,
	SIGNAL_LAST_SUCCESS,
	SIGNAL_NEWEST_OBSERVED,
	SIGNAL_SOURCE_MAX_AGE,
	SIGNAL_SOURCE_QUARANTINED,
	SIGNAL_SOURCES,
} from "../../../src/config/metrics";
import {
	HttpStatusError,
	InvalidPayloadError,
	NOT_MODIFIED,
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
const confirm = jest.fn<(url: string) => void>();
const worker = Object.assign(
	jest.fn<
		(
			request: unknown,
			auth: unknown,
			source: unknown,
			signal?: AbortSignal
		) => Promise<unknown>
	>(),
	{ confirm }
);
const save = jest.fn<(signals: unknown, restate?: boolean) => Promise<void>>();
const sleep = jest.fn<(ms: number) => Promise<void>>();

let clock = NOW;

function collector(): SignalCollector {
	return new SignalCollector({
		workers: { rest_api: worker },
		adapters: new Map([
			["test-adapter", { dimensions: ["social"], normalize }],
		]),
		store: {
			save,
			findForAsset: jest.fn<(...args: any[]) => any>(),
			newestBySource: jest.fn<(...args: any[]) => any>(),
		},
		now: () => clock,
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

describe("recordSourceTerms", () => {
	it("counts sources by terms and commercial licence", async () => {
		const restricted = {
			...SOURCE.accessPolicy,
			terms: "non-commercial",
			restrictions: "personal use (read 2026-11-15)",
			commercialLicence: "unknown",
		} as const;

		recordSourceTerms(
			[
				SOURCE,
				{ ...SOURCE, accessPolicy: restricted },
				{ ...SOURCE, accessPolicy: restricted },
			],
			{ active: [], accepted: "", production: true }
		);

		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ sources: expect.any(Array) })
		);
		const { values } = await SIGNAL_SOURCES.get();
		expect(
			values.map((v) => [v.labels.terms, v.labels.commercial_licence, v.value])
		).toEqual(
			expect.arrayContaining([
				[SOURCE.accessPolicy.terms, "n/a", 1],
				["non-commercial", "unknown", 2],
			])
		);
	});

	describe("non-commercial guard", () => {
		const restricted: Source = {
			...SOURCE,
			id: "paid-feed",
			accessPolicy: {
				...SOURCE.accessPolicy,
				terms: "non-commercial",
				restrictions: "personal use",
				commercialLicence: "available",
			},
		};

		it("refuses an active unaccepted source in production", () => {
			expect(() =>
				recordSourceTerms([restricted], {
					active: [restricted],
					accepted: "other",
					production: true,
				})
			).toThrow(/paid-feed.*SIGNAL_NON_COMMERCIAL_ACCEPTED/);
		});

		it("starts when the operator accepted it", () => {
			expect(() =>
				recordSourceTerms([restricted], {
					active: [restricted],
					accepted: "x, paid-feed",
					production: true,
				})
			).not.toThrow();
		});

		it("only warns outside production", () => {
			expect(() =>
				recordSourceTerms([restricted], {
					active: [restricted],
					accepted: "",
					production: false,
				})
			).not.toThrow();
		});
	});
});

beforeEach(() => {
	jest.clearAllMocks();
	clock = NOW;
	SIGNAL_SOURCE_QUARANTINED.reset();
	SIGNAL_COLLECTIONS_TOTAL.reset();
	SIGNAL_LAST_SUCCESS.reset();
	SIGNAL_NEWEST_OBSERVED.reset();
	SIGNAL_SOURCE_MAX_AGE.reset();
	worker.mockResolvedValue({ payload: true });
	normalize.mockReturnValue([OBSERVATION]);
	save.mockResolvedValue(undefined);
	sleep.mockResolvedValue(undefined);
});

describe("SignalCollector", () => {
	it("wraps each canonical payload in a signal of the request's dimension and stores it", async () => {
		await collector().collect(SOURCE);

		expect(worker).toHaveBeenCalledWith(
			SOURCE.requests[0],
			"none",
			SOURCE,
			undefined
		);
		expect(normalize).toHaveBeenCalledWith(
			{ payload: true },
			{ params: {}, ingestedAt: NOW }
		);
		expect(save).toHaveBeenNthCalledWith(
			1,
			[
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
					area: null,
					observedAt: "2026-11-04T12:00:00.000Z",
					ingestedAt: "2026-11-04T12:03:00.000Z",
					// The source reliability, kept for the consumers to weigh.
					confidenceScore: 0.3,
					payload: PAYLOAD,
				},
			],
			undefined
		);
		await expect(counted()).resolves.toEqual({ "test-source:success": 2 });
	});

	it("stops at an aborted signal: no partial save, no further request", async () => {
		const controller = new AbortController();
		worker.mockImplementationOnce(async () => {
			controller.abort();
			return { payload: true };
		});

		await collector().collect(SOURCE, controller.signal);

		expect(worker).toHaveBeenCalledTimes(1);
		expect(worker.mock.calls[0][3]).toBe(controller.signal);
		expect(save).not.toHaveBeenCalled();
	});

	it("does not count, log or quarantine a request cut in flight", async () => {
		const instance = collector();
		for (let i = 0; i < 10; i++) {
			const controller = new AbortController();
			worker.mockImplementationOnce(async () => {
				controller.abort();
				throw new Error("AbortError from host");
			});
			await instance.collect(ONE_REQUEST, controller.signal);
		}

		await expect(counted()).resolves.toEqual({});
		expect(MOCK_LOGGER.error).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		// Ten cut cycles opened no quarantine.
		worker.mockResolvedValueOnce({ payload: true });
		await instance.collect(ONE_REQUEST);
		await expect(counted()).resolves.toEqual({ "test-source:success": 1 });
	});

	it("tells the store to restate the values of a restated source", async () => {
		await collector().collect({ ...SOURCE, restated: true });

		expect(save.mock.calls.map(([, restate]) => restate)).toEqual([true, true]);
	});

	it("spaces the requests of a source by its maxRequestsPerMinute", async () => {
		await collector().collect(SOURCE);

		// 30 a minute: 2 s between the two requests, none before the first.
		expect(sleep.mock.calls).toEqual([[2000]]);
	});

	it("puts the dates of the collection in place of the {date-N} placeholders", async () => {
		const url =
			"https://a.test/pageviews/daily/{date-8}/{date-1}?today={date-0}&y={year}";

		await collector().collect({
			...SOURCE,
			requests: [{ ...SOURCE.requests[0], url }],
		});

		expect(worker).toHaveBeenCalledWith(
			{
				...SOURCE.requests[0],
				url: "https://a.test/pageviews/daily/20261027/20261103?today=20261104&y=2026",
			},
			"none",
			expect.anything(),
			undefined
		);
	});

	it("stores a sector request once, on the sector", async () => {
		await collector().collect(SOURCE);

		const [[sectorSignal]] = save.mock.calls[1] as [any[]];
		expect(sectorSignal).toMatchObject({ assetId: null, sector: "crypto" });
	});

	it("stores an area request once, on the area, with an id stable at replay", async () => {
		const areaSource = {
			...SOURCE,
			requests: [{ ...SOURCE.requests[1], subject: { area: "EA" } }],
		};
		await collector().collect(areaSource);
		await collector().collect(areaSource);

		const [[first]] = save.mock.calls[0] as [any[]];
		const [[replay]] = save.mock.calls[1] as [any[]];
		expect(first).toMatchObject({ assetId: null, sector: null, area: "EA" });
		expect(replay.id).toBe(first.id);
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
		expect((await SIGNAL_NEWEST_OBSERVED.get()).values).toEqual([]);
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
			[`${SOURCE.id}:skipped_quarantine`]: 0,
		});
	});

	it("counts a 304 as a collection: no adapter, no store, fresh gauge", async () => {
		worker.mockResolvedValueOnce(NOT_MODIFIED);
		await collector().collect(ONE_REQUEST);
		expect(normalize).not.toHaveBeenCalled();
		expect(save).not.toHaveBeenCalled();
		expect((await counted())[`${SOURCE.id}:not_modified`]).toBe(1);
		expect(
			(await SIGNAL_LAST_SUCCESS.get()).values.map((v) => v.value)
		).toEqual([NOW / 1000]);
	});

	it("confirms the validators after the save only, not on a store error", async () => {
		save.mockRejectedValueOnce(new Error("mysql down"));
		await collector().collect(ONE_REQUEST);
		expect(confirm).not.toHaveBeenCalled();
		await collector().collect(ONE_REQUEST);
		expect(confirm).toHaveBeenCalledTimes(1);
	});

	it("moves the freshness gauges on success only", async () => {
		const gauge = async (g: typeof SIGNAL_LAST_SUCCESS) =>
			(await g.get()).values.map((v) => v.value);
		worker.mockRejectedValueOnce(new Error("down"));
		await collector().collect(ONE_REQUEST);
		expect(await gauge(SIGNAL_LAST_SUCCESS)).toEqual([]);

		await collector().collect(ONE_REQUEST);
		expect(await gauge(SIGNAL_LAST_SUCCESS)).toEqual([NOW / 1000]);
		expect(await gauge(SIGNAL_NEWEST_OBSERVED)).toEqual([OBSERVED_AT / 1000]);
	});

	it("keeps the observed gauge on replayed data, whatever the collection time", async () => {
		await collector().collect(ONE_REQUEST);
		clock += 3_600_000;
		await collector().collect(ONE_REQUEST);
		expect(
			(await SIGNAL_NEWEST_OBSERVED.get()).values.map((v) => v.value)
		).toEqual([OBSERVED_AT / 1000]);
	});

	it("restores the gauges from the store, the threshold from the cron", async () => {
		const newestBySource = async () =>
			new Map([["test-source", { ingestedAt: 5000, observedAt: 2000 }]]);
		const other = { ...SOURCE, id: "empty", schedule: "0 0 * * *" };
		await restoreFreshness([SOURCE, other], { newestBySource } as any, NOW);

		const values = async (g: typeof SIGNAL_LAST_SUCCESS) =>
			Object.fromEntries(
				(await g.get()).values.map((v) => [v.labels.source, v.value])
			);
		expect(await values(SIGNAL_LAST_SUCCESS)).toEqual({
			"test-source": 5,
			empty: NOW / 1000,
		});
		expect(await values(SIGNAL_NEWEST_OBSERVED)).toEqual({ "test-source": 2 });
		expect(await values(SIGNAL_SOURCE_MAX_AGE)).toEqual({
			"test-source": 900,
			empty: 259_200,
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

describe("quarantine of a failing source", () => {
	const HOUR = 3_600_000;
	const fail = (status = 500, retryAfter?: string) =>
		worker.mockRejectedValue(new HttpStatusError("HTTP", status, retryAfter));
	const quarantined = async () =>
		(await SIGNAL_SOURCE_QUARANTINED.get()).values[0]?.value;

	it("opens after 3 failed ticks, skips ticks, doubles on a failed trial and closes on success", async () => {
		const c = collector();
		fail();
		for (let i = 0; i < 3; i++) {
			await c.collect(ONE_REQUEST);
		}
		expect(worker).toHaveBeenCalledTimes(3);
		expect(await quarantined()).toBe(1);

		clock += HOUR - 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(3);
		expect((await counted())["test-source:skipped_quarantine"]).toBe(1);

		clock += 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(4);
		clock += 2 * HOUR - 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(4);

		clock += 1;
		worker.mockResolvedValue({ payload: true });
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(5);
		expect(await quarantined()).toBe(0);
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(6);
	});

	it("counts an HttpStatusError thrown by the adapter as a fetch error and quarantines the source", async () => {
		worker.mockResolvedValue({ payload: true });
		normalize.mockImplementation(() => {
			throw new HttpStatusError("quota in a 200 body", 429);
		});
		const c = collector();
		for (let i = 0; i < 3; i++) {
			await c.collect(ONE_REQUEST);
		}
		expect((await counted())["test-source:fetch_error"]).toBe(3);
		expect((await counted())["test-source:invalid_payload"]).toBeUndefined();
		expect(await quarantined()).toBe(1);
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(3);
	});

	it("honours Retry-After in seconds and as an HTTP date", async () => {
		fail(429, "7200");
		const c = collector();
		await c.collect(ONE_REQUEST);
		clock += 2 * HOUR - 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(1);
		clock += 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(2);

		worker.mockClear();
		clock = NOW;
		fail(503, new Date(NOW + 5 * HOUR).toUTCString());
		const d = collector();
		await d.collect(ONE_REQUEST);
		clock += 4 * HOUR;
		await d.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(1);
	});

	it("doubles the deadline of a quarantine opened by Retry-After at each failed trial", async () => {
		fail(429, "30");
		const c = collector();
		await c.collect(ONE_REQUEST);
		clock += HOUR;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(2);
		clock += 2 * HOUR - 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(2);
		clock += 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(3);
	});

	it("counts a 404 as no fact, never a failure, when the source opts in, and stores the 200s", async () => {
		const c = collector();
		const optIn: Source = {
			...SOURCE,
			accessPolicy: { ...SOURCE.accessPolicy, notFoundIsEmpty: true },
		};
		normalize.mockReturnValue([OBSERVATION]);
		save.mockResolvedValue(undefined);
		for (let i = 0; i < 3; i++) {
			worker
				.mockRejectedValueOnce(new HttpStatusError("HTTP", 404))
				.mockResolvedValueOnce({ payload: true });
			await c.collect(optIn);
		}

		expect(save).toHaveBeenCalledTimes(3);
		expect(await quarantined()).toBe(0);
		expect((await counted())["test-source:not_found"]).toBe(3);
		fail(404);
		for (let i = 0; i < 3; i++) {
			await c.collect(ONE_REQUEST);
		}
		expect(await quarantined()).toBe(1);
	});

	it("quarantines a refused key (403) at the first failure for 24 h", async () => {
		fail(403);
		const c = collector();
		await c.collect(ONE_REQUEST);
		clock += 24 * HOUR - 1;
		await c.collect(ONE_REQUEST);
		expect(worker).toHaveBeenCalledTimes(1);
	});

	it("does not count invalid_payload or store_error, and leaves other sources alone", async () => {
		const c = collector();
		save.mockRejectedValue(new Error("MySQL down"));
		for (let i = 0; i < 4; i++) {
			await c.collect(ONE_REQUEST);
		}
		expect(worker).toHaveBeenCalledTimes(4);

		fail(403);
		await c.collect(ONE_REQUEST);
		worker.mockClear();
		worker.mockResolvedValue({ payload: true });
		await c.collect({ ...ONE_REQUEST, id: "other" });
		expect(worker).toHaveBeenCalledTimes(1);
	});
});
