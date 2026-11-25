import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const decideOnLastBar = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/model-runtime/replay", () => ({ decideOnLastBar }));
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => ({ warn: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

import { verifyModel } from "@trading-model/model-runtime/model-manifest";
import { createDecisionTick } from "../../src/application/decide";
import { DECISION_INTENTS_TOTAL } from "../../src/config/metrics";
import { parsePromoted } from "../../src/domain/decision";

const HOUR = 3_600_000;
const NOW = 100 * HOUR + 5 * 60_000;
const BAR = NOW - 60_000;
const WEIGHTS = new Uint8Array(8);
const SHA = createHash("sha256").update(WEIGHTS).digest("hex");
const MODEL = { symbol: "BTCUSDT", version: "v1" };

function manifest(admissible: boolean, intervalMs = 60_000) {
	return {
		symbol: "BTCUSDT",
		version: "v1",
		weights: { sha256: SHA, length: 2 },
		genome: {},
		admission: { admissible },
		replay: { intervalMs, simulator: { initialCash: 1_000_000 } },
	} as never;
}

function build(over: { admissible?: boolean; header?: string } = {}) {
	const risk = {
		position: jest.fn<(...args: any[]) => any>(async () => 0.005),
		send: jest.fn<(...args: any[]) => any>(async () => ({
			status: "accepted",
			clientOrderId: "o1",
		})),
	};
	const audit = { promotionLoaded: jest.fn<(...args: any[]) => any>() };
	const trainer = {
		manifest: jest.fn<(...args: any[]) => any>(async () =>
			manifest(over.admissible ?? true)
		),
		weights: jest.fn<(...args: any[]) => any>(async () => ({
			bytes: WEIGHTS,
			sha256: over.header ?? SHA,
		})),
	};
	const scraper = { candles: jest.fn<(...args: any[]) => any>(async () => []) };
	let now = NOW;
	const tick = createDecisionTick({
		promoted: [MODEL],
		trainer,
		scraper,
		risk,
		audit,
		windowBars: 50,
		now: () => now,
	});
	return {
		tick,
		risk,
		audit,
		trainer,
		scraper,
		setNow: (v: number) => {
			now = v;
		},
	};
}

beforeEach(() => {
	jest.clearAllMocks();
	DECISION_INTENTS_TOTAL.reset();
	decideOnLastBar.mockReturnValue({
		barTimestamp: BAR,
		price: 60_000,
		order: { side: "buy", quantity: 0.012345678912 },
	});
});

describe("decision tick", () => {
	it("sends no intent for a model that is not admissible", async () => {
		const { tick, risk, audit } = build({ admissible: false });
		await tick();
		expect(risk.send).not.toHaveBeenCalled();
		expect(audit.promotionLoaded).not.toHaveBeenCalled();
	});

	it("sends no intent for a model that is not promoted", async () => {
		const { risk, trainer } = build();
		const none = createDecisionTick({
			promoted: [],
			trainer,
			scraper: { candles: async () => [] },
			risk,
			audit: { promotionLoaded: async () => undefined },
			windowBars: 50,
		});
		await none();
		expect(trainer.manifest).not.toHaveBeenCalled();
		expect(risk.send).not.toHaveBeenCalled();
	});

	it("sends no intent when the audit event is refused", async () => {
		const { tick, risk, audit } = build();
		audit.promotionLoaded.mockRejectedValueOnce(new Error("bus down"));
		await tick();
		expect(risk.send).not.toHaveBeenCalled();
		await tick();
		expect(risk.send).toHaveBeenCalledTimes(1);
	});

	it("refuses weights that differ from the manifest", async () => {
		const { tick, risk } = build({ header: "0".repeat(64) });
		await tick();
		expect(risk.send).not.toHaveBeenCalled();
	});

	it("never sells more than the real position, nothing when flat", async () => {
		decideOnLastBar.mockReturnValue({
			barTimestamp: BAR,
			price: 60_000,
			order: { side: "sell", quantity: 0.012 },
		});
		const { tick, risk } = build();
		await tick();
		expect(risk.send).toHaveBeenCalledWith(
			expect.objectContaining({ side: "sell", quantity: 0.005 })
		);
		const flat = build();
		flat.risk.position.mockResolvedValueOnce(0);
		await flat.tick();
		expect(flat.risk.send).not.toHaveBeenCalled();
	});

	it("bounds a buy by the room left under the exposure cap", async () => {
		// cap = 1_000_000 x 0.3 / 60_000 = 5 coin; 4.99 already held
		const { tick, risk } = build();
		risk.position.mockResolvedValue(4.99);
		await tick();
		expect(risk.send).toHaveBeenCalledWith(
			expect.objectContaining({ side: "buy", quantity: 0.00999999 })
		);
		const full = build();
		full.risk.position.mockResolvedValue(5);
		await full.tick();
		expect(full.risk.send).not.toHaveBeenCalled();
	});

	it("sends one intent per bar with a decision id fixed by model and bar", async () => {
		const { tick, risk, scraper, setNow } = build();
		await tick();
		await tick();
		expect(risk.send).toHaveBeenCalledTimes(1);
		expect(risk.send).toHaveBeenCalledWith(
			expect.objectContaining({
				decisionId: `BTCUSDT@v1:${BAR}`,
				side: "buy",
				quantity: 0.01234567,
				referencePrice: 60_000,
			})
		);
		expect(scraper.candles).toHaveBeenCalledWith(
			"BTCUSDT",
			BAR - 50 * 60_000,
			BAR + 60_000,
			60_000
		);
		// A restart forgets the last bar: the same bar gives the same identifier.
		const restarted = build();
		await restarted.tick();
		expect(restarted.risk.send.mock.calls[0][0].decisionId).toBe(
			`BTCUSDT@v1:${BAR}`
		);
		decideOnLastBar.mockReturnValue({
			barTimestamp: BAR + 60_000,
			price: 1,
			order: { side: "sell", quantity: 1 },
		});
		setNow(NOW + 60_000);
		await tick();
		expect(risk.send).toHaveBeenCalledTimes(2);
	});

	it("counts a rejection by its reason and a hold without sending", async () => {
		const { tick, risk, setNow } = build();
		risk.send.mockResolvedValueOnce({
			status: "rejected",
			reason: "price_band",
			clientOrderId: "o2",
		});
		await tick();
		decideOnLastBar.mockReturnValue({ barTimestamp: BAR + 60_000, price: 1 });
		setNow(NOW + 60_000);
		await tick();
		expect(risk.send).toHaveBeenCalledTimes(1);
		const counts = (await DECISION_INTENTS_TOTAL.get()).values;
		expect(counts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					labels: { outcome: "rejected", reason: "price_band" },
					value: 1,
				}),
				expect.objectContaining({
					labels: { outcome: "hold", reason: "" },
					value: 1,
				}),
			])
		);
	});

	it("decides nothing when the last bar is not in yet, and retries", async () => {
		const { tick, risk } = build();
		decideOnLastBar.mockReturnValueOnce({
			barTimestamp: BAR - 60_000,
			price: 1,
		});
		await tick();
		expect(risk.send).not.toHaveBeenCalled();
		await tick();
		expect(risk.send).toHaveBeenCalledTimes(1);
	});
});

describe("domain", () => {
	it("parses the promotion list and refuses a symbol twice or a bad entry", () => {
		expect(parsePromoted("BTCUSDT@v1, ETHUSDT@v2")).toHaveLength(2);
		expect(parsePromoted("")).toEqual([]);
		expect(() => parsePromoted("BTCUSDT@v1,BTCUSDT@v2")).toThrow();
		expect(() => parsePromoted("BTCUSDT")).toThrow();
		expect(() => parsePromoted("../x@v1")).toThrow();
	});

	it("refuses a manifest of another model or a wrong byte length", () => {
		const m = manifest(true) as never as { weights: { length: number } };
		expect(() =>
			verifyModel({
				model: { symbol: "ETHUSDT", version: "v1" },
				manifest: m as never,
				weights: WEIGHTS,
				headerSha256: SHA,
			})
		).toThrow(/not the expected/);
		m.weights.length = 3;
		expect(() =>
			verifyModel({
				model: MODEL,
				manifest: m as never,
				weights: WEIGHTS,
				headerSha256: SHA,
			})
		).toThrow(/float32/);
	});
});
