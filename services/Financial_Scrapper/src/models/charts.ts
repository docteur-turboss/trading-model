import { ChartCandleType, selectColumns, tChartCandle } from "types/charts.models";
import { handleDBError } from "cash-lib/middleware/handleCoreResponse";
import { DBConnection } from "../config/db";

export class ChartCandle {
  static async findAllBySymbol({
    symbol,
    interval,
    limit = 500,
    offset = 0,
  }: {
    symbol: string;
    interval: string;
    limit?: number;
    offset?: number;
  }) {
    return new DBConnection()
      .selectFrom(tChartCandle)
      .where(
        tChartCandle.symbol.equals(symbol)
          .and(tChartCandle.interval.equals(interval))
      )
      .select(selectColumns)
      .orderBy(tChartCandle.timestamp, "desc")
      .limit(limit)
      .offset(offset)
      .executeSelectMany()
      .catch(handleDBError());
  }

  static async findLatest({
    symbol,
    interval,
  }: {
    symbol: string;
    interval: string;
  }) {
    return new DBConnection()
      .selectFrom(tChartCandle)
      .where(
        tChartCandle.symbol.equals(symbol)
          .and(tChartCandle.interval.equals(interval))
      )
      .select(selectColumns)
      .orderBy(tChartCandle.timestamp, "desc")
      .limit(1)
      .executeSelectOne()
      .catch(handleDBError());
  }

  static async insert({
    symbol,
    interval,
    open,
    high,
    low,
    close,
    volume,
    timestamp,
    source,
  }: {
    symbol: string;
    interval: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    timestamp: Date;
    source?: string;
  }) {
    return new DBConnection()
      .insertInto(tChartCandle)
      .set({
        symbol,
        interval,
        open,
        high,
        low,
        close,
        volume,
        timestamp,
        source,
      })
      .executeInsert()
      .catch(handleDBError());
  }

  static async updateById({
    id,
    data,
  }: {
    id: number;
    data: Partial<{
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      timestamp: Date;
      source: string;
    }>;
  }) {
    await new DBConnection()
      .update(tChartCandle)
      .set({
        ...(data.open !== undefined && { open: data.open }),
        ...(data.high !== undefined && { high: data.high }),
        ...(data.low !== undefined && { low: data.low }),
        ...(data.close !== undefined && { close: data.close }),
        ...(data.volume !== undefined && { volume: data.volume }),
        ...(data.timestamp && { timestamp: data.timestamp }),
        ...(data.source && { source: data.source }),
      })
      .where(tChartCandle.id.equals(id))
      .executeUpdate()
      .catch(handleDBError());

    return this.findById({ id });
  }

  static async findById({
    id,
  }: {
    id: number;
  }): Promise<ChartCandleType | undefined> {
    return new DBConnection()
      .selectFrom(tChartCandle)
      .where(tChartCandle.id.equals(id))
      .select(selectColumns)
      .executeSelectOne()
      .catch(handleDBError());
  }

  static async deleteById({
    id,
  }: {
    id: number;
  }): Promise<boolean> {
    await new DBConnection()
      .deleteFrom(tChartCandle)
      .where(tChartCandle.id.equals(id))
      .executeDelete()
      .catch(handleDBError());
    return true;
  }

  static async deleteOldCandles({
    symbol,
    interval,
    beforeDate,
  }: {
    symbol: string;
    interval: string;
    beforeDate: Date;
  }) {
    return new DBConnection()
      .deleteFrom(tChartCandle)
      .where(
        tChartCandle.symbol.equals(symbol)
          .and(tChartCandle.interval.equals(interval))
          .and(tChartCandle.timestamp.lessThan(beforeDate))
      )
      .executeDelete()
      .catch(handleDBError());
  }
}
