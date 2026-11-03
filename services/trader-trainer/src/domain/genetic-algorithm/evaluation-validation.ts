import type { EvaluationPnl } from "./evaluation-phase";
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

export function validateEvalResult(result: EvaluationPnl): void {
	for (const pnl of result.episodePnl) {
		invariant(Number.isFinite(pnl), `episode PnL must be finite, got ${pnl}`);
	}
	for (const delta of result.pnlCurve) {
		invariant(Number.isFinite(delta), `bar PnL must be finite, got ${delta}`);
	}
}
