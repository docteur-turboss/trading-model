import { FeatureVector } from "@trading-model/model-runtime/feature-vector";
import type { Signal } from "@trading-model/validation/wire/signals";
import type { MarketStep } from "./genetic-algorithm/genome";

/** Inputs per metric: value, age, confidence (ADR-0081). */
const SIGNAL_INPUTS_PER_METRIC = 3;
const MAX_AGE_MS = 365 * 24 * 3_600_000;
const HOUR_MS = 3_600_000;
const MAX_ABS_VALUE = 5;

/** One `<subject>:<dimension>:<metric>` key (`BTC:social:pageviews`), subject = asset id, sector or area. */
export const SIGNAL_KEY_PATTERN = /^[^:,\s]+:[^:,\s]+:[^:,\s]+$/;

export function parseSignalKeys(csv: string): string[] {
	return csv
		.split(",")
		.map((key) => key.trim())
		.filter(Boolean);
}

// The wire schema sets exactly one subject; "" only keeps a malformed signal off every key.
export function signalKey(signal: Signal): string {
	const subject = signal.assetId ?? signal.sector ?? signal.area ?? "";
	return `${subject}:${signal.dimension}:${signal.payload.metric}`;
}

export function signalFieldNames(keys: readonly string[]): string[] {
	return keys.flatMap((key) =>
		["Value", "Age", "Confidence"].map((part) => `Signal${part}:${key}`)
	);
}

/**
 * Raw signal inputs at instant `at`: per key, the newest value observed at or
 * before `at` (as-of join, ADR-0030), its age on a log scale in [0, 1] and its
 * confidence. Before the first value: NaN (normalised to 0 later), age 1,
 * confidence 0.
 */
export function asOfSignalInputs(
	byKey: ReadonlyMap<string, Signal[]>,
	keys: readonly string[],
	at: number
): Float32Array {
	const out = new Float32Array(keys.length * SIGNAL_INPUTS_PER_METRIC);
	keys.forEach((key, index) => {
		let best: Signal | undefined;
		let bestAt = Number.NEGATIVE_INFINITY;
		for (const signal of byKey.get(key) ?? []) {
			const observed = Date.parse(signal.observedAt);
			if (observed <= at && observed >= bestAt) {
				best = signal;
				bestAt = observed;
			}
		}
		const base = index * SIGNAL_INPUTS_PER_METRIC;
		out[base] = best ? best.payload.value : Number.NaN;
		out[base + 1] = best
			? Math.min(
					1,
					Math.log1p((at - bestAt) / HOUR_MS) / Math.log1p(MAX_AGE_MS / HOUR_MS)
				)
			: 1;
		out[base + 2] = best ? best.confidenceScore : 0;
	});
	return out;
}

export interface SignalNorm {
	mean: number;
	std: number;
}

/** Mean and deviation of each key's known values over `train` only. */
export function signalNorms(
	train: readonly MarketStep[],
	keys: readonly string[]
): Record<string, SignalNorm> {
	const norms: Record<string, SignalNorm> = {};
	keys.forEach((key, index) => {
		const values = train
			.map((step) => step.features.signals[index * SIGNAL_INPUTS_PER_METRIC])
			.filter(Number.isFinite);
		const mean =
			values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
		const variance =
			values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
			(values.length || 1);
		norms[key] = { mean, std: Math.sqrt(variance) || 1 };
	});
	return norms;
}

/** A copy of `steps` with each value input centred and scaled by `norms`, clamped; unknown values become 0. */
export function applySignalNorms(
	steps: readonly MarketStep[],
	keys: readonly string[],
	norms: Record<string, SignalNorm>
): MarketStep[] {
	return steps.map((step) => {
		const features = new FeatureVector(step.features.toFloat32Array());
		keys.forEach((key, index) => {
			const at = index * SIGNAL_INPUTS_PER_METRIC;
			const { mean, std } = norms[key];
			const scaled = (features.signals[at] - mean) / std;
			features.signals[at] = Number.isFinite(scaled)
				? Math.max(-MAX_ABS_VALUE, Math.min(MAX_ABS_VALUE, scaled))
				: 0;
		});
		return { ...step, features };
	});
}
