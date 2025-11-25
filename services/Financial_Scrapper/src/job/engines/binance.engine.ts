import { CandlestickData } from "../../clients/binance/binance.client";
import { CandleDataFetcher } from "./engine.types";
import { sleep } from "../../utils/sleep";

type fetchType = Parameters<typeof CandlestickData>

export class BinanceEngine implements CandleDataFetcher {
  async fetchCandles({ symbol, interval, startTime, limit } : {symbol: string; interval: fetchType[2]; startTime: number; limit: number}) {
    return await CandlestickData(symbol, limit, interval, startTime);
  }

  async handleError(err: any) {
    if (err?.response?.status === 418) {
      console.warn("[binance] Ban detected → sleep 2 min");
      await sleep(120000);
    }
    if (err?.response?.status === 429) {
      console.warn("[binance] Rate-limit → sleep 30s");
      await sleep(30000);
    }
  }
}
