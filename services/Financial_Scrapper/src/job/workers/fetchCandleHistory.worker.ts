import { BinanceEngine } from "../engines/binance.engine";
import { CandleHistoryService } from "../services/candleHistory.service";
import { CandleRepository } from "../../repository/candle.repository";
import { ICandleEngine } from "../engines/engine.types";

export type HistoryEngineName = "binance";

export interface HistoryWorkerParams {
  symbol: string;
  interval: string;
  startFrom: number;
  limit?: number;
  engine?: HistoryEngineName;
}

export async function fetchHistoryWorker({
  symbol,
  interval,
  startFrom,
  limit = 1000,
  engine = "binance",
}: HistoryWorkerParams): Promise<void> {
  console.log(`[worker] Fetching ${symbol} (${interval})...`);

  const engines: Record<HistoryEngineName, ICandleEngine> = {
    binance: new BinanceEngine(),
  };

  const selectedEngine = engines[engine];

  const repo = new CandleRepository();
  const service = new CandleHistoryService(selectedEngine, repo);

  try {
    await service.fetchAllHistory({
      symbol,
      interval,
      startFrom,
      limit,
    });

    console.log(`[worker] DONE for ${symbol} (${interval})`);
  } catch (err) {
    console.error("[worker] Fatal error:", err);
  }
}