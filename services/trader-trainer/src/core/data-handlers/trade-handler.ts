import type { TradeData } from "@trading-model/common/config/event.types";
import type { SymbolState } from "../market-data-types";
import { DataType } from "./data-types";
import type { DataHandler } from "./data-handler";

export const tradeHandler: DataHandler<TradeData> = {
	dataType: DataType.Trade,
	updateNorms(state, trade) {
		state.norm.tradePrice.update(trade.price);
		state.norm.tradeQty.update(trade.quantity);
	},
	mutateState(_symbol, data, state, maxSize) {
		state.trades.push(data);
		if (maxSize !== undefined && state.trades.length > maxSize) {
			state.trades = state.trades.slice(-maxSize);
		}
	},
	serializeNorms(state) {
		return {
			tradePriceNorm: state.norm.tradePrice.toJSON(),
			tradeQtyNorm: state.norm.tradeQty.toJSON(),
		};
	},
};
