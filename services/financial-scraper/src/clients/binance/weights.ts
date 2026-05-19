export const BINANCE_WEIGHTS = {
  depth: (limit: number = 100): number => {
    if (limit <= 100) return 5;
    if (limit <= 500) return 25;
    if (limit <= 1000) return 50;
    return 250; // 1001–5000
  },
  trades: (): number => 25,
  historicalTrades: (): number => 25,
  compressedAggregateTrades: ():number => 4,
  candlesticks: ():number => 2,
  change24hrStats : (symbolLength: number): number => {
    if (symbolLength <= 20 && symbolLength !== 0) return 2;
    if (symbolLength <= 100) return 40;
    return 80;
  },
  tradingDayTicker: (symbolLength: number): number => {
    if (symbolLength <= 49 && symbolLength !== 0) return 4*symbolLength;
    if (symbolLength <= 100) return 200;
    throw new Error("Binance trading day ticker endpoint supports a maximum of 100 symbols per request and a minimum of 1.");
  },
  symbolPriceTicker: (symbolLength: number): number => 4,
  orderBookTicker: (symbolLength: number): number => 4
};