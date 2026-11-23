import type { Signal } from "@trading-model/contracts/wire/signals";
import { AGENT_STATE_DIM } from "@trading-model/model-runtime/agent/agent-state";
import { FEATURE_DIM } from "@trading-model/model-runtime/feature-vector-codec";
import {
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import {
	eventInputLayout,
	NETWORK_INPUT_LAYOUT,
	networkInputLayout,
} from "../../../src/domain/agent/agent-state";
import { createDefaultGenome } from "../../../src/domain/genetic-algorithm/factory";
import { GenerationProcessor } from "../../../src/domain/genetic-algorithm/generation-processor";
import { createGAControlGenome } from "../../../src/domain/genetic-algorithm/genome-control";
import { createInitialPopulation } from "../../../src/domain/genetic-algorithm/population-builder";
import { MarketDataBuffer } from "../../../src/domain/market-data-buffer";
import { makeCandle } from "../../fixtures/market-data.fixture";

// ADR-0081: signals enter the network as value, age and confidence inputs.
const SYMBOL = TradingSymbol.of("BTCUSDT");
const KEY = "BTC:social:pageviews";
const MINUTE = 60_000;
const T0 = 1_700_000_000_000;
const CANDLES = 130;
const closeOf = (idx: number) => T0 + (idx + 1) * MINUTE - 1;

function signal(observedAtMs: number, value: number, confidence = 0.8): Signal {
	return {
		assetId: "BTC",
		sector: null,
		area: null,
		dimension: "social",
		observedAt: new Date(observedAtMs).toISOString(),
		confidenceScore: confidence,
		payload: { metric: "pageviews", value },
	} as unknown as Signal;
}

function bufferWith(signalKeys: string[], signals: Signal[]): MarketDataBuffer {
	const buffer = new MarketDataBuffer({ signalKeys });
	for (let idx = 0; idx < CANDLES; idx++) {
		const price = 100 + 10 * Math.sin(idx) + idx;
		buffer.addCandle(
			SYMBOL,
			makeCandle({
				symbol: SYMBOL,
				timestamp: UnixTimestamp.of(T0 + idx * MINUTE),
				closeTimestamp: UnixTimestamp.of(closeOf(idx)),
				open: Price.of(price - 1),
				high: Price.of(price + 2),
				low: Price.of(price - 2),
				close: Price.of(price),
				volume: Volume.of(1000 + 37 * idx),
			})
		);
	}
	buffer.setSignals(SYMBOL, signals);
	return buffer;
}

const inputs = (buffer: MarketDataBuffer) =>
	buffer
		.buildMarketSteps(SYMBOL)
		.map((step) => Array.from(step.features.signals));

describe("signal inputs (ADR-0081)", () => {
	it("reads a value from the step its observedAt allows, not before", () => {
		const published = closeOf(30);
		const raw = inputs(
			bufferWith([KEY], [signal(published, 7), signal(published + 1, 99)])
		);

		// step idx = array position + 1
		expect(raw[28][0]).toBeNaN(); // idx 29: nothing public yet
		expect(raw[28].slice(1)).toEqual([1, 0]); // age at the bound, confidence 0
		expect(raw[29][0]).toBe(7); // idx 30: published at its close, 1 ms later is not public yet
		expect(raw[29][1]).toBe(0);
		expect(raw[29][2]).toBeCloseTo(0.8);
		expect(raw[29][0]).not.toBe(99); // public from idx 31, not before
		expect(raw[30][0]).toBe(99);
	});

	it("takes the last listed of equal observedAt, whatever the input order", () => {
		const at = closeOf(30);
		const raw = inputs(
			bufferWith(
				[KEY],
				[signal(at, 5), signal(at + 1, 99), signal(at - 5, 1), signal(at, 6)]
			)
		);

		expect(raw[29][0]).toBe(6); // tie at `at`: the later listed wins, not 99 (future)
		expect(raw[30][0]).toBe(99);
	});

	it("computes the normalization from the training segment only", () => {
		const signals = Array.from({ length: CANDLES }, (_u, idx) =>
			signal(closeOf(idx), idx < CANDLES - 5 ? 10 : 1_000_000)
		);
		const buffer = bufferWith([KEY], signals);
		const set = buffer.getAllWindows(SYMBOL, 0.15, 1, 0.15);
		const norms = buffer.snapshotNormalization(SYMBOL).signals as Record<
			string,
			{ mean: number; std: number }
		>;

		expect(set).toHaveLength(1);
		expect(norms[KEY]).toEqual({ mean: 10, std: 1 });
	});

	it("keeps the 18 market inputs and the published genome with the flag off", () => {
		const withSignals = bufferWith([], [signal(closeOf(5), 7)]);
		const without = bufferWith([], []);

		expect(
			withSignals
				.buildMarketSteps(SYMBOL)
				.map((s) => s.features.toFloat32Array())
		).toEqual(
			without.buildMarketSteps(SYMBOL).map((s) => s.features.toFloat32Array())
		);
		expect(
			without.buildMarketSteps(SYMBOL)[0].features.toFloat32Array()
		).toHaveLength(FEATURE_DIM);
		expect(networkInputLayout([])).toEqual(NETWORK_INPUT_LAYOUT);
		expect(createDefaultGenome("g").network.inputDim).toBe(
			FEATURE_DIM + AGENT_STATE_DIM
		);
	});

	it("names every signal input in the layout and sizes the genome from the steps", () => {
		const layout = networkInputLayout([KEY]);

		expect(layout.dim).toBe(NETWORK_INPUT_LAYOUT.dim + 3);
		expect(layout.fields.slice(FEATURE_DIM, FEATURE_DIM + 3)).toEqual([
			`SignalValue:${KEY}`,
			`SignalAge:${KEY}`,
			`SignalConfidence:${KEY}`,
		]);
		expect(
			createDefaultGenome("g", 0 as never, false, layout.dim).network.inputDim
		).toBe(layout.dim);
		expect(
			createDefaultGenome("g", 0 as never, true, layout.dim).network.inputDim
		).toBe(eventInputLayout([KEY]).dim);
	});

	it("publishes the same initial genomes with the flag off, and 19 + 3n inputs with n metrics", () => {
		const population = (buffer: MarketDataBuffer) => {
			const processor = new GenerationProcessor({
				windowSets: [
					{ id: "w", train: buffer.buildMarketSteps(SYMBOL), validation: [] },
				],
				backendFactory: () => undefined as never,
			});
			processor.initialise(createGAControlGenome());
			return processor.population;
		};
		const before = createInitialPopulation(createGAControlGenome());

		expect(population(bufferWith([], []))).toEqual(before);
		expect(population(bufferWith([KEY], []))[0].network.inputDim).toBe(
			FEATURE_DIM + AGENT_STATE_DIM + 3
		);
	});
});
