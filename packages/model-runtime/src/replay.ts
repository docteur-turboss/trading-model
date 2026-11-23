import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	Cash,
	Percentage,
	PositiveInt,
	Price,
} from "@trading-model/primitives/primitives";
import type { ActionSetId } from "./agent/action-mapper";
import {
	barsSinceInput,
	type HorizonGenome,
	playEpisode,
} from "./agent/decision-events";
import { TradingAgent, type TradingAgentConfig } from "./agent/trading-agent";
import { DEFAULT_MAX_EXPOSURE_FRACTION } from "./env/wallet-config";
import { EpisodeScores } from "./episode-scores";
import {
	type CandleStep,
	candleSteps,
	contiguousCandles,
	isConsistentCandle,
} from "./features/feature-builder";
import { FeedForwardEngine } from "./neural-network/feed-forward-engine";
import { setWeights } from "./neural-network/network-serialization";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	type LayerMemory,
	mergeConfig,
	type NormalisationType,
} from "./neural-network/type";
import {
	barsPerYear,
	type SegmentRatios,
	segmentRatios,
} from "./replay-metrics";

/** The genes of a manifest genome (ADR-0022) that decide how the model plays. */
export interface PolicyGenome {
	network: {
		inputDim: number;
		outputDim: number;
		hiddenLayers: readonly {
			neurons: number;
			activation: ActivationType;
			connectionType?: ConnectionType;
			biasType?: InitialisationType;
		}[];
		normalization: NormalisationType;
		actionSet?: ActionSetId;
		inputMask?: readonly boolean[];
	};
	rl: { horizon: HorizonGenome };
}

/** Simulator of the manifest `replay` block (ADR-0066, ADR-0079). */
export interface SimulatorParams {
	initialCash: number;
	feeRate: number;
	executionCostRate: number;
	tradeFraction: number;
	observePosition: boolean;
	/** Cap the model was trained with (manifest `riskLimits`); default when absent. */
	maxExposureFraction?: number;
}

/** Network shape of a genome; the trainer adds its training settings. */
export function policyNetworkConfig(network: PolicyGenome["network"]) {
	return {
		neuronsByLayer: [
			network.inputDim,
			...network.hiddenLayers.map((layer) => layer.neurons),
			network.outputDim,
		].map((size) => PositiveInt.of(size)),
		// Q-values are unbounded, so the output layer stays linear.
		activationType: [
			...network.hiddenLayers.map((layer) => layer.activation),
			ActivationType.Linear,
		],
		connectionType:
			network.hiddenLayers[0]?.connectionType ?? ConnectionType.FullyConnected,
		biasInitialisationType:
			network.hiddenLayers[0]?.biasType ?? InitialisationType.Random,
		normalisationType: network.normalization,
	};
}

/** How a genome trades on a simulator. */
export function policyAgentConfig(
	network: PolicyGenome["network"],
	simulator: SimulatorParams
): TradingAgentConfig {
	return {
		actionSet: network.actionSet,
		wallet: {
			initialCash: Cash.of(simulator.initialCash),
			initialPrice: Price.of(1),
			feeRate: Percentage.of(simulator.feeRate),
			executionCostRate: Percentage.of(simulator.executionCostRate),
			maxExposureFraction:
				simulator.maxExposureFraction ?? DEFAULT_MAX_EXPOSURE_FRACTION,
		},
		tradeFraction: simulator.tradeFraction,
		inputMask: network.inputMask,
		observePosition: simulator.observePosition,
	};
}

function emptyLayer(fanIn: number, fanOut: number): LayerMemory {
	const zeros = () => new Float32Array(fanOut);
	return {
		fanIn: PositiveInt.of(fanIn),
		fanOut: PositiveInt.of(fanOut),
		weights: new Float32Array(fanIn * fanOut),
		bias: zeros(),
		gradW: new Float32Array(fanIn * fanOut),
		gradB: zeros(),
	};
}

/** A greedy agent on the published weights; throws when they do not fit the network. */
function greedyAgent(
	genome: PolicyGenome,
	weights: Float32Array,
	simulator: SimulatorParams
): TradingAgent {
	const config = mergeConfig(policyNetworkConfig(genome.network));
	const sizes = config.neuronsByLayer;
	const layers = sizes
		.slice(1)
		.map((fanOut, idx) => emptyLayer(sizes[idx], fanOut));
	setWeights(layers, weights);
	return new TradingAgent(
		{
			...policyAgentConfig(genome.network, simulator),
			stateManagerCfg: { epsilonStart: 0, epsilonMin: 0 },
		},
		new FeedForwardEngine(config, layers)
	);
}

const stepOf = (agent: TradingAgent, step: CandleStep, barsSince?: number) =>
	agent.step(
		step.features.toFloat32Array(),
		step.price,
		step.fillPrice,
		barsSinceInput(barsSince)
	);

/**
 * Replays a published model greedily (epsilon 0, ADR-0079 §3) on the candles
 * of its window, cleaned as the trainer does (consistent OHLC, last gap-free
 * run): features are normalised from its first candle, the episode
 * runs over the test steps (`testFrom` onwards), and the ratios are those of
 * the ADR-0069 admission, plus the fees and execution cost paid over the
 * replay. Throws when the weights do not fit the network.
 */
export function replayModel(input: {
	genome: PolicyGenome;
	weights: Float32Array;
	testFrom: number;
	simulator: SimulatorParams;
	candles: CandleData[];
}): SegmentRatios & { feesPaid: number; executionCostPaid: number } {
	const { genome } = input;
	const test = candleSteps(
		contiguousCandles(input.candles.filter(isConsistentCandle))
	).filter((step) => step.timestamp >= input.testFrom);
	const agent = greedyAgent(genome, input.weights, input.simulator);
	const curve: number[] = [];
	playEpisode(
		test,
		genome.rl.horizon,
		{
			step: (step, barsSince) => stepOf(agent, step, barsSince),
			pnl: () => Number(agent.wallet.getPnL()),
		},
		curve
	);
	return {
		...segmentRatios(new EpisodeScores(curve), barsPerYear(test) ?? 1, test),
		...agent.wallet.getCostsPaid(),
	};
}

/** The order a model wants on the last closed bar of a window (ADR-0087). */
export interface LastBarDecision {
	/** Open time of the bar decided on: the caller checks it is the bar it expects. */
	barTimestamp: number;
	/** Close of that bar. */
	price: number;
	/** Undefined when the model holds, does not decide on this bar, or cannot trade. */
	order?: { side: "buy" | "sell"; quantity: number };
}

/**
 * Plays the model greedily over `candles` (cleaned as in the replay) on a
 * simulated wallet and returns what it does on the last bar: the quantity is
 * the wallet's move, so `share` and the exposure cap of the genome apply. The
 * wallet starts at the window's first bar, so the same window gives the same
 * answer. Undefined when the window has no step.
 */
export function decideOnLastBar(input: {
	genome: PolicyGenome;
	weights: Float32Array;
	simulator: SimulatorParams;
	candles: CandleData[];
}): LastBarDecision | undefined {
	const steps = candleSteps(
		contiguousCandles(input.candles.filter(isConsistentCandle))
	);
	const last = steps[steps.length - 1];
	if (!last) {
		return undefined;
	}
	const agent = greedyAgent(input.genome, input.weights, input.simulator);
	let delta = 0;
	playEpisode(
		steps,
		input.genome.rl.horizon,
		{
			step: (step, barsSince) => {
				const before = Number(agent.wallet.getPosition());
				stepOf(agent, step, barsSince);
				delta = step === last ? Number(agent.wallet.getPosition()) - before : 0;
			},
			pnl: () => Number(agent.wallet.getPnL()),
		},
		[]
	);
	return {
		barTimestamp: last.timestamp,
		price: Number(last.price),
		order:
			delta === 0
				? undefined
				: { side: delta > 0 ? "buy" : "sell", quantity: Math.abs(delta) },
	};
}
