import type { NumericRange } from "@trading-model/primitives/numeric-range";
import type { LamarckGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";
import type { RunningStats } from "./utils";

type RewardShapingGenes = DeepReadonly<LamarckGenome["rl"]["rewardShaping"]>;

function _scaleAndClip(raw: number, config: RewardShapingGenes): number {
	let shaped = raw;
	if (config.scale) {
		shaped *= config.scaleFactor;
	}
	if (config.clip) {
		shaped = (config.clipBounds as unknown as NumericRange).clamp(shaped);
	}
	return shaped;
}

/**
 * Turns the wallet rewards of the trained agent into what it learns from,
 * following the reward-shaping genes. Fitness never reads it: it is computed
 * on the wallet PnL (evaluation-phase), so these genes change how a genome
 * learns, not how it is judged.
 */
export class RewardShaper {
	private _total = 0;

	constructor(
		private readonly _config: RewardShapingGenes,
		private readonly _stats?: RunningStats
	) {}

	/** Shaped reward of one decision; always 0 for a sparse genome. */
	shape(raw: number): number {
		this._total += raw;
		if (this._config.sparse) {
			return 0;
		}
		const shaped = _scaleAndClip(raw, this._config);
		if (this._config.normalize && this._stats) {
			this._stats.update(shaped);
			return this._stats.normalize(shaped);
		}
		return shaped;
	}

	/** What a sparse genome learns at the end of the episode: its shaped total. */
	episodeBonus(): number {
		return this._config.sparse ? _scaleAndClip(this._total, this._config) : 0;
	}
}
