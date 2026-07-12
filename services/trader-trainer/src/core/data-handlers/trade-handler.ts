import type { TradeData } from "@trading-model/common/config/event.types";
import type { DataHandler } from "./data-handler";
import { DataType } from "./data-types";

export const tradeHandler: DataHandler<TradeData> = {
	dataType: DataType.Trade,
	updateNorms(state, trade) {
		state.norm.trade.price.update(trade.price);
		state.norm.trade.qty.update(trade.quantity);
	},
	mutateState({ data, state, maxSize }) {
		state.trades.push(data);
		if (maxSize !== undefined && state.trades.length > maxSize) {
			state.trades = state.trades.slice(-maxSize);
		}
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
