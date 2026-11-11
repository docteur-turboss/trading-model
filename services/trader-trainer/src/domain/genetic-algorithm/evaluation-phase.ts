import type { LamarckGenome, MarketStep } from "./genome-types";
import type { BackendFactory } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

export interface GenomeEvaluationContext {
	genome: DeepReadonly<LamarckGenome>;
	validationData: MarketStep[];
	backendFactory: BackendFactory;
}

/**
 * PnL of an evaluation, read from the wallet, never from the shaped reward:
 * the reward-shaping genes would otherwise let a genome rescale its own score.
 */
export interface EvaluationPnl {
	/** Final PnL of each evaluation episode. */
	episodePnl: number[];
	/**
	 * PnL change of every validation bar, episodes one after the other. A bar
	 * skipped by frameSkip counts 0: its price move lands on the next decision.
	 */
	pnlCurve: number[];
}

export interface EvaluationResult extends EvaluationPnl {
	updatedGenome: DeepReadonly<LamarckGenome>;
}

/**
 * Exploration while evaluating: a small fixed epsilon (the usual DQN
 * evaluation protocol), not the training schedule, which starts at
 * `epsilonStart` (1.0 by default) and would score mostly random trades. It
 * stays above 0 so the episodes differ and measure how robust the policy is.
 */
export const EVAL_EPSILON = 0.05;

/** The genome as evaluated: same weights and policy, evaluation exploration. */
function evaluationGenome(
	genome: DeepReadonly<LamarckGenome>
): DeepReadonly<LamarckGenome> {
	return {
		...genome,
		rl: {
			...genome.rl,
			discretePolicy: {
				...genome.rl.discretePolicy,
				epsilonStart: EVAL_EPSILON,
				epsilonMin: EVAL_EPSILON,
			},
		},
	} as DeepReadonly<LamarckGenome>;
}

/**
 * One episode over the whole validation window, whatever the genome's
 * maxEpisodeLength (a training horizon): every genome is judged on the same
 * bars.
 */
function _runEvalEpisode(
	ctx: GenomeEvaluationContext,
	pnlCurve: number[]
): number {
	const { genome, validationData, backendFactory } = ctx;
	const backend = backendFactory(evaluationGenome(genome));
	const frameSkip = genome.rl.horizon.frameSkip;
	const startPnl = Number(backend.getPnL());
	let lastPnl = startPnl;

	for (let index = 0; index < validationData.length; index++) {
		if (index % frameSkip !== 0) {
			pnlCurve.push(0);
			continue;
		}
		backend.step(validationData[index]);
		const pnl = Number(backend.getPnL());
		pnlCurve.push(pnl - lastPnl);
		lastPnl = pnl;
	}

	backend.resetEpisode();
	return lastPnl - startPnl;
}

export function evalPhase(ctx: GenomeEvaluationContext): EvaluationPnl {
	const numEpisodes = ctx.genome.gaControl.evaluation.episodesPerIndividual;
	const episodePnl: number[] = [];
	const pnlCurve: number[] = [];

	for (let ep = 0; ep < numEpisodes; ep++) {
		episodePnl.push(_runEvalEpisode(ctx, pnlCurve));
	}

	return { episodePnl, pnlCurve };
}
