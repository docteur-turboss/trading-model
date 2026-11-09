import { FeatureVector } from "../../../domain/feature-vector";
import type { WindowSet } from "../../../domain/genetic-algorithm/ga-runner";
import type { GaTelemetry } from "../../../domain/genetic-algorithm/ga-telemetry";
import type { MarketStep } from "../../../domain/genetic-algorithm/genome-fitness";

/** Telemetry hooks the worker forwards to the main thread, by name. */
export type TelemetryMethod = keyof GaTelemetry;

/** Worker to main thread. `result` and `error` end the session. */
export type WorkerMessage =
	| { type: "telemetry"; method: TelemetryMethod; args: unknown[] }
	| { type: "result"; result: unknown }
	| { type: "error"; message: string; stack?: string };

/** Main thread to worker: end the session after its current generation (ADR-0058). */
export interface StopMessage {
	type: "stop";
}

/** A market step as it crosses the thread boundary: `FeatureVector` is a class, a structured clone would drop its methods. */
interface WireMarketStep {
	price: MarketStep["price"];
	timestamp?: number;
	features: Float32Array;
}

export interface WireWindowSet {
	id: string;
	train: WireMarketStep[];
	validation: WireMarketStep[];
}

const toWire = (steps: MarketStep[]): WireMarketStep[] =>
	steps.map((step) => ({
		price: step.price,
		timestamp: step.timestamp,
		features: step.features.toFloat32Array(),
	}));

const fromWire = (steps: WireMarketStep[]): MarketStep[] =>
	steps.map((step) => ({
		price: step.price,
		timestamp: step.timestamp,
		features: FeatureVector.fromFloat32Array(step.features),
	}));

export const encodeWindowSets = (sets: WindowSet[]): WireWindowSet[] =>
	sets.map((set) => ({
		id: set.id,
		train: toWire(set.train),
		validation: toWire(set.validation),
	}));

export const decodeWindowSets = (sets: WireWindowSet[]): WindowSet[] =>
	sets.map((set) => ({
		id: set.id,
		train: fromWire(set.train),
		validation: fromWire(set.validation),
	}));
