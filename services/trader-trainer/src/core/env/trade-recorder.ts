import type {
	Cash,
	Price,
	Volume,
} from "@trading-model/common/domain/primitives";
import { TradeSide } from "@trading-model/common/contracts/market-data.types";
import type { PortfolioState } from "./portfolio-state";
import { TradeHistory, type TradeRecord } from "./trade-history";
import { ValuationTracker } from "./valuation-tracker";

export type { TradeRecord };

export class TradeRecorder {
	readonly valuationTracker: ValuationTracker;
	readonly tradeHistory = new TradeHistory();

	constructor(initialCash: Cash, decimals: number) {
		this.valuationTracker = new ValuationTracker(initialCash, decimals);
	}

	getState(state: PortfolioState): PortfolioState {
		return state;
	}

	recordValuation(state: PortfolioState): void {
		this.valuationTracker.record(state);
	}

	recordTrade(
		action: TradeSide,
		amount: Volume,
		fee: Cash,
		price: Price,
		cashAfter: Cash,
		positionAfter: Volume
	): void {
		this.tradeHistory.record({
			action,
			amount,
			fee,
			price,
			cashAfter,
			positionAfter,
		});
		this.recordValuation({ cash: cashAfter, position: positionAfter, price });
	}

	computeValuation(state: PortfolioState): Cash {
		return this.valuationTracker.computeValuation(state);
	}

	computePnL(state: PortfolioState): Cash {
		return this.valuationTracker.computePnL(state);
	}

	getPeakValuation(): Cash {
		return this.valuationTracker.getPeakValuation();
	}

	getTotalFeesPaid(): Cash {
		return this.tradeHistory.getTotalFeesPaid();
	}

	getTradeCount(): number {
		return this.tradeHistory.getTradeCount();
	}

	incrementStep(): void {
		this.tradeHistory.incrementStep();
	}

	getHistory(): Readonly<TradeRecord[]> {
		return this.tradeHistory.getHistory();
	}

	reset(): void {
		this.tradeHistory.reset();
		this.valuationTracker.reset();
	}
}
