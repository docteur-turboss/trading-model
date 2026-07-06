import { Cash, Price, Volume } from "@trading-model/common/domain/primitives";
import { type PortfolioState } from "./portfolio-state";
import { TradeHistory, type TradeRecord } from "./trade-history";
import { ValuationTracker } from "./valuation-tracker";

export type { TradeRecord };

export class TradeRecorder {
	readonly valuationTracker: ValuationTracker;
	readonly tradeHistory = new TradeHistory();

	constructor(initialCash: Cash, decimals: number) {
		this.valuationTracker = new ValuationTracker(initialCash, decimals);
	}

	getState(cash: Cash, position: Volume, price: Price): PortfolioState {
		return { cash, position, price };
	}

	recordValuation(cash: Cash, position: Volume, price: Price): void {
		this.valuationTracker.record({ cash, position, price });
	}

	recordTrade(
		action: "buy" | "sell",
		amount: Volume,
		fee: Cash,
		price: Price,
		cashAfter: Cash,
		positionAfter: Volume,
	): void {
		this.tradeHistory.record({
			action,
			amount,
			fee,
			price,
			cashAfter,
			positionAfter,
		});
		this.recordValuation(cashAfter, positionAfter, price);
	}

	computeValuation(cash: Cash, position: Volume, price: Price): Cash {
		return this.valuationTracker.computeValuation({ cash, position, price });
	}

	computePnL(cash: Cash, position: Volume, price: Price): Cash {
		return this.valuationTracker.computePnL({ cash, position, price });
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
