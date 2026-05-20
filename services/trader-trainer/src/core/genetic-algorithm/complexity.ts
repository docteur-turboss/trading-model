// ================================================================
//        network complexity scoring & topology constraints
// ================================================================

import type { Genome, NetworkGenome } from './genome-types';

// ----------------------------------------------------------------
// Topology constraints (configurable per experiment)
// ----------------------------------------------------------------

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

/**
 * Estimate the number of trainable parameters in the network.
 *
 * Counting rule:
 *   - Input → first hidden:  inputDim × h[0].neurons + h[0].neurons (bias)
 *   - Hidden i → i+1:        h[i].neurons × h[i+1].neurons + h[i+1].neurons
 *   - Last hidden → output:  h[last].neurons × outputDim + outputDim
 *
 * Skip/residual connections add identity projections when width changes —
 * we approximate the overhead as +inputDim×h[i].neurons per skip-capable layer.
 */
export function countParams(net: NetworkGenome): number {
  const layers = net.hiddenLayers;
  if (layers.length === 0) return net.inputDim * net.outputDim + net.outputDim;

  let total = 0;

  // Input → first hidden
  total += net.inputDim * layers[0].neurons + layers[0].neurons;

  // Hidden → hidden
  for (let i = 1; i < layers.length; i++) {
    total += layers[i - 1].neurons * layers[i].neurons + layers[i].neurons;
    // Skip/residual projection overhead (only when dimensions differ)
    if (
      layers[i].connectionType !== 'fully-connected' &&
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
  g: Genome,
  constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): number {
  const params = countParams(g.network);
  const depth = g.network.hiddenLayers.length;
  return Math.log1p(params) * (1 + depth / Math.max(1, constraints.maxDepth));
}

// ----------------------------------------------------------------
// Topology violation report
// ----------------------------------------------------------------

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
      rule: 'maxDepth',
      actual: layers.length,
      limit: constraints.maxDepth,
    });
  }

  layers.forEach((l, i) => {
    if (l.neurons > constraints.maxNeuronsPerLayer) {
      violations.push({
        rule: `layer[${i}].maxNeuronsPerLayer`,
        actual: l.neurons,
        limit: constraints.maxNeuronsPerLayer,
      });
    }
    if (l.neurons < constraints.minNeuronsPerLayer) {
      violations.push({
        rule: `layer[${i}].minNeuronsPerLayer`,
        actual: l.neurons,
        limit: constraints.minNeuronsPerLayer,
      });
    }
    if (
      constraints.skipConnectionsFromLayer1Only &&
      i === 0 &&
      (l.connectionType === 'dense-skip' || l.connectionType === 'residual-connection')
    ) {
      violations.push({
        rule: `layer[${i}].skipConnectionsFromLayer1Only`,
        actual: l.connectionType,
        limit: 'fully-connected at layer 0',
      });
    }
  });

  const totalParams = countParams(net);
  if (totalParams > constraints.maxTotalParams) {
    violations.push({
      rule: 'maxTotalParams',
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
  g: Genome,
  lambda = 1e-4,
  constraints: TopologyConstraints = DEFAULT_TOPOLOGY_CONSTRAINTS
): number {
  const cs = complexityScore(g, constraints);
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
  return violations.length > 0 ? -Infinity : rawFitness;
}
