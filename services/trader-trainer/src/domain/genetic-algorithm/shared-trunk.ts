import { createHash } from "node:crypto";
import type { LamarckGenome } from "./genome";
import type { DeepReadonly } from "./shared-types";

type Genome = DeepReadonly<LamarckGenome>;

/** Parameters of the output layer, the last block of the flat weights: one head. */
function headLength(genome: Genome): number {
	const { hiddenLayers, outputDim } = genome.network;
	return (hiddenLayers[hiddenLayers.length - 1].neurons + 1) * outputDim;
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

/** Hash of the hidden layers (all but the head): the same value in every asset model of the group (FEATURE_SHARED_TRUNK, ADR-0076 step 1). */
export function trunkSha256(weights: Float32Array, genome: Genome): string {
	const trunk = weights.subarray(0, weights.length - headLength(genome));
	return createHash("sha256")
		.update(new Uint8Array(trunk.buffer, trunk.byteOffset, trunk.byteLength))
		.digest("hex");
}

/**
 * The windows of the `count` symbols a generation trains and evaluates on
 * (ADR-0076 step 1): a circular slice of the group's symbols, moved by `count`
 * each generation from `seed`, so each symbol is seen the same number of times,
 * to one. `count` of N or more, or windows without a symbol: all the windows.
 */
export function rotatingWindowSets<Window extends { symbol?: string }>(
	windowSets: readonly Window[],
	count: number | undefined,
	seed: number,
	generation: number
): readonly Window[] {
	const symbols = [...new Set(windowSets.flatMap((ws) => ws.symbol ?? []))];
	if (!count || count >= symbols.length) {
		return windowSets;
	}
	const start = ((seed + generation - 1) * count) % symbols.length;
	const picked = new Set(
		Array.from(
			{ length: count },
			(_item, offset) => symbols[(start + offset) % symbols.length]
		)
	);
	return windowSets.filter((ws) => ws.symbol && picked.has(ws.symbol));
}
