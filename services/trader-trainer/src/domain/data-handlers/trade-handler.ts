import type { TradeData } from "@trading-model/contracts/market-data.types";
import { NormalizationStats } from "../normalization-stats";
import type { DataHandler } from "./data-handler";
import { pushWithMaxSize } from "./data-handler-utils";
import { DataType } from "./data-types";

// tradeId arrives as bigint or decimal string (bus JSON): `>` on two strings is lexicographic.
function isNewTrade(trades: readonly TradeData[], trade: TradeData): boolean {
	const last = trades[trades.length - 1];
	return last === undefined || BigInt(trade.tradeId) > BigInt(last.tradeId);
}

export const tradeHandler: DataHandler<TradeData> = {
	dataType: DataType.Trade,
	createState() {
		return { trades: [] };
	},
	createNorms() {
		return {
			trade: {
				price: new NormalizationStats(),
				qty: new NormalizationStats(),
			},
		};
	},
	updateNorms(state, trade) {
		state.norm.trade.price.update(trade.price);
		state.norm.trade.qty.update(trade.quantity);
	},
	// The scraper fetches the latest trades every cycle: a quiet symbol's
	// trades come back several times.
	isNew(state, trade) {
		return isNewTrade(state.trades, trade);
	},
	mutateState({ data, state, maxSize }) {
		if (isNewTrade(state.trades, data)) {
			state.trades = pushWithMaxSize(state.trades, data, maxSize);
		}
	},
	estimateMemoryBytes(state) {
		return state.trades.length * 100;
	},
	serializeNorms(state) {
		return {
			trade: {
				price: state.norm.trade.price.toJSON(),
				qty: state.norm.trade.qty.toJSON(),
			},
		};
	},
};
