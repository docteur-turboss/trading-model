import { normalizeError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import type { Intent } from "@trading-model/contracts/order-intent";
import { DEFAULT_MAX_EXPOSURE_FRACTION } from "@trading-model/model-runtime/env/wallet-config";
import {
	isSupportedInterval,
	type ModelManifest,
	verifyModel,
} from "@trading-model/model-runtime/model-manifest";
import { decideOnLastBar } from "@trading-model/model-runtime/replay";
import {
	DECISION_INTENTS_TOTAL,
	DECISION_SKIPPED_TOTAL,
} from "../config/metrics";
import { decisionId, type PromotedModel } from "../domain/decision";

interface Trainer {
	manifest(symbol: string, version: string): Promise<ModelManifest>;
	weights(
		symbol: string,
		version: string
	): Promise<{ bytes: Uint8Array; sha256: string | undefined }>;
}

interface Scraper {
	candles(
		symbol: string,
		from: number,
		to: number,
		intervalMs: number
	): Promise<CandleData[]>;
}

interface Risk {
	position(symbol: string): Promise<number>;
	send(
		intent: Intent
	): Promise<{ status: string; clientOrderId: string; reason?: string }>;
}

interface Audit {
	promotionLoaded(fields: {
		symbol: string;
		version: string;
		sha256: string;
	}): Promise<void>;
}

/** A promoted model once verified and audited. */
interface Loaded {
	manifest: ModelManifest;
	weights: Float32Array;
	intervalMs: number;
}

/** Order quantity bounded by the real position (sale) or the room left under the exposure cap (buy), 8 decimals. */
function sized(
	order: { side: string; quantity: number },
	held: number,
	price: number,
	manifest: ModelManifest
): number {
	const cap =
		(manifest.replay?.simulator.initialCash ?? 0) *
		(manifest.riskLimits?.maxExposureFraction ?? DEFAULT_MAX_EXPOSURE_FRACTION);
	const room = order.side === "buy" ? Math.max(0, cap / price - held) : held;
	return Math.floor(Math.min(order.quantity, room) * 1e8) / 1e8;
}

/** Records why a model did not decide this time; logged once per change by the caller's tick. */
const skip = (model: PromotedModel, reason: string): void => {
	DECISION_SKIPPED_TOTAL.inc({ reason });
	getLogger().warn("Promoted model skipped", { ...model, reason });
};

/**
 * One pass over the promoted models (ADR-0087). Per model: load it once (manifest
 * `admissible`, sha256 checks), audit its promotion (fail closed: no decision
 * before the event is on the bus), then decide on the last closed bar once. A
 * failure of one model never stops the others and never sends an intent.
 */
export function createDecisionTick(deps: {
	promoted: readonly PromotedModel[];
	trainer: Trainer;
	scraper: Scraper;
	risk: Risk;
	audit: Audit;
	/** Bars of the window the model decides on (features normalise from its first bar). */
	windowBars: number;
	now?: () => number;
}) {
	const now = deps.now ?? Date.now;
	const loaded = new Map<string, Loaded>();
	const audited = new Set<string>();
	const decided = new Map<string, number>();

	async function load(model: PromotedModel): Promise<Loaded | undefined> {
		const key = model.symbol;
		const known = loaded.get(key);
		if (known) {
			return known;
		}
		const manifest = await deps.trainer.manifest(model.symbol, model.version);
		// Eligible only: a promotion of a non-admissible model decides nothing (ADR-0069, ADR-0049 §1.4).
		if (manifest.admission?.admissible !== true) {
			skip(model, "not-admissible");
			return undefined;
		}
		const intervalMs = manifest.replay?.intervalMs;
		if (intervalMs === undefined || !isSupportedInterval(intervalMs)) {
			skip(model, "unsupported-interval");
			return undefined;
		}
		const weights = await deps.trainer.weights(model.symbol, model.version);
		verifyModel({
			model,
			manifest,
			weights: weights.bytes,
			headerSha256: weights.sha256,
		});
		const value = {
			manifest,
			// A copy: float32 needs 4-byte alignment, a Buffer slice may not have it.
			weights: new Float32Array(new Uint8Array(weights.bytes).buffer),
			intervalMs,
		};
		loaded.set(key, value);
		return value;
	}

	async function decide(model: PromotedModel, current: Loaded): Promise<void> {
		const { manifest, intervalMs } = current;
		const bar = Math.floor(now() / intervalMs) * intervalMs - intervalMs;
		if ((decided.get(model.symbol) ?? 0) >= bar) {
			return;
		}
		const candles = await deps.scraper.candles(
			model.symbol,
			bar - deps.windowBars * intervalMs,
			bar + intervalMs,
			intervalMs
		);
		const replay = manifest.replay;
		const decision =
			replay &&
			decideOnLastBar({
				genome: manifest.genome,
				weights: current.weights,
				simulator: {
					...replay.simulator,
					maxExposureFraction: manifest.riskLimits?.maxExposureFraction,
				},
				candles,
			});
		// The bar is not in yet (or a gap cut the window): try again on the next pass.
		if (!decision || decision.barTimestamp !== bar) {
			skip(model, "missing-bar");
			return;
		}
		// Sized on the real position (ADR-0087 §3): a sale never exceeds it, a buy fits in what is left of
		// the model's exposure cap. A failed read throws: no intent, retried next pass.
		const held = decision.order ? await deps.risk.position(model.symbol) : 0;
		const quantity = decision.order
			? sized(decision.order, held, decision.price, manifest)
			: 0;
		if (decision.order && quantity > 0) {
			const result = await deps.risk.send({
				decisionId: decisionId(model, bar),
				symbol: model.symbol,
				side: decision.order.side,
				quantity,
				referencePrice: decision.price,
				referenceAt: bar + intervalMs,
				model,
			});
			DECISION_INTENTS_TOTAL.inc({
				outcome: result.status,
				reason: result.reason ?? "",
			});
			if (result.status === "rejected") {
				getLogger().warn("Intent rejected by risk-execution", {
					...model,
					decisionId: result.clientOrderId,
					reason: result.reason,
				});
			}
		} else {
			DECISION_INTENTS_TOTAL.inc({
				outcome: "hold",
				reason: decision.order ? "no-room" : "",
			});
		}
		decided.set(model.symbol, bar);
	}

	return async (): Promise<void> => {
		for (const model of deps.promoted) {
			try {
				const current = await load(model);
				if (!current) {
					continue;
				}
				if (!audited.has(model.symbol)) {
					await deps.audit.promotionLoaded({
						...model,
						sha256: current.manifest.weights.sha256,
					});
					audited.add(model.symbol);
				}
				await decide(model, current);
			} catch (error) {
				skip(model, "error");
				getLogger().error("Decision failed", {
					...model,
					error: normalizeError(error),
				});
			}
		}
	};
}
