/**
 * Downloads historical candles from the public Binance REST API (no key) into
 * a JSON file for scripts/mt4-walk-forward.ts.
 *
 *   bun scripts/fetch-klines.ts <SYMBOL> <interval> <count> <out.json>
 *   bun scripts/fetch-klines.ts BTCUSDT 1h 4000 /tmp/btc-1h.json
 *
 * Writes `{ symbol, interval, klines: [openTime, open, high, low, close,
 * volume, closeTime, quoteVolume, tradeCount, takerBuyVolume][] }`, oldest
 * first, ending at the last closed candle. The last three rebuild the trade
 * features of `--features klines` (scripts/mt4-walk-forward.ts, ADR-0030).
 */
import { writeFileSync } from "node:fs";

const BINANCE_KLINES = "https://api.binance.com/api/v3/klines";
const PAGE = 1000;

/** The first 10 Binance kline fields, as numbers. */
type Kline = number[];
const FIELDS = 10;

async function fetchPage(
	symbol: string,
	interval: string,
	endTime: number
): Promise<Kline[]> {
	const url = `${BINANCE_KLINES}?symbol=${symbol}&interval=${interval}&limit=${PAGE}&endTime=${endTime}`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`${url}: HTTP ${response.status}`);
	}
	const rows = (await response.json()) as (string | number)[][];
	return rows.map((row) => row.slice(0, FIELDS).map((value) => Number(value)));
}

async function main(): Promise<void> {
	const [symbol, interval, countArg, out] = process.argv.slice(2);
	if (!(symbol && interval && countArg && out)) {
		throw new Error(
			"usage: bun scripts/fetch-klines.ts <SYMBOL> <interval> <count> <out.json>"
		);
	}
	const count = Number(countArg);
	const klines: Kline[] = [];
	// The candle still open is excluded: its close is not final.
	let endTime = Date.now();
	while (klines.length < count) {
		const page = (await fetchPage(symbol, interval, endTime)).filter(
			(kline) => kline[6] < Date.now()
		);
		if (page.length === 0) {
			break;
		}
		klines.unshift(...page);
		endTime = page[0][0] - 1;
	}
	const kept = klines.slice(-count);
	writeFileSync(out, JSON.stringify({ symbol, interval, klines: kept }));
	console.log(
		`${symbol} ${interval}: ${kept.length} candles, ${new Date(kept[0][0]).toISOString()} → ${new Date(kept[kept.length - 1][6]).toISOString()}`
	);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
