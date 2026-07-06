import { Cash } from "@trading-model/common/domain/primitives";

export class PeakTracker {
	private _peakValuation: Cash;

	constructor(initialValue: Cash) {
		this._peakValuation = initialValue;
	}

	update(currentValuation: Cash): void {
		if (+currentValuation > +this._peakValuation) {
			this._peakValuation = Cash.of(+currentValuation);
		}
	}

	get peak(): Cash {
		return this._peakValuation;
	}

	reset(initialValue: Cash): void {
		this._peakValuation = initialValue;
	}
}
