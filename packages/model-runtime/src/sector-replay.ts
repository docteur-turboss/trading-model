import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	Cash,
	Percentage,
	Price,
	Volume,
} from "@trading-model/primitives/primitives";
import { applyInputMask } from "./agent/input-mask";
import { attentionForward } from "./attention";
import { MultiAssetWallet } from "./env/multi-asset-wallet";
import { DEFAULT_MAX_EXPOSURE_FRACTION } from "./env/wallet-config";
import { EpisodeScores } from "./episode-scores";
import {
	type CandleStep,
	candleSteps,
	contiguousCandles,
	isConsistentCandle,
} from "./features/feature-builder";
import {
	inferenceEngine,
	type PolicyGenome,
	type SimulatorParams,
} from "./replay";
import {
	barsPerYear,
	type SegmentRatios,
	segmentRatios,
} from "./replay-metrics";

/** Outputs of an analyst network: score, confidence, volatility, liquidity, horizon (ADR-0076 §3). */
export const SIGNAL_DIM = 5;
/** Outputs of a sector manager network, per asset: asset score, sector exposure. */
const MANAGER_OUTPUT_DIM = 2;

/** What an asset analyst says of its asset; it allocates nothing. */
export interface AssetSignal {
	/** Direction in (-1, 1). */
	score: number;
	/** In (0, 1). */
	confidence: number;
	/** Estimated volatility, positive. */
	volatility: number;
	/** In (0, 1). */
	liquidity: number;
	/** In (0, 1): short to long. */
	horizon: number;
}

/** How the manager sees across assets: the mean, or the mean and the max of every signal field. */
export type PoolingMode = "mean" | "mean+max" | "attention";

/** Attention pooling (ADR-0076 step 6): heads and their weights, see `attentionForward`. */
export interface AttentionPooling {
	heads: number;
	weights: ArrayLike<number>;
}

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

/** Maps the raw outputs of an analyst network to a signal. */
export function toAssetSignal(output: ArrayLike<number>): AssetSignal {
	if (output.length !== SIGNAL_DIM) {
		throw new Error(
			`analyst outputs ${SIGNAL_DIM} values, got ${output.length}`
		);
	}
	return {
		score: Math.tanh(output[0]),
		confidence: sigmoid(output[1]),
		volatility: Math.log1p(Math.exp(output[2])),
		liquidity: sigmoid(output[3]),
		horizon: sigmoid(output[4]),
	};
}

const fields = (signal: AssetSignal): number[] => [
	signal.score,
	signal.confidence,
	signal.volatility,
	signal.liquidity,
	signal.horizon,
];

/** Input size of the manager network: the asset's own signal plus the pooled view. */
export const managerInputDim = (pooling: PoolingMode, heads = 0): number =>
	SIGNAL_DIM *
	(pooling === "mean" ? 2 : pooling === "mean+max" ? 3 : 1 + heads);

/** Permutation-invariant view of the group: per field the mean (and the max). */
export function poolSignals(
	signals: readonly AssetSignal[],
	pooling: PoolingMode,
	attention?: AttentionPooling
): number[] {
	const rows = signals.map(fields);
	if (pooling === "attention") {
		if (!attention || attention.heads < 1) {
			throw new Error("attention pooling needs heads >= 1 and weights");
		}
		return attentionForward(rows, attention.weights, attention.heads).pooled;
	}
	const mean = Array.from(
		{ length: SIGNAL_DIM },
		(_, field) => rows.reduce((sum, row) => sum + row[field], 0) / rows.length
	);
	if (pooling === "mean") {
		return mean;
	}
	return [
		...mean,
		...Array.from({ length: SIGNAL_DIM }, (_, field) =>
			Math.max(...rows.map((row) => row[field]))
		),
	];
}

/** Weights in the sector (sum 1) and exposure of the sector in (0, 1), from the manager's outputs per asset. */
export function sectorDecision(outputs: readonly ArrayLike<number>[]): {
	weights: number[];
	exposure: number;
} {
	const top = Math.max(...outputs.map((out) => out[0]));
	const exps = outputs.map((out) => Math.exp(out[0] - top));
	const total = exps.reduce((sum, value) => sum + value, 0);
	return {
		weights: exps.map((value) => value / total),
		exposure:
			outputs.reduce((sum, out) => sum + sigmoid(out[1]), 0) / outputs.length,
	};
}

/** A trained network and the genes it needs to be run. */
export interface SectorNetwork {
	genome: PolicyGenome;
	weights: Float32Array;
}

interface Target {
	symbol: string;
	/** Open of the next bar; absent on the last bar: no trade. */
	fill: number | undefined;
	/** Share of the equity to hold in the asset. */
	share: number;
	price: number;
}

/** Sells what is above the target, then buys what is below it, at the next open. */
function rebalance(wallet: MultiAssetWallet, targets: readonly Target[]): void {
	const equity = Number(wallet.valuation());
	const moves = targets
		.filter((item) => item.fill !== undefined)
		.map((item) => ({
			...item,
			delta:
				(item.share * equity) / item.price -
				Number(wallet.position(item.symbol)),
		}));
	for (const move of moves.filter((item) => item.delta < 0)) {
		wallet.sell(
			move.symbol,
			Volume.of(-move.delta),
			Price.of(move.fill as number)
		);
	}
	for (const move of moves.filter((item) => item.delta > 0)) {
		wallet.buy(
			move.symbol,
			Volume.of(move.delta),
			Price.of(move.fill as number)
		);
	}
}

/**
 * Replays a sector (ADR-0076 §3): analysts read their own asset, the manager
 * pools their signals, picks weights and exposure, and the portfolio trades
 * on a shared-cash wallet, filling at the next bar's open (ADR-0066). Only the
 * bars every asset has, from `testFrom`, are played. Throws when a network
 * does not fit, or when assets share fewer than 2 bars.
 */
export function replaySector(input: {
	assets: readonly {
		symbol: string;
		analyst: SectorNetwork;
		candles: CandleData[];
	}[];
	manager: SectorNetwork;
	pooling: PoolingMode;
	/** Required with `pooling: "attention"`. */
	attention?: AttentionPooling;
	testFrom: number;
	simulator: SimulatorParams;
}): SegmentRatios & { feesPaid: number; executionCostPaid: number } {
	const { assets, pooling, simulator } = input;
	const managerNet = input.manager.genome.network;
	if (
		managerNet.inputDim !== managerInputDim(pooling, input.attention?.heads)
	) {
		throw new Error("manager input size does not match the pooling mode");
	}
	if (managerNet.outputDim !== MANAGER_OUTPUT_DIM) {
		throw new Error(`manager outputs ${MANAGER_OUTPUT_DIM} values`);
	}
	const stepsOf = assets.map(
		(asset) =>
			new Map<number, CandleStep>(
				candleSteps(contiguousCandles(asset.candles.filter(isConsistentCandle)))
					.filter((step) => step.timestamp >= input.testFrom)
					.map((step) => [step.timestamp, step])
			)
	);
	const timestamps = [...(stepsOf[0]?.keys() ?? [])]
		.filter((ts) => stepsOf.every((steps) => steps.has(ts)))
		.sort((left, right) => left - right);
	if (timestamps.length < 2) {
		throw new Error("assets share fewer than 2 bars on the test segment");
	}
	const analysts = assets.map((asset) =>
		inferenceEngine(asset.analyst.genome.network, asset.analyst.weights)
	);
	const manager = inferenceEngine(managerNet, input.manager.weights);
	const wallet = new MultiAssetWallet(
		{
			initialCash: Cash.of(simulator.initialCash),
			initialPrice: Price.of(1),
			feeRate: Percentage.of(simulator.feeRate),
			executionCostRate: Percentage.of(simulator.executionCostRate),
			maxExposureFraction:
				simulator.maxExposureFraction ?? DEFAULT_MAX_EXPOSURE_FRACTION,
		},
		assets.map((asset) => asset.symbol)
	);
	const curve: number[] = [];
	for (const ts of timestamps) {
		const steps = stepsOf.map((map) => map.get(ts) as CandleStep);
		assets.forEach((asset, idx) => {
			wallet.setPrice(asset.symbol, steps[idx].price);
		});
		curve.push(Number(wallet.valuation()) - simulator.initialCash);
		const signals = analysts.map((engine, idx) => {
			const network = assets[idx].analyst.genome.network;
			const market = applyInputMask(
				steps[idx].features.toFloat32Array(),
				network.inputMask
			);
			// An analyst observes no position: inputs past the market features stay 0.
			const padded = new Float32Array(network.inputDim);
			padded.set(market.subarray(0, network.inputDim));
			return toAssetSignal(engine.forward(padded).output);
		});
		const pooled = poolSignals(signals, pooling, input.attention);
		const { weights, exposure } = sectorDecision(
			signals.map(
				(signal) =>
					manager.forward(Float32Array.from([...fields(signal), ...pooled]))
						.output
			)
		);
		rebalance(
			wallet,
			assets.map((asset, idx) => ({
				symbol: asset.symbol,
				fill: steps[idx].fillPrice,
				share: weights[idx] * exposure,
				price: steps[idx].price,
			}))
		);
	}
	const marks = timestamps.map((timestamp) => ({
		timestamp,
		price: (stepsOf[0].get(timestamp) as CandleStep).price,
	}));
	return {
		...segmentRatios(new EpisodeScores(curve), barsPerYear(marks) ?? 1, marks),
		...wallet.costsPaid,
	};
}
