import { CandleRepository } from "../../repository/candle.repository";
import { ICandleEngine } from "../engines/engine.types";
import { sleep } from "../../utils/sleep";

export interface FetchAllHistoryParams {
  symbol: string;
  interval: string;
  startFrom: number;
  limit: number;
}

export class CandleHistoryService {
  constructor(
    private engine: ICandleEngine,
    private repo: CandleRepository
  ) {}

  async fetchAllHistory({
    symbol,
    interval,
    startFrom,
    limit,
  }: FetchAllHistoryParams): Promise<void> {
    let startTime = startFrom;

    while (true) {
      const batch = await this.engine.fetchCandles({
        symbol,
        interval,
        startTime,
        limit,
      });

      if (!batch || batch.length === 0) break;

      await this.repo.insertMany(
        batch.map((k) => ({
          symbol,
          interval,
          openTime: k[0],
          open: k[1],
          high: k[2],
          low: k[3],
          close: k[4],
          volume: k[5],
          source: this.engine.constructor.name
            .replace("Engine", "")
            .toLowerCase(),
        }))
      );

      // Pagination
      startTime = batch[batch.length - 1][0] + 1;

      await sleep(200);
    }
  }
}