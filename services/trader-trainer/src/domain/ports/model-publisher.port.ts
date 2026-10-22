import type { TradingSymbol } from "../market-data-types";
import type { BestAgentSummary } from "../training-state";

/** Publishes the best trained model (implemented over the message bus). */
export interface ModelPublisherPort {
	publish(symbol: TradingSymbol, summary: BestAgentSummary): Promise<void>;
}
