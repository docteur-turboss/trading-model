import {
	type EvaluationRecord,
	type ModelManifest,
	type PublishedModel,
	toRecord,
	verifyModel,
} from "../domain/model-evaluation";

interface Store {
	has(symbol: string, version: string): Promise<boolean>;
	create(record: EvaluationRecord): Promise<boolean>;
}

interface Trainer {
	manifest(symbol: string, version: string): Promise<ModelManifest>;
	weights(
		symbol: string,
		version: string
	): Promise<{ bytes: Uint8Array; sha256: string | undefined }>;
}

/**
 * Handles one `training.model.published` delivery (at-least-once): idempotent
 * on `(symbol, version)`, nothing is recorded for weights that fail the
 * checks (the delivery fails and goes through the bus retries, ADR-0019).
 */
export function createEvaluateModel(deps: {
	store: Store;
	trainer: Trainer;
	now?: () => Date;
}) {
	const now = deps.now ?? (() => new Date());
	return async (event: PublishedModel): Promise<"recorded" | "duplicate"> => {
		if (await deps.store.has(event.symbol, event.version)) {
			return "duplicate";
		}
		const manifest = await deps.trainer.manifest(event.symbol, event.version);
		const weights = await deps.trainer.weights(event.symbol, event.version);
		verifyModel({
			event,
			manifest,
			weights: weights.bytes,
			headerSha256: weights.sha256,
		});
		return (await deps.store.create(toRecord(manifest, now())))
			? "recorded"
			: "duplicate";
	};
}
