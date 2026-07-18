import { adaptGAControl } from "./adaptive-control-system";
import type { GAControlGenome } from "./genome-types";
import type { DeepReadonly } from "./shared-types";

export class EfficiencyTracker {
	private _history: number[] = [];

	record(efficiency: number): void {
		this._history.push(efficiency);
	}

	reset(): void {
		this._history = [];
	}

	adaptControl(
		ctrl: DeepReadonly<GAControlGenome>,
		stagnation: number
	): DeepReadonly<GAControlGenome> {
		return adaptGAControl(ctrl, this._history, stagnation);
	}
}
