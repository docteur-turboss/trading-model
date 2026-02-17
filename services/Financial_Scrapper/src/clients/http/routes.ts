import { Router } from "express";
import { 
  GetTradeBySourceController,
  GetTradeBySymbolController,
  GetTickerBySourceController,
  GetTickerBySymbolController,
  GetCandlesBySourceController,
  GetCandlesBySymbolController,
  GetTradeByTimestampController,
  GetOrderBookBySourceController,
  GetTickerByTimestampController,
  GetOrderBookBySymbolController,
  GetCandlesByTimestampController,
  GetOrderBookByTimestampAfterController,
  GetOrderBookByTimestampBeforeController,
} from "./controller";


export const FinancialRoutes = (): Router => {
  /**
   * Express router instance scoped to registry heartbeat concerns.
   */
  const router = Router();

  router.get("/trade/sources/:source", GetTradeBySourceController);
  router.get("/trade/symbols/:symbol", GetTradeBySymbolController);
  router.get("/trade/timestamp/:timestamp", GetTradeByTimestampController);

  router.get("/ticker/sources/:source", GetTickerBySourceController);
  router.get("/ticker/symbols/:symbol", GetTickerBySymbolController);
  router.get("/ticker/timestamp/:timestamp", GetTickerByTimestampController);

  router.get("/candles/sources/:source", GetCandlesBySourceController);
  router.get("/candles/symbols/:symbol", GetCandlesBySymbolController);
  router.get("/candles/timestamp/:timestamp", GetCandlesByTimestampController);

  router.get("/orderbook/sources/:source", GetOrderBookBySourceController);
  router.get("/orderbook/symbols/:symbol", GetOrderBookBySymbolController);
  router.get("/orderbook/after/timestamp/:timestamp", GetOrderBookByTimestampAfterController);
  router.get("/heartbeat/before/timestamp/:timestamp", GetOrderBookByTimestampBeforeController);

  return router;
};