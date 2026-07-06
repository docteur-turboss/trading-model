// ================================================================
//        network complexity scoring & topology constraints
// ================================================================

import { ConnectionType } from "../neural-network/type";
import type { Genome, NetworkGenome } from "./genome-types";

// ----------------------------------------------------------------
// Topology constraints (configurable per experiment)
// ----------------------------------------------------------------

/** Bounds that define how complex a network topology is allowed to be. */
export interface TopologyConstraints {
	/** Maximum number of hidden layers */
	maxDepth: number;
	/** Maximum neurons in any single hidden layer */
	maxNeuronsPerLayer: number;
	/** Maximum total trainable parameters (weights + biases) */
	maxTotalParams: number;
	/** If true, residual/skip connections are only allowed after the first layer */
	skipConnectionsFromLayer1Only: boolean;
	/** Minimum neurons per hidden layer */
	minNeuronsPerLayer: number;
}

/** Sensible default topology bounds for a trading-agent network. */
export const DEFAULT_TOPOLOGY_CONSTRAINTS: TopologyConstraints = {
	maxDepth: 8,
	maxNeuronsPerLayer: 512,
	maxTotalParams: 2_000_000,
	skipConnectionsFromLayer1Only: false,
	minNeuronsPerLayer: 1,
};

// ----------------------------------------------------------------
// Parameter counting
// ----------------------------------------------------------------

/** Count total trainable parameters (weights + biases) in a network topology. */
export function countParams(net: NetworkGenome): number {
	const layers = net.hiddenLayers;
	if (layers.length === 0) {
		return net.inputDim * net.outputDim + net.outputDim;
	}
	return _countInputToFirstHidden(net, layers) +
		_countHiddenToHidden(layers) +
		_countLastHiddenToOutput(layers, net.outputDim);
}

function _countInputToFirstHidden(net: NetworkGenome, layers: NetworkGenome["hiddenLayers"]): number {
	return net.inputDim * layers[0].neurons + layers[0].neurons;
}

function _countHiddenToHidden(layers: NetworkGenome["hiddenLayers"]): number {
	let total = 0;
	for (let i = 1; i < layers.length; i++) {
		total += layers[i - 1].neurons * layers[i].neurons + layers[i].neurons;
		if (layers[i].connectionType !== ConnectionType.FullyConnected && layers[i - 1].neurons !== layers[i].neurons) {
			total += layers[i - 1].neurons * layers[i].neurons;
		}
	}
	return total;
}

function _countLastHiddenToOutput(layers: NetworkGenome["hiddenLayers"], outputDim: number): number {
	return layers[layers.length - 1].neurons * outputDim + outputDim;
}

// ----------------------------------------------------------------
// Complexity score  ∈ [0, ∞)
// ----------------------------------------------------------------

/**
 * Returns a scalar representing architectural complexity.
 * Higher = more complex = higher penalty.
 *
 * Formula:
 *   complexity = log(1 + totalParams) × (1 + depth / maxDepth)
 *
 * The depth factor penalises deep networks disproportionately because
 * gradient flow and evaluation cost both scale with depth.
 */
export function complexityScore(
	genome: Genome,
	constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): number {
	const params = countParams(genome.network);
	const depth = genome.network.hiddenLayers.length;
	return Math.log1p(params) * (1 + depth / Math.max(1, constraints.maxDepth));
}

// ----------------------------------------------------------------
// Topology violation report
// ----------------------------------------------------------------

/** Describes a single topology constraint that a network violates. */
export interface TopologyViolation {
	rule: string;
	actual: number | string;
	limit: number | string;
}

/**
 * Returns a list of constraint violations.
 * Empty list means the network is within bounds.
 */
function _checkNeuronBounds(
	layer: NetworkGenome["hiddenLayers"][number],
	index: number,
	constraints: TopologyConstraints
): TopologyViolation[] {
	const violations: TopologyViolation[] = [];
	if (layer.neurons > constraints.maxNeuronsPerLayer) {
		violations.push({
			rule: `layer[${index}].maxNeuronsPerLayer`,
			actual: layer.neurons,
			limit: constraints.maxNeuronsPerLayer,
		});
	}
	if (layer.neurons < constraints.minNeuronsPerLayer) {
		violations.push({
			rule: `layer[${index}].minNeuronsPerLayer`,
			actual: layer.neurons,
			limit: constraints.minNeuronsPerLayer,
		});
	}
	return violations;
}

function _checkSkipConnectionConstraint(
	layer: NetworkGenome["hiddenLayers"][number],
	index: number,
	constraints: TopologyConstraints
): TopologyViolation[] {
	if (
		constraints.skipConnectionsFromLayer1Only &&
		index === 0 &&
		(layer.connectionType === ConnectionType.DenseSkip || layer.connectionType === ConnectionType.ResidualConnection)
	) {
		return [{
			rule: `layer[${index}].skipConnectionsFromLayer1Only`,
			actual: layer.connectionType,
			limit: "fully-connected at layer 0",
		}];
	}
	return [];
}

function checkLayerViolations(
	layer: NetworkGenome["hiddenLayers"][number],
	index: number,
	constraints: TopologyConstraints
): TopologyViolation[] {
	return [
		..._checkNeuronBounds(layer, index, constraints),
		..._checkSkipConnectionConstraint(layer, index, constraints),
	];
}

function _checkMaxDepth(
	layers: NetworkGenome["hiddenLayers"],
	constraints: TopologyConstraints
): TopologyViolation[] {
	if (layers.length > constraints.maxDepth) {
		return [{
			rule: "maxDepth",
			actual: layers.length,
			limit: constraints.maxDepth,
		}];
	}
	return [];
}

function _checkMaxTotalParams(
	net: NetworkGenome,
	constraints: TopologyConstraints
): TopologyViolation[] {
	const totalParams = countParams(net);
	if (totalParams > constraints.maxTotalParams) {
		return [{
			rule: "maxTotalParams",
			actual: totalParams,
			limit: constraints.maxTotalParams,
		}];
	}
	return [];
}

export function checkTopologyConstraints(
	net: NetworkGenome,
	constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): TopologyViolation[] {
	const layers = net.hiddenLayers;
	const violations: TopologyViolation[] = [
		..._checkMaxDepth(layers, constraints),
		..._checkMaxTotalParams(net, constraints),
	];

	layers.forEach((layer, index) => {
		violations.push(...checkLayerViolations(layer, index, constraints));
	});

	return violations;
}

// ----------------------------------------------------------------
// Penalised fitness
// ----------------------------------------------------------------

export interface PenalisedFitnessOptions {
	rawFitness: number;
	genome: Genome;
	lambda?: number;
	constraints?: TopologyConstraints;
}

/**
 * Apply a complexity penalty to a raw fitness score.
 *
 * @param rawFitness  Fitness before penalty.
 * @param g           The genome.
 * @param lambda      Penalty coefficient (higher = stronger penalisation).
 * @param constraints Topology bounds used to normalise penalty.
 */
export function penalisedFitness(options: PenalisedFitnessOptions): number {
	const {
		rawFitness,
		genome,
		lambda = 1e-4,
		constraints = DEFAULT_TOPOLOGY_CONSTRAINTS,
	} = options;
	const cs = complexityScore(genome, constraints);
	return rawFitness - lambda * cs;
}

/**
 * Hard rejection: returns -Infinity if any topology constraint is violated.
 * Useful when constraints are strict requirements, not soft preferences.
 */
export function rejectIfViolating(
	rawFitness: number,
	net: NetworkGenome,
	constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): number {
	const violations = checkTopologyConstraints(net, constraints);
	return violations.length > 0 ? Number.NEGATIVE_INFINITY : rawFitness;
}
