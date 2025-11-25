import { ChartCandle } from "../models/charts";

export class CandleRepository {
  async insertMany(candles: any[]) {
    return ChartCandle.insertMany(candles);
  }

  async getLatestOpenTime(symbol: string, interval: string): Promise<number | null> {
    const latest = await ChartCandle.findLatest({ symbol, interval });
    return latest?.openTime ? latest.openTime.getTime() : null;
  }
}
