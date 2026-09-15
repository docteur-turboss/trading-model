import { BACKPRESSURE_RATIO } from "../config/metrics";

let currentRatio = 0;

export function setBackpressureRatio(usage: number): void {
	currentRatio = usage;
	BACKPRESSURE_RATIO.set(usage);
}

export function getBackpressureRatio(): number {
	return currentRatio;
}
