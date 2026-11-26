import { Volume } from "@trading-model/primitives/primitives";
import { TradeAction } from "./action-types";

interface ActionMap {
	action: TradeAction;
	amount: Volume;
	share?: number;
	/** Output unit that drove the decision; the one Q-learning updates. */
	outputIndex: number;
}

interface ActionMapperConfig {
	tradeAmount?: Volume;
	actionSet?: ActionSetId;
	/** Uniform [0, 1) source for exploration; seed it to replay a run. */
	rng?: () => number;
}

interface ActionEntry {
	action: TradeAction;
	share?: number;
}

/**
 * Closed list of action spaces (ADR-0076): output unit i is the Q-value of
 * `ACTION_SETS[id][i]`. `share` is the fraction of the room left under
 * `riskLimits.maxExposureFraction` (buy) or of the held position (sell);
 * without it the order is the fixed `tradeAmount`.
 */
export const ACTION_SETS = {
	sell_hold_buy: [
		{ action: TradeAction.Sell },
		{ action: TradeAction.Hold },
		{ action: TradeAction.Buy },
	],
	sized_50_100: [
		{ action: TradeAction.Sell, share: 1 },
		{ action: TradeAction.Sell, share: 0.5 },
		{ action: TradeAction.Hold },
		{ action: TradeAction.Buy, share: 0.5 },
		{ action: TradeAction.Buy, share: 1 },
	],
	sized_25_50_100: [
		{ action: TradeAction.Sell, share: 1 },
		{ action: TradeAction.Sell, share: 0.5 },
		{ action: TradeAction.Sell, share: 0.25 },
		{ action: TradeAction.Hold },
		{ action: TradeAction.Buy, share: 0.25 },
		{ action: TradeAction.Buy, share: 0.5 },
		{ action: TradeAction.Buy, share: 1 },
	],
} as const satisfies Record<string, readonly ActionEntry[]>;

export type ActionSetId = keyof typeof ACTION_SETS;
export const DEFAULT_ACTION_SET: ActionSetId = "sell_hold_buy";
export const ACTION_SET_IDS = Object.keys(ACTION_SETS) as ActionSetId[];

export function actionLabels(id: ActionSetId): string[] {
	return (ACTION_SETS[id] as readonly ActionEntry[]).map((entry) =>
		entry.share === undefined
			? entry.action
			: `${entry.action}_${Math.round(entry.share * 100)}`
	);
}

function _greedyAction(output: Float32Array): number {
	if (output.some((value) => !Number.isFinite(value))) {
		throw new Error("Q-values are not finite: the network diverged");
	}
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
	private readonly _actions: readonly ActionEntry[];
	private readonly _rng: (() => number) | undefined;

	constructor(config: ActionMapperConfig = {}) {
		this._amount = config.tradeAmount ?? Volume.of(1);
		this._actions = ACTION_SETS[config.actionSet ?? DEFAULT_ACTION_SET];
		this._rng = config.rng;
	}

	map(output: Float32Array, epsilon?: number): ActionMap {
		// Math.random is read at call time when no seeded source was given.
		const rng = this._rng ?? Math.random;
		const idx =
			epsilon !== undefined && rng() < epsilon
				? Math.floor(rng() * output.length)
				: _greedyAction(output);
		const { action, share } = this._actions[idx] ?? {
			action: TradeAction.Hold,
		};
		return {
			action,
			share,
			amount: action === TradeAction.Hold ? Volume.zero() : this._amount,
			outputIndex: idx,
		};
	}
}
