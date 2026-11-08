import { NormalizationStats } from "../normalization-stats";
import type { LamarckGenome, MarketStep } from "./genome-types";
import { RewardShaper } from "./reward-shaping";
import type { RLBackend, Transition } from "./rl-backend";
import type { DeepReadonly } from "./shared-types";

interface TrainPhaseContext {
	backend: RLBackend;
	trainData: MarketStep[];
	genome: DeepReadonly<LamarckGenome>;
}

/** A decision waiting for its n-step return. */
interface PendingDecision {
	state: Float32Array;
	action: number;
	/** Shaped reward, known once the next decision's price came. */
	reward?: number;
}

/** Σ γ^i · r_i over the settled rewards of `decisions`, oldest first. */
function _nStepReturn(decisions: PendingDecision[], gamma: number): number {
	return decisions.reduce(
		(sum, decision, idx) => sum + gamma ** idx * (decision.reward ?? 0),
		0
	);
}

/**
 * Stores transitions one behind, so the last one of the episode can still
 * take a sparse genome's episode reward, and replays after each store.
 */
class TransitionWriter {
	private _held: Transition | null = null;
	private readonly _batchSize: number;
	private readonly _discount: number;

	constructor(
		private readonly _backend: RLBackend,
		genome: DeepReadonly<LamarckGenome>
	) {
		this._batchSize = genome.rl.replayBuffer.batchSize;
		this._discount = genome.rl.gamma ** genome.rl.horizon.nStepReturn;
	}

	write(transition: Transition): void {
		this._flushHeld();
		this._held = transition;
	}

	/**
	 * Ends the episode. The end of the training window truncates the market,
	 * it does not end it: transitions keep their bootstrap, except for a
	 * sparse genome, whose last transition takes the episode reward as a
	 * terminal one.
	 */
	close(sparseBonus: number | null): void {
		if (this._held && sparseBonus !== null) {
			this._held = {
				...this._held,
				reward: this._held.reward + sparseBonus,
				done: true,
			};
		}
		this._flushHeld();
	}

	private _flushHeld(): void {
		if (this._held) {
			this._backend.remember(this._held);
			this._backend.replay(this._batchSize, this._discount);
		}
		this._held = null;
	}
}

/**
 * One training episode of DQN on the agent's own experience: each decision
 * is stored with its n-step return (discount γ^n on the bootstrapped value),
 * and every stored transition triggers a minibatch replay.
 *
 * The reward of a decision is the wallet PnL it earned until the next
 * decision (frameSkip bars later). Only complete n-step transitions are
 * stored: the last n decisions of the window, whose return the window cuts
 * short, are not.
 */
export function trainPhase(ctx: TrainPhaseContext): void {
	const { backend, trainData, genome } = ctx;
	const { horizon, gamma } = genome.rl;
	const shaper = new RewardShaper(
		genome.rl.rewardShaping,
		new NormalizationStats()
	);
	const writer = new TransitionWriter(backend, genome);
	const maxT = Math.min(trainData.length, horizon.maxEpisodeLength);
	const pending: PendingDecision[] = [];

	for (let index = 0; index < maxT; index += horizon.frameSkip) {
		const { features, price } = trainData[index];
		const { reward, action, state } = backend.step({ features, price });
		const last = pending[pending.length - 1];
		if (last) {
			last.reward = shaper.shape(reward);
		}
		if (pending.length === horizon.nStepReturn) {
			const head = pending.shift() as PendingDecision;
			writer.write({
				state: head.state,
				action: head.action,
				reward: _nStepReturn([head, ...pending], gamma),
				nextState: state,
				done: false,
			});
		}
		pending.push({ state, action });
	}

	writer.close(genome.rl.rewardShaping.sparse ? shaper.episodeBonus() : null);
}
