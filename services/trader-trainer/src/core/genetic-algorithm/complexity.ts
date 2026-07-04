// ================================================================
//        network complexity scoring & topology constraints
// ================================================================

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

	let total = 0;

	// Input → first hidden
	total += net.inputDim * layers[0].neurons + layers[0].neurons;

	// Hidden → hidden
	for (let i = 1; i < layers.length; i++) {
		total += layers[i - 1].neurons * layers[i].neurons + layers[i].neurons;
		// Skip/residual projection overhead (only when dimensions differ)
		if (
			layers[i].connectionType !== "fully-connected" &&
			layers[i - 1].neurons !== layers[i].neurons
		) {
			total += layers[i - 1].neurons * layers[i].neurons;
		}
	}

	// Last hidden → output
	total += layers[layers.length - 1].neurons * net.outputDim + net.outputDim;

	return total;
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
export function checkTopologyConstraints(
	net: NetworkGenome,
	constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): TopologyViolation[] {
	const violations: TopologyViolation[] = [];
	const layers = net.hiddenLayers;

	if (layers.length > constraints.maxDepth) {
		violations.push({
			rule: "maxDepth",
			actual: layers.length,
			limit: constraints.maxDepth,
		});
	}

	layers.forEach((layer, index) => {
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
		if (
			constraints.skipConnectionsFromLayer1Only &&
			index === 0 &&
			(layer.connectionType === "dense-skip" ||
				layer.connectionType === "residual-connection")
		) {
			violations.push({
				rule: `layer[${index}].skipConnectionsFromLayer1Only`,
				actual: layer.connectionType,
				limit: "fully-connected at layer 0",
			});
		}
	});

	const totalParams = countParams(net);
	if (totalParams > constraints.maxTotalParams) {
		violations.push({
			rule: "maxTotalParams",
			actual: totalParams,
			limit: constraints.maxTotalParams,
		});
	}

	return violations;
}

// ----------------------------------------------------------------
// Penalised fitness
// ----------------------------------------------------------------

/**
 * Apply a complexity penalty to a raw fitness score.
 *
 * @param rawFitness  Fitness before penalty.
 * @param g           The genome.
 * @param lambda      Penalty coefficient (higher = stronger penalisation).
 * @param constraints Topology bounds used to normalise penalty.
 */
export function penalisedFitness(
	rawFitness: number,
	genome: Genome,
	lambda = 1e-4,
	constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): number {
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
