import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { MarketDataBuffer } from "../core/market-data-buffer";
import type { TradingSymbol } from "../core/market-data-types";
import type { Trainer } from "../core/trainer";

const MIN_CANDLE_RATIO = 0.1;

export interface TrainingLoopConfig {
	symbols: TradingSymbol[];
	intervalMs: number;
}

export class TrainingLoop {
	private readonly _trainingInterval = new TimerHandle();

	constructor(
		private readonly _trainer: Trainer,
		private readonly _dataBuffer: MarketDataBuffer
	) {}

	start(config: TrainingLoopConfig): void {
		const { symbols, intervalMs } = config;
		const runTraining = () => this._runTrainingForSymbols(symbols);

		void runTraining();
		this._trainingInterval.startInterval(runTraining, intervalMs);
	}

	private _hasEnoughData(symbol: TradingSymbol): boolean {
		return (
			this._dataBuffer.getCandleCount(symbol) >=
			this._dataBuffer.getMaxSize() * MIN_CANDLE_RATIO
		);
	}

	private async _trainSymbol(symbol: TradingSymbol): Promise<void> {
		await this._trainer.train(symbol);
	}

	private async _runTrainingForSymbols(
		symbols: TradingSymbol[]
	): Promise<void> {
		if (this._trainer.isTraining()) {
			return;
		}
		for (const symbol of symbols) {
			if (this._hasEnoughData(symbol)) {
				await this._trainSymbol(symbol);
				break;
			}
		}
	}

	stop(): void {
		this._trainingInterval.stop();
	}
}
