import { KEY_PART } from "@trading-model/model-runtime/model-manifest";

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

/** Same bar, same model: same identifier, so risk-execution deduplicates a replay (ADR-0064 §2). */
export const decisionId = (model: PromotedModel, barTimestamp: number) =>
	`${model.symbol}@${model.version}:${barTimestamp}`;
