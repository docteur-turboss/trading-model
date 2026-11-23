import { createHash } from "node:crypto";
import { ModelManifestSchema } from "@trading-model/model-runtime/model-manifest";
import { z } from "zod";

/** Safe in an identifier and in a URL path segment. */
const KEY_PART = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);

/** A model the owner promoted by hand (ADR-0049 §1.4, ADR-0087 §2). */
export interface PromotedModel {
	symbol: string;
	version: string;
}

/**
 * Parses `PROMOTED_MODELS` (`BTCUSDT@v1,ETHUSDT@v3`); throws on a malformed
 * entry or two versions of one symbol (one model decides per symbol).
 */
export function parsePromoted(list: string): PromotedModel[] {
	const models = list
		.split(",")
		.map((entry) => entry.trim())
		.filter(Boolean)
		.map((entry) => {
			const [symbol, version, ...rest] = entry.split("@");
			if (rest.length > 0) {
				throw new Error(`Invalid PROMOTED_MODELS entry "${entry}"`);
			}
			return {
				symbol: KEY_PART.parse(symbol),
				version: KEY_PART.parse(version),
			};
		});
	if (new Set(models.map((model) => model.symbol)).size !== models.length) {
		throw new Error("PROMOTED_MODELS lists a symbol twice");
	}
	return models;
}

/** The part of the trainer manifest the consumer relies on (ADR-0022). */
export const ModelManifest = ModelManifestSchema.pick({
	symbol: true,
	version: true,
	weights: true,
	genome: true,
	admission: true,
	replay: true,
	riskLimits: true,
});
export type ModelManifest = z.infer<typeof ModelManifest>;

/**
 * Checks the downloaded weights against the manifest and the `x-model-sha256`
 * header; throws on any mismatch (ADR-0049 §1.2).
 */
export function verifyModel(input: {
	model: PromotedModel;
	manifest: ModelManifest;
	weights: Uint8Array;
	headerSha256: string | undefined;
}): void {
	const { model, manifest, weights, headerSha256 } = input;
	const name = `${model.symbol}/${model.version}`;
	if (manifest.symbol !== model.symbol || manifest.version !== model.version) {
		throw new Error(
			`Manifest ${manifest.symbol}/${manifest.version} is not the promoted ${name}`
		);
	}
	const actual = createHash("sha256").update(weights).digest("hex");
	const expected = manifest.weights.sha256;
	if (actual !== expected || headerSha256 !== expected) {
		throw new Error(
			`Weights of ${name} refused: sha256 ${actual} differs from the manifest ${expected} or the header ${headerSha256}`
		);
	}
	if (weights.byteLength !== manifest.weights.length * 4) {
		throw new Error(
			`Weights of ${name} refused: ${weights.byteLength} bytes for ${manifest.weights.length} float32`
		);
	}
}

/** Same bar, same model: same identifier, so risk-execution deduplicates a replay (ADR-0064 §2). */
export const decisionId = (model: PromotedModel, barTimestamp: number) =>
	`${model.symbol}@${model.version}:${barTimestamp}`;

/** Body of risk-execution `POST /intents` (ADR-0064 §1), declared here until #1904 shares it. */
export const Intent = z.object({
	decisionId: z.string().min(1),
	symbol: z.string().min(1),
	side: z.enum(["buy", "sell"]),
	quantity: z.number().positive(),
	referencePrice: z.number().positive(),
	referenceAt: z.number().int().positive(),
	model: z.object({ symbol: z.string().min(1), version: z.string().min(1) }),
});
export type Intent = z.infer<typeof Intent>;
