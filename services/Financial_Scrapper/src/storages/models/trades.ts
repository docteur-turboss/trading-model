import { TradeType, tTrade, selectTradesColumns } from "../../types/trades.models";
import { handleDBError } from "cash-lib/middleware/handleCoreResponse";
import { DBConnection } from "../../config/db";

export class Trade {
  static async findAllBySymbol({
    symbol,
    limit = 1000,
    offset = 0,
  }: {
    symbol: string;
    limit?: number;
    offset?: number;
  }): Promise<TradeType[]> {
    return new DBConnection()
      .selectFrom(tTrade)
      .where(tTrade.symbol.equals(symbol))
      .select(selectTradesColumns)
      .orderBy(tTrade.time, "desc")
      .limit(limit)
      .offset(offset)
      .executeSelectMany()
      .catch(handleDBError());
  }

  static async findLatest({
    symbol,
  }: {
    symbol: string;
  }): Promise<TradeType | undefined> {
    return new DBConnection()
      .selectFrom(tTrade)
      .where(tTrade.symbol.equals(symbol))
      .select(selectTradesColumns)
      .orderBy(tTrade.time, "desc")
      .limit(1)
      .executeSelectOne()
      .catch(handleDBError());
  }

  static async findById({ id }: { id: number }): Promise<TradeType | undefined> {
    return new DBConnection()
      .selectFrom(tTrade)
      .where(tTrade.id.equals(id))
      .select(selectTradesColumns)
      .executeSelectOne()
      .catch(handleDBError());
  }

  static async findByExchangeId({
    exchangeId,
  }: {
    exchangeId: number;
    symbol?: string;
  }): Promise<TradeType | undefined> {
    const q = new DBConnection().selectFrom(tTrade).where(tTrade.exchangeId.equals(exchangeId));
    return q.select(selectTradesColumns).executeSelectOne().catch(handleDBError());
  }

  static async findByTimeRange({
    symbol,
    from,
    to,
    limit = 1000,
  }: {
    symbol: string;
    from: Date;
    to: Date;
    limit?: number;
  }): Promise<TradeType[]> {
    return new DBConnection()
      .selectFrom(tTrade)
      .where(
        tTrade.symbol.equals(symbol)
          .and(tTrade.time.greaterOrEquals(from))
          .and(tTrade.time.lessOrEquals(to))
      )
      .select(selectTradesColumns)
      .orderBy(tTrade.time, "asc")
      .limit(limit)
      .executeSelectMany()
      .catch(handleDBError());
  }

  static async insert({
    exchangeId,
    symbol,
    price,
    qty,
    quoteQty,
    time,
    isBuyerMaker,
    isBestMatch,
    source,
  }: {
    exchangeId: number;
    symbol: string;
    price: number;
    qty: number;
    quoteQty?: number;
    time: Date;
    isBuyerMaker: boolean;
    isBestMatch: boolean;
    source?: string;
  }) {
    return new DBConnection()
      .insertInto(tTrade)
      .set({
        exchangeId,
        symbol,
        price,
        qty,
        quoteQty,
        time,
        isBuyerMaker,
        isBestMatch,
        source,
      })
      .executeInsert()
      .catch(handleDBError());
  }

  static async insertMany(trades: {
    exchangeId: number;
    symbol: string;
    price: number;
    qty: number;
    quoteQty?: number;
    time: number | Date; // timestamp (ms) from Binance or Date
    isBuyerMaker: boolean;
    isBestMatch: boolean;
    source?: string;
  }[]) {
    if (trades.length === 0) return;

    const conn = new DBConnection();

    await conn
      .insertInto(tTrade)
      .values(
        trades.map((t) => ({
          exchangeId: t.exchangeId,
          symbol: t.symbol,
          price: t.price,
          qty: t.qty,
          quoteQty: t.quoteQty ?? null,
          time: t.time instanceof Date ? t.time : new Date(t.time),
          isBuyerMaker: t.isBuyerMaker,
          isBestMatch: t.isBestMatch,
          source: t.source ?? "binance",
        }))
      )
      .executeInsert()
      .catch(handleDBError());
  }

  static async updateById({
    id,
    data,
  }: {
    id: number;
    data: Partial<{
      price: number;
      qty: number;
      quoteQty: number;
      time: Date;
      isBuyerMaker: boolean;
      isBestMatch: boolean;
      source: string;
    }>;
  }) {
    await new DBConnection()
      .update(tTrade)
      .set({
        ...(data.price !== undefined && { price: data.price }),
        ...(data.qty !== undefined && { qty: data.qty }),
        ...(data.quoteQty !== undefined && { quoteQty: data.quoteQty }),
        ...(data.time && { time: data.time }),
        ...(data.isBuyerMaker !== undefined && { isBuyerMaker: data.isBuyerMaker }),
        ...(data.isBestMatch !== undefined && { isBestMatch: data.isBestMatch }),
        ...(data.source && { source: data.source }),
      })
      .where(tTrade.id.equals(id))
      .executeUpdate()
      .catch(handleDBError());

    return this.findById({ id });
  }

  static async deleteById({ id }: { id: number }): Promise<boolean> {
    await new DBConnection()
      .deleteFrom(tTrade)
      .where(tTrade.id.equals(id))
      .executeDelete()
      .catch(handleDBError());
    return true;
  }

  static async deleteOldTrades({
    symbol,
    beforeDate,
  }: {
    symbol: string;
    beforeDate: Date;
  }) {
    const q = new DBConnection().deleteFrom(tTrade).where(tTrade.time.lessThan(beforeDate)).and(tTrade.symbol.equals(symbol));
      return q.executeDelete().catch(handleDBError());
  }
}
