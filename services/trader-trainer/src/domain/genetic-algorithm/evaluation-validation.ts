import type { WindowSet } from "./generation-types";
import type { LamarckGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";

function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`[Invariant] ${message}`);
	}
}

export function validateGenomeInputs(
	genome: DeepReadonly<LamarckGenome>,
	windowSet: WindowSet
): void {
	invariant(genome.network.inputDim > 0, "inputDim must be positive");
	invariant(genome.network.outputDim > 0, "outputDim must be positive");
	invariant(
		genome.rl.rewardShaping?.clipBounds !== null &&
			typeof genome.rl.rewardShaping.clipBounds.lo === "number" &&
			typeof genome.rl.rewardShaping.clipBounds.hi === "number",
		"rewardShaping.clipBounds must have numeric lo/hi"
	);
	invariant(windowSet.train.length > 0, "windowSet.train must not be empty");
	invariant(
		windowSet.validation.length > 0,
		"windowSet.validation must not be empty"
	);
}

export function validateEvalResult(result: {
	rawScores: number[];
	finalPnL: number;
}): void {
	invariant(
		Number.isFinite(result.finalPnL),
		`finalPnL must be finite, got ${result.finalPnL}`
	);
	for (const score of result.rawScores) {
		invariant(Number.isFinite(score), `rawScore must be finite, got ${score}`);
	}
}
