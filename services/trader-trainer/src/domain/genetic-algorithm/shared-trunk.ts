import { createHash } from "node:crypto";
import type { LamarckGenome } from "./genome";
import type { DeepReadonly } from "./shared-types";

type Genome = DeepReadonly<LamarckGenome>;

/** Parameters of the output layer, the last block of the flat weights: one head. */
function headLength(genome: Genome): number {
	const { hiddenLayers, outputDim } = genome.network;
	return (hiddenLayers[hiddenLayers.length - 1].neurons + 1) * outputDim;
}

/** Hidden layers: shared by every symbol of the group (FEATURE_SHARED_TRUNK, ADR-0076 step 1). */
export function trunkOf(weights: Float32Array, genome: Genome): Float32Array {
	return weights.subarray(0, weights.length - headLength(genome));
}

/** The genome ready to train on `symbol`: its own head when it has one, else the trunk's current one. */
export function withHeadOf(genome: Genome, symbol: string): Genome {
	const head = genome.heads?.[symbol];
	const weights = genome.trainedWeights;
	if (!(head && weights) || head.length !== headLength(genome)) {
		return genome;
	}
	const merged = (weights as Float32Array).slice();
	merged.set(head, merged.length - head.length);
	return { ...genome, trainedWeights: merged };
}

/** Keeps the head just trained for `symbol` apart, so the next symbol cannot overwrite it. */
export function keepHead(genome: Genome, symbol: string): Genome {
	const weights = genome.trainedWeights;
	if (!weights) {
		return genome;
	}
	const head = (weights as Float32Array).slice(
		weights.length - headLength(genome)
	);
	return { ...genome, heads: { ...genome.heads, [symbol]: head } };
}

/** The weights of `symbol`'s model: the group's trunk and its own head. */
export function weightsOf(genome: Genome, symbol: string): Float32Array {
	return (withHeadOf(genome, symbol).trainedWeights as Float32Array).slice();
}

/** Hash of the trunk bytes: the same value in every asset model of the group. */
export function trunkSha256(weights: Float32Array, genome: Genome): string {
	const trunk = trunkOf(weights, genome);
	return createHash("sha256")
		.update(new Uint8Array(trunk.buffer, trunk.byteOffset, trunk.byteLength))
		.digest("hex");
}
