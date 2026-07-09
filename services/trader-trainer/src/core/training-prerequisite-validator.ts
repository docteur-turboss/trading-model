import { ENV } from "../config/env";
import type { WindowSet } from "./genetic-algorithm/ga-runner";
import {
	type MarketDataBuffer,
	MIN_TRAINING_STEPS,
} from "./market-data-buffer";
import type { TradingSymbol } from "./market-data-types";
import type { TrainingFailure } from "./trainer";

export class TrainingPrerequisiteValidator {
	constructor(
		private readonly _dataBuffer: MarketDataBuffer,
		private readonly _isTraining: () => boolean
	) {}

	validate(
		symbol: TradingSymbol
	):
		| { ok: true; windowSet: WindowSet }
		| { ok: false; error: TrainingFailure } {
		if (this._isTraining()) {
			return {
				ok: false,
				error: {
					success: false,
					symbol,
					error: new Error("Already training"),
				},
			};
		}

		const windowSet = this._dataBuffer.getAllWindows(
			symbol,
			ENV.TRAINER_VALIDATION_SPLIT
		);
		if (!windowSet || windowSet.train.length < MIN_TRAINING_STEPS) {
			return {
				ok: false,
				error: {
					success: false,
					symbol,
					error: new Error(
						`Not enough data for ${symbol}, need at least ${MIN_TRAINING_STEPS} steps`
					),
				},
			};
		}

		return { ok: true, windowSet };
	}
}
