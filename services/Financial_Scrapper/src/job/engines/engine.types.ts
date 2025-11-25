import { BinanceCandlestickDataResponse } from "types/binance.api";

export interface CandleDataFetcher {
  fetchCandles(params: FetchCandleParams): Promise<BinanceCandlestickDataResponse>;
  
  handleError?(error: any): Promise<void>;
}

export interface FetchCandleParams {
  symbol: string;
  interval: string;
  startTime: number;
  limit: number;
}

export interface ICandleEngine {
  fetchCandles(params: FetchCandleParams): Promise<BinanceCandlestickDataResponse>;
}