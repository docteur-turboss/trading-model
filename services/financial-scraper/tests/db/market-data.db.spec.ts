import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "@jest/globals";
import {
	CandleInterval,
	MarketType,
	SourceType,
	TradeSide,
} from "@trading-model/contracts/market-data.types";
import {
	DataSource,
	PositiveInt,
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import { createConnection } from "mysql2/promise";
import { MySqlCandlePublishBacklog } from "../../src/adapters/outbound/persistence/candle-publish-backlog";
import {
	insertCandles,
	selectCandlesBy,
} from "../../src/adapters/outbound/persistence/schema/candles-schema";
import {
	insertTicker,
	selectTickerBy,
} from "../../src/adapters/outbound/persistence/schema/ticker24h.schema";
import {
	insertTrades,
	selectTradesBy,
} from "../../src/adapters/outbound/persistence/schema/trades.schema";
import { MySqlSignalStore } from "../../src/adapters/outbound/persistence/signal-store";
import { DATABASE } from "../../src/config/db";
import type {
	CandleData,
	TickerData,
	TradeData,
} from "../../src/domain/market-data.types";
import type { Signal } from "../../src/domain/signals";

const MIGRATIONS_DIR = join(__dirname, "../../../../scripts/migrations");
const SYMBOL = TradingSymbol.of("BTCUSDT");
const T0 = UnixTimestamp.of(Date.UTC(2026, 0, 2, 3, 4, 5, 678));

/**
 * Applies every migration in id order (`up`) or reverse id order (`down`), one
 * multi-statement query per file, the way scripts/migrate.mjs does.
 */
async function migrate(direction: "up" | "down"): Promise<void> {
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((file) => file.endsWith(`.${direction}.sql`))
		.sort((a, b) => a.localeCompare(b));
	if (direction === "down") {
		files.reverse();
	}
	await runMigrations(files);
}

async function runMigrations(files: string[]): Promise<void> {
	const connection = await createConnection({
		uri: process.env.TEST_MYSQL_URI,
		multipleStatements: true,
	});
	try {
		for (const file of files) {
			await connection
				.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"))
				.catch((err: Error) => {
					throw new Error(`${file}: ${err.message}`);
				});
		}
	} finally {
		await connection.end();
	}
}

function candle(overrides: Partial<CandleData> = {}): CandleData {
	return {
		symbol: SYMBOL,
		market: MarketType.Crypto,
		source: SourceType.Binance,
		interval: CandleInterval.Min1,
		open: Price.of(100.5),
		high: Price.of(110.25),
		low: Price.of(99.125),
		close: Price.of(105.0625),
		volume: Volume.of(12.5),
		trades: PositiveInt.of(42),
		timestamp: T0,
		closeTimestamp: UnixTimestamp.of(T0 + 59_999),
		...overrides,
	};
}

function trade(overrides: Partial<TradeData> = {}): TradeData {
	return {
		symbol: SYMBOL,
		market: MarketType.Crypto,
		source: SourceType.Binance,
		tradeId: 1n,
		price: Price.of(100.5),
		quantity: Volume.of(0.25),
		side: TradeSide.Buy,
		timestamp: T0,
		...overrides,
	};
}

function ticker(overrides: Partial<TickerData> = {}): TickerData {
	return {
		symbol: SYMBOL,
		market: MarketType.Crypto,
		source: SourceType.Binance,
		open: Price.of(100.5),
		high: Price.of(110.25),
		low: Price.of(99.125),
		last: Price.of(105.0625),
		volume: Volume.of(1234.5),
		timestamp: T0,
		closeTimestamp: UnixTimestamp.of(T0 + 86_399_999),
		...overrides,
	};
}

async function count(table: string): Promise<number> {
	const [rows] = await DATABASE.promise().query(
		`SELECT COUNT(*) AS n FROM ${table}`
	);
	return (rows as { n: number }[])[0].n;
}

async function tables(): Promise<string[]> {
	const [rows] = await DATABASE.promise().query(
		"SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY name"
	);
	return (rows as { name: string }[]).map((row) => row.name);
}

beforeAll(async () => {
	await migrate("up");
});

beforeEach(async () => {
	for (const table of [
		"market_candles",
		"market_trades",
		"market_tickers",
		"market_publish_cursors",
		"signals",
	]) {
		await DATABASE.promise().query(`DELETE FROM ${table}`);
	}
});

afterAll(async () => {
	await DATABASE.promise().end();
});

describe("schema migrations — real MySQL", () => {
	it("should roll every migration back and re-apply it on the same database", async () => {
		await migrate("down");
		await expect(tables()).resolves.toEqual([]);

		await migrate("up");

		await expect(tables()).resolves.toEqual([
			"market_candles",
			"market_publish_cursors",
			"market_tickers",
			"market_trades",
			"signals",
		]);
	});
});

describe("004_fix_market_data_primary_keys — real MySQL", () => {
	const PK_MIGRATION = "004_fix_market_data_primary_keys";

	it("should keep the last copy of each duplicated row from the old keys", async () => {
		await runMigrations([`${PK_MIGRATION}.down.sql`]);
		const db = DATABASE.promise();
		for (const close of [101, 102, 103]) {
			await db.query(
				`INSERT INTO market_candles (symbol, market, source, interval_value, open, high, low, close, volume, timestamp, close_timestamp)
				 VALUES ('BTCUSDT', 'crypto', 'binance', '1m', 100, 110, 90, ?, 1, '2026-01-02 03:04:00.000', '2026-01-02 03:04:59.999')`,
				[close]
			);
		}
		for (const last of [101, 102]) {
			await db.query(
				`INSERT INTO market_tickers (symbol, market, source, open, high, low, last, volume, timestamp, close_time)
				 VALUES ('BTCUSDT', 'crypto', 'binance', 100, 110, 90, ?, 1, '2026-01-02 03:04:00.000', '2026-01-03 03:03:59.999')`,
				[last]
			);
		}

		await runMigrations([`${PK_MIGRATION}.up.sql`]);

		await expect(count("market_candles")).resolves.toBe(1);
		await expect(count("market_tickers")).resolves.toBe(1);
		const [candles] = await db.query("SELECT close FROM market_candles");
		expect(Number((candles as { close: string }[])[0].close)).toBe(103);
		const [tickers] = await db.query("SELECT last FROM market_tickers");
		expect(Number((tickers as { last: string }[])[0].last)).toBe(102);
	});
});

describe("market_candles — real MySQL", () => {
	it("should round-trip a candle with its millisecond timestamps", async () => {
		await insertCandles([candle()]);

		const [row] = await selectCandlesBy.symbol(SYMBOL);

		expect(row).toMatchObject({
			symbol: SYMBOL,
			market: MarketType.Crypto,
			source: SourceType.Binance,
			interval: CandleInterval.Min1,
			open: 100.5,
			high: 110.25,
			low: 99.125,
			close: 105.0625,
			volume: 12.5,
			trades: 42,
		});
		expect(row.timestamp.getTime()).toBe(T0);
		expect(row.closeTimestamp.getTime()).toBe(T0 + 59_999);
	});

	it("should update a re-fetched candle in place instead of duplicating it", async () => {
		await insertCandles([candle()]);

		await insertCandles([
			candle({ close: Price.of(107), volume: Volume.of(20) }),
		]);

		await expect(count("market_candles")).resolves.toBe(1);
		const [row] = await selectCandlesBy.symbol(SYMBOL);
		expect(row).toMatchObject({ close: 107, volume: 20 });
	});

	it("should keep candles of different intervals or sources apart", async () => {
		await insertCandles([
			candle(),
			candle({ interval: CandleInterval.Min5 }),
			candle({ source: SourceType.Nyse }),
		]);

		await expect(count("market_candles")).resolves.toBe(3);
		await expect(selectCandlesBy.source(SourceType.Nyse)).resolves.toHaveLength(
			1
		);
	});

	it("should store a candle without a trade count", async () => {
		await insertCandles([candle({ trades: undefined })]);

		const [row] = await selectCandlesBy.symbol(SYMBOL);

		expect(row.trades).toBeUndefined();
	});

	it("should select candles strictly after or before a timestamp", async () => {
		await insertCandles([
			candle(),
			candle({ timestamp: UnixTimestamp.of(T0 + 60_000) }),
		]);

		await expect(selectCandlesBy.timestamp.after(T0)).resolves.toHaveLength(1);
		await expect(
			selectCandlesBy.timestamp.before(UnixTimestamp.of(T0 + 60_000))
		).resolves.toHaveLength(1);
	});
});

describe("market_trades — real MySQL", () => {
	it("should keep trade ids beyond Number.MAX_SAFE_INTEGER exact", async () => {
		const tradeId = 9_007_199_254_740_993n;

		await insertTrades([trade({ tradeId })]);

		const [row] = await selectTradesBy.symbol(SYMBOL);
		expect(BigInt(row.tradeId)).toBe(tradeId);
		expect(row.side).toBe(TradeSide.Buy);
		expect(row.timestamp.getTime()).toBe(T0);
	});

	it("should store a replayed trade once", async () => {
		await insertTrades([trade(), trade({ tradeId: 2n })]);

		await insertTrades([trade({ side: TradeSide.Sell })]);

		await expect(count("market_trades")).resolves.toBe(2);
		await expect(selectTradesBy.timestamp(T0)).resolves.toHaveLength(2);
	});

	it("should reject a side outside the column enum", async () => {
		await expect(
			insertTrades([trade({ side: "hold" as TradeSide })])
		).rejects.toThrow();
		await expect(count("market_trades")).resolves.toBe(0);
	});
});

describe("market_tickers — real MySQL", () => {
	it("should upsert a 24h ticker on its business key", async () => {
		await insertTicker([ticker()]);

		await insertTicker([ticker({ last: Price.of(108) })]);

		await expect(count("market_tickers")).resolves.toBe(1);
		const [row] = await selectTickerBy.timestamp(T0);
		expect(row).toMatchObject({ last: 108, volume: 1234.5 });
		expect(row.closeTimestamp.getTime()).toBe(T0 + 86_399_999);
	});

	it("should insert a whole batch atomically", async () => {
		await expect(
			insertTicker([ticker(), ticker({ symbol: "X".repeat(33) as never })])
		).rejects.toThrow();

		await expect(count("market_tickers")).resolves.toBe(0);
	});
});

describe("market_publish_cursors — real MySQL", () => {
	const SERIES = {
		source: DataSource.Binance,
		symbol: SYMBOL,
		interval: CandleInterval.Min1,
	};
	const minute = (index: number) => UnixTimestamp.of(T0 + index * 60_000);
	const candleOf = (index: number) =>
		candle({
			timestamp: minute(index),
			closeTimestamp: UnixTimestamp.of(minute(index) + 59_999),
		});

	it("should have no cursor for a series never queued", async () => {
		await expect(
			MySqlCandlePublishBacklog.cursor(SERIES)
		).resolves.toBeUndefined();
	});

	it("should save a cursor and move it in place", async () => {
		await MySqlCandlePublishBacklog.saveCursor(SERIES, {
			market: MarketType.Crypto,
			publishedUntil: minute(0),
		});
		await MySqlCandlePublishBacklog.saveCursor(SERIES, {
			market: MarketType.Crypto,
			publishedUntil: UnixTimestamp.of(minute(1) + 1),
		});

		await expect(count("market_publish_cursors")).resolves.toBe(1);
		await expect(MySqlCandlePublishBacklog.cursor(SERIES)).resolves.toEqual({
			market: MarketType.Crypto,
			publishedUntil: minute(1) + 1,
		});
	});

	it("should read back the persisted candles from the cursor, oldest first, as published", async () => {
		await insertCandles([candleOf(2), candleOf(0), candleOf(1), candleOf(3)]);
		await insertCandles([candle({ symbol: TradingSymbol.of("ETHUSDT") })]);
		const cursor = {
			market: MarketType.Crypto,
			publishedUntil: UnixTimestamp.of(minute(0) + 1),
		};

		const batch = await MySqlCandlePublishBacklog.candlesFrom(
			SERIES,
			cursor,
			2
		);

		expect(batch).toEqual([candleOf(1), candleOf(2)]);
		await expect(
			MySqlCandlePublishBacklog.countFrom(SERIES, cursor)
		).resolves.toBe(3);
	});

	it("should leave the trade count out when the column is null", async () => {
		await insertCandles([candle({ trades: undefined })]);

		const [row] = await MySqlCandlePublishBacklog.candlesFrom(
			SERIES,
			{ market: MarketType.Crypto, publishedUntil: T0 },
			10
		);

		expect(row).not.toHaveProperty("trades");
	});
});

describe("signals — real MySQL", () => {
	const OBSERVED = Date.UTC(2026, 10, 3, 12, 0, 0, 125);

	function signal(overrides: Partial<Signal> = {}): Signal {
		return {
			id: "1".repeat(64),
			schemaVersion: 1,
			sourceId: "binance-ticker-24h",
			dimension: "market",
			assetId: "BTC",
			sector: null,
			metric: "last_price",
			value: 78336.01,
			unit: "USDT",
			observedAt: new Date(OBSERVED).toISOString(),
			collectedAt: new Date(OBSERVED + 3000).toISOString(),
			confidenceScore: 0.9,
			attributes: { symbol: "BTCUSDT", fiscalYear: null, amended: false },
			...overrides,
		};
	}

	/** The asset BTC, sector crypto, over the day of OBSERVED. */
	function findBtc(limit = 100) {
		return MySqlSignalStore.findForAsset({
			assetId: "BTC",
			sector: "crypto",
			from: Date.UTC(2026, 10, 3),
			to: Date.UTC(2026, 10, 4),
			limit,
		});
	}

	it("should round-trip a signal with its millisecond instants and attributes", async () => {
		await MySqlSignalStore.save([signal()]);

		await expect(findBtc()).resolves.toEqual([signal()]);
	});

	it("should store a replayed signal once and keep its first value", async () => {
		await MySqlSignalStore.save([signal()]);
		await MySqlSignalStore.save([signal({ value: 1 }), signal()]);

		await expect(count("signals")).resolves.toBe(1);
		await expect(findBtc()).resolves.toEqual([signal()]);
	});

	it("should answer the asset's and its sector's signals of the window, oldest first", async () => {
		const at = (ms: number) => new Date(ms).toISOString();
		await MySqlSignalStore.save([
			signal({ id: "2".repeat(64), observedAt: at(OBSERVED + 60_000) }),
			signal({ id: "3".repeat(64), assetId: null, sector: "crypto" }),
			signal({ id: "4".repeat(64), assetId: "ETH" }),
			signal({ id: "5".repeat(64), assetId: null, sector: "agriculture" }),
			// [from, to): the end of the window is out, its start in.
			signal({ id: "6".repeat(64), observedAt: at(Date.UTC(2026, 10, 4)) }),
			signal({ id: "7".repeat(64), observedAt: at(Date.UTC(2026, 10, 3)) }),
		]);

		const ids = (await findBtc()).map((s) => s.id[0]);

		expect(ids).toEqual(["7", "3", "2"]);
		await expect(findBtc(2)).resolves.toHaveLength(2);
	});

	it("should refuse a row on both an asset and a sector", async () => {
		await expect(
			MySqlSignalStore.save([signal({ sector: "crypto" })])
		).rejects.toThrow(/chk_signals_one_subject/);
	});
});
