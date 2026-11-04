import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const STOP = jest.fn();
const MOCK_SCHEDULE = jest.fn<any>(() => ({ stop: STOP }));
jest.mock("node-cron", () => ({ schedule: MOCK_SCHEDULE }));

const MOCK_LOGGER = { warn: jest.fn() };
jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: MOCK_LOGGER,
}));

import { SignalCronScheduler } from "../../../src/adapters/inbound/cron/signal.cron";
import type { Source } from "../../../src/domain/signals";

function source(id: string, schedule: string): Source {
	return {
		id,
		protocol: "rest_api",
		adapter: "ecb-sdmx-series",
		schedule,
		reliabilityScore: 0.9,
		covers: [{ assetType: "bond", dimension: "market" }],
		accessPolicy: {
			terms: "public-domain",
			termsUrl: "https://a.test/terms",
			auth: "none",
			maxRequestsPerMinute: 60,
		},
		requests: [
			{
				subject: { assetId: "EA_AAA_10Y" },
				dimension: "market",
				url: "https://a.test/",
				params: {},
			},
		],
	};
}

const FAST = source("fast", "*/5 * * * *");
const SLOW = source("slow", "17 */6 * * *");

/** The tick handler node-cron got for the nth source. */
function tick(index: number): () => Promise<void> {
	return MOCK_SCHEDULE.mock.calls[index][1] as () => Promise<void>;
}

describe("SignalCronScheduler", () => {
	/** Ends every collection in progress. */
	let pending: (() => void)[] = [];
	const release = () => {
		for (const resolve of pending.splice(0)) {
			resolve();
		}
	};
	const collect = jest.fn<(s: Source) => Promise<void>>();

	beforeEach(() => {
		jest.clearAllMocks();
		pending = [];
		collect.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					pending.push(resolve);
				})
		);
	});

	it("schedules each source on its own schedule", () => {
		new SignalCronScheduler([FAST, SLOW], { collect }).start();

		expect(MOCK_SCHEDULE.mock.calls.map((call) => call[0])).toEqual([
			"*/5 * * * *",
			"17 */6 * * *",
		]);
	});

	it("skips a tick while the previous collection of the source runs, not the other sources", async () => {
		new SignalCronScheduler([FAST, SLOW], { collect }).start();

		const first = tick(0)();
		await tick(0)();
		void tick(1)();

		expect(collect.mock.calls.map(([s]) => s.id)).toEqual(["fast", "slow"]);
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			"Previous signal collection still running: tick skipped",
			{ source: "fast" }
		);
		release();
		await first;
	});

	it("collects again once the previous collection is over", async () => {
		new SignalCronScheduler([FAST], { collect }).start();
		const first = tick(0)();
		release();
		await first;

		void tick(0)();

		expect(collect).toHaveBeenCalledTimes(2);
	});

	it("stops the tasks, then waits for the collections in progress", async () => {
		const scheduler = new SignalCronScheduler([FAST], { collect });
		scheduler.start();
		void tick(0)();

		let stopped = false;
		const stopping = scheduler.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();

		expect(STOP).toHaveBeenCalled();
		expect(stopped).toBe(false);
		release();
		await stopping;
		expect(stopped).toBe(true);
	});
});
