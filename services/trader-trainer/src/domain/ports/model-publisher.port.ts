import type { TradingSymbol } from "../market-data-types";
import type { BestAgentSummary } from "../training-state";

/** Identity of an artifact already stored. */
export interface StoredModelRef {
	version: string;
	sha256: string;
}

/** Publishes the best trained model (implemented over the message bus). */
export interface ModelPublisherPort {
	publish(
		symbol: TradingSymbol,
		summary: BestAgentSummary,
		stored: StoredModelRef
	): Promise<void>;
}
