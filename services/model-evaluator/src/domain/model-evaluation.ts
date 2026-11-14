import { createHash } from "node:crypto";
import { z } from "zod";

/** Safe as a path segment: the key names the record file. */
const KEY_PART = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

/** What the evaluator reads of `training.model.published` (ADR-0049 §1.1). */
export const PublishedModel = z.looseObject({
	symbol: KEY_PART,
	version: KEY_PART,
	sha256: z.string().regex(/^[0-9a-f]{64}$/),
	admissible: z.boolean().optional(),
});
export type PublishedModel = z.infer<typeof PublishedModel>;

/**
 * The part of the trainer manifest the evaluator relies on (ADR-0022): the
 * rest (topology, features, normalization) is kept as sent for the replay.
 */
export const ModelManifest = z.looseObject({
	symbol: z.string(),
	version: z.string(),
	weights: z.looseObject({
		length: z.number().int().nonnegative(),
		sha256: z.string().regex(/^[0-9a-f]{64}$/),
	}),
	admission: z.looseObject({ admissible: z.boolean() }).optional(),
});
export type ModelManifest = z.infer<typeof ModelManifest>;

/** One evaluation per `(symbol, version)`; the replay metrics come with the replay engine. */
export interface EvaluationRecord {
	symbol: string;
	version: string;
	evaluatedAt: string;
	weightsSha256: string;
	/** ADR-0069 verdict of the trainer, copied: the evaluator never promotes a model. */
	admissible: boolean;
	replay: "not-run";
}

/**
 * Checks the downloaded weights against the event, the manifest and the
 * `x-model-sha256` header; throws on any mismatch (ADR-0049 §1.2).
 */
export function verifyModel(input: {
	event: PublishedModel;
	manifest: ModelManifest;
	weights: Uint8Array;
	headerSha256: string | undefined;
}): void {
	const { event, manifest, weights, headerSha256 } = input;
	const actual = createHash("sha256").update(weights).digest("hex");
	const expected = manifest.weights.sha256;
	if (manifest.symbol !== event.symbol || manifest.version !== event.version) {
		throw new Error(
			`Manifest ${manifest.symbol}/${manifest.version} is not the published ${event.symbol}/${event.version}`
		);
	}
	if (
		actual !== expected ||
		event.sha256 !== expected ||
		headerSha256 !== expected
	) {
		throw new Error(
			`Weights of ${event.symbol}/${event.version} refused: sha256 ${actual} differs from the manifest ${expected}, the event ${event.sha256} or the header ${headerSha256}`
		);
	}
	if (weights.byteLength !== manifest.weights.length * 4) {
		throw new Error(
			`Weights of ${event.symbol}/${event.version} refused: ${weights.byteLength} bytes for ${manifest.weights.length} float32`
		);
	}
}

export function toRecord(manifest: ModelManifest, now: Date): EvaluationRecord {
	return {
		symbol: manifest.symbol,
		version: manifest.version,
		evaluatedAt: now.toISOString(),
		weightsSha256: manifest.weights.sha256,
		admissible: manifest.admission?.admissible ?? false,
		replay: "not-run",
	};
}
