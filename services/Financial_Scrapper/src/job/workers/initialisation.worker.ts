import { httpClient } from "../utils/httpClient";
import { TradeRepository } from "../repository/trade.repository";
import { BinanceHistoricalTradeResponse } from "../types/binance.api";

const BATCH_SIZE = 1000;
const SYMBOL = "BTCUSDT";

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function buildHistoricalTradesUrl(symbol: string, fromId: number, limit: number) {
  return `/api/v3/historicalTrades?symbol=${symbol}&fromId=${fromId}&limit=${limit}`;
}

function normalizeTrade(t: BinanceHistoricalTradeResponse) {
  return {
    id: t.id,
    price: Number(t.price),
    qty: Number(t.qty),
    timestamp: t.time,
    isBuyerMaker: t.isBuyerMaker,
  };
}

function validateSequence(batch: any[]) {
  if (batch.length === 0) return true;

  for (let i = 1; i < batch.length; i++) {
    const prev = batch[i - 1].id;
    const cur = batch[i].id;

    // Missing entries
    if (cur !== prev + 1) {
      console.warn(`[WARN] Missing trade IDs between ${prev} and ${cur}`);
    }
  }
}

// -----------------------------------------------------------------------------
// Main sync logic
// -----------------------------------------------------------------------------

export async function fullSyncHistoricalTrades() {
  console.log(`\n=== Starting FULL SYNC for ${SYMBOL} historical trades ===`);

  // 1. Get last stored trade ID from DB
  const lastDbTrade = await TradeRepository.getLastTradeId(SYMBOL);
  let cursor = lastDbTrade ?? 0;

  console.log(`Last DB tradeId for ${SYMBOL}: ${cursor}`);

  let totalInserted = 0;

  while (true) {
    // 2. Fetch next batch from Binance
    const url = buildHistoricalTradesUrl(SYMBOL, cursor, BATCH_SIZE);
    const remote = await httpClient.get<BinanceHistoricalTradeResponse[]>(url);

    if (!remote || remote.length === 0) {
      console.log("No more trades to sync. Exiting.");
      break;
    }

    // 3. Integrity checks
    validateSequence(remote);

    // 4. Normalize + clean duplicates
    const formatted = remote
      .map(normalizeTrade)
      .filter(t => t.id > cursor); // dedupe safety

    // 5. Persist
    await TradeRepository.bulkInsert(SYMBOL, formatted);
    totalInserted += formatted.length;

    // 6. Move cursor to last trade
    cursor = formatted.at(-1)!.id;

    console.log(
      `[SYNC] Inserted ${formatted.length} trades | lastId=${cursor}`
    );

    // Safety delay if needed (rate limits)
    await wait(200);
  }

  console.log(
    `\n=== FULL SYNC COMPLETED — total inserted: ${totalInserted} ===\n`
  );
}

// -----------------------------------------------------------------------------
// Utils
// -----------------------------------------------------------------------------

function wait(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}
