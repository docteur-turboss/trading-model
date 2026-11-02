import type { TradeData } from "@trading-model/contracts/market-data.types";
import type { SymbolState } from "../market-data-types";
import { NormalizationStats } from "../normalization-stats";
import type { DataHandler } from "./data-handler";
import { lastOf, pushWithMaxSize } from "./data-handler";
import { DataType } from "./data-types";

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
		return isNewTrade(state, trade);
	},
	mutateState({ data, state, maxSize }) {
		if (isNewTrade(state, data)) {
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

function isNewTrade(
	state: Pick<SymbolState, "trades">,
	trade: TradeData
): boolean {
	const last = lastOf(state.trades);
	return last === undefined || trade.tradeId > last.tradeId;
}
