import { Volume } from "@trading-model/primitives/primitives";
import { TradeAction } from "./action-types";

interface ActionMap {
	action: TradeAction;
	amount: Volume;
	/** Output unit that drove the decision; the one Q-learning updates. */
	outputIndex: number;
}

interface ActionMapperConfig {
	tradeAmount?: Volume;
	/** Uniform [0, 1) source for exploration; seed it to replay a run. */
	rng?: () => number;
}

/** One Q-value per action: output unit i is the value of DISCRETE_ACTIONS[i]. */
const DISCRETE_ACTIONS: ReadonlyMap<number, TradeAction> = new Map([
	[0, TradeAction.Sell],
	[1, TradeAction.Hold],
	[2, TradeAction.Buy],
]);

function _greedyAction(output: Float32Array): number {
	let idx = 0;
	for (let i = 1; i < output.length; i++) {
		if (output[i] > output[idx]) {
			idx = i;
		}
	}
	return idx;
}

/** Epsilon-greedy over the Q-values: a random action with probability epsilon. */
export class ActionMapper {
	private readonly _amount: Volume;
	private readonly _rng: (() => number) | undefined;

	constructor(config: ActionMapperConfig = {}) {
		this._amount = config.tradeAmount ?? Volume.of(1);
		this._rng = config.rng;
	}

	map(output: Float32Array, epsilon?: number): ActionMap {
		// Math.random is read at call time when no seeded source was given.
		const rng = this._rng ?? Math.random;
		const idx =
			epsilon !== undefined && rng() < epsilon
				? Math.floor(rng() * output.length)
				: _greedyAction(output);
		const action = DISCRETE_ACTIONS.get(idx) ?? TradeAction.Hold;
		return {
			action,
			amount: action === TradeAction.Hold ? Volume.zero() : this._amount,
			outputIndex: idx,
		};
	}
}
