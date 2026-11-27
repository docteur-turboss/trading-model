import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	Cash,
	Percentage,
	Price,
	Volume,
} from "@trading-model/primitives/primitives";
import { applyInputMask } from "./agent/input-mask";
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
export type PoolingMode = "mean" | "mean+max";

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
export const managerInputDim = (pooling: PoolingMode): number =>
	SIGNAL_DIM * (pooling === "mean" ? 2 : 3);

/** Permutation-invariant view of the group: per field the mean (and the max). */
export function poolSignals(
	signals: readonly AssetSignal[],
	pooling: PoolingMode
): number[] {
	const rows = signals.map(fields);
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

/** Limits the allocator trains under and production clips to (ADR-0076 §8, Q3). */
export interface AllocatorLimits {
	/** Largest invested share of the equity. */
	maxExposureFraction: number;
	/** Largest share of the equity in one sector. */
	maxConcentration: number;
}

/** Allocator inputs besides the sectors' views: the two limits. */
const LIMIT_INPUTS = 2;
/** Per sector: pooled mean of the signal fields plus the manager's exposure. */
const SECTOR_VIEW_DIM = SIGNAL_DIM + 1;

/** Input size of the allocator network for `sectors` sectors. */
export const allocatorInputDim = (sectors: number): number =>
	sectors * SECTOR_VIEW_DIM + LIMIT_INPUTS;

/**
 * Sector shares of the equity from the allocator's raw outputs (one per
 * sector, then cash): softmax, each share clipped to the concentration limit,
 * the total scaled to the exposure limit. Holds whatever the network says.
 */
export function clipAllocation(
	outputs: ArrayLike<number>,
	limits: AllocatorLimits
): number[] {
	const raw = Array.from(outputs);
	const top = Math.max(...raw);
	const exps = raw.map((value) => Math.exp(value - top));
	const total = exps.reduce((sum, value) => sum + value, 0);
	const capped = exps
		.slice(0, -1)
		.map((value) => Math.min(value / total, limits.maxConcentration));
	const invested = capped.reduce((sum, value) => sum + value, 0);
	const scale =
		invested > limits.maxExposureFraction
			? limits.maxExposureFraction / invested
			: 1;
	return capped.map((value) => value * scale);
}

/**
 * Replays sectors (ADR-0076 §3, §7) on one shared-cash portfolio, filling at
 * the next bar's open (ADR-0066): analysts read their own asset, each manager
 * pools its analysts' signals and picks weights and exposure. One sector and
 * no allocator: the manager's exposure is the share. Several sectors: the
 * allocator picks the sector shares and the cash, clipped to its limits. Only
 * the bars every asset has, from `testFrom`, are played. Throws when a
 * network does not fit, or when assets share fewer than 2 bars.
 */
export function replaySectors(input: {
	sectors: readonly {
		assets: readonly {
			symbol: string;
			analyst: SectorNetwork;
			candles: CandleData[];
		}[];
		manager: SectorNetwork;
		pooling: PoolingMode;
	}[];
	allocator?: { network: SectorNetwork; limits: AllocatorLimits };
	testFrom: number;
	simulator: SimulatorParams;
}): SegmentRatios & { feesPaid: number; executionCostPaid: number } {
	const { sectors, allocator, simulator } = input;
	for (const sector of sectors) {
		const managerNet = sector.manager.genome.network;
		if (managerNet.inputDim !== managerInputDim(sector.pooling)) {
			throw new Error("manager input size does not match the pooling mode");
		}
		if (managerNet.outputDim !== MANAGER_OUTPUT_DIM) {
			throw new Error(`manager outputs ${MANAGER_OUTPUT_DIM} values`);
		}
	}
	if (allocator) {
		const net = allocator.network.genome.network;
		if (
			net.inputDim !== allocatorInputDim(sectors.length) ||
			net.outputDim !== sectors.length + 1
		) {
			throw new Error("allocator network does not fit the sectors");
		}
	} else if (sectors.length !== 1) {
		throw new Error("several sectors need an allocator");
	}
	const assets = sectors.flatMap((sector) => sector.assets);
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
	const managers = sectors.map((sector) =>
		inferenceEngine(sector.manager.genome.network, sector.manager.weights)
	);
	const allocatorEngine = allocator
		? inferenceEngine(
				allocator.network.genome.network,
				allocator.network.weights
			)
		: undefined;
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
		let offset = 0;
		const decided = sectors.map((sector, idx) => {
			const own = signals.slice(offset, offset + sector.assets.length);
			offset += own.length;
			const pooled = poolSignals(own, sector.pooling);
			return {
				pooled,
				...sectorDecision(
					own.map(
						(signal) =>
							managers[idx].forward(
								Float32Array.from([...fields(signal), ...pooled])
							).output
					)
				),
			};
		});
		const sectorShares =
			allocator && allocatorEngine
				? clipAllocation(
						allocatorEngine.forward(
							Float32Array.from([
								...decided.flatMap((sector) => [
									...sector.pooled.slice(0, SIGNAL_DIM),
									sector.exposure,
								]),
								allocator.limits.maxExposureFraction,
								allocator.limits.maxConcentration,
							])
						).output,
						allocator.limits
					)
				: [decided[0].exposure];
		rebalance(
			wallet,
			decided.flatMap((sector, sectorIdx) =>
				sector.weights.map((weight, pos) => {
					const idx = sectors
						.slice(0, sectorIdx)
						.reduce((sum, item) => sum + item.assets.length, pos);
					return {
						symbol: assets[idx].symbol,
						fill: steps[idx].fillPrice,
						share: weight * sectorShares[sectorIdx],
						price: steps[idx].price,
					};
				})
			)
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

/** One sector: the replay of step 4. */
export function replaySector(input: {
	assets: Parameters<typeof replaySectors>[0]["sectors"][number]["assets"];
	manager: SectorNetwork;
	pooling: PoolingMode;
	testFrom: number;
	simulator: SimulatorParams;
}): ReturnType<typeof replaySectors> {
	const { testFrom, simulator, ...sector } = input;
	return replaySectors({ sectors: [sector], testFrom, simulator });
}
