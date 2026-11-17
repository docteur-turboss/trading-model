import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import type { Signal } from "@trading-model/validation/wire/signals";
import { DAILY_BAR_ISSUES_TOTAL } from "../../config/metrics";
import { DAY_MS } from "../../domain/asset-costs";
import type { TradingSymbol } from "../../domain/market-data-types";
import type { CandleHistoryPort } from "../../domain/ports/candle-history.port";
import type { SignalHistoryPort } from "../../domain/ports/signal-history.port";

/** Calendar days read per bar asked: weekends and holidays leave about 5 bars in 7 days. */
const CALENDAR_DAYS_PER_BAR = 1.5;
/** A close-to-close move beyond this ratio (or its inverse) looks like a split, not a market move. */
const SPLIT_JUMP_RATIO = 1.8;
const FIELDS = ["open", "high", "low", "close", "volume"] as const;

/**
 * Daily bars of a registry asset rebuilt from its own `market` signals
 * (`open`, `high`, `low`, `close`, `volume` of one `period` day; ADR-0082),
 * in the shape of candles. A day missing a metric is dropped and counted; when
 * a day has an `adjusted_close`, the day's prices are scaled to it; a jump
 * that looks like a split is counted and logged, never corrected.
 */
export class SignalBarHistory implements CandleHistoryPort {
	constructor(private readonly _signals: SignalHistoryPort) {}

	async loadWindow(
		symbol: TradingSymbol,
		at: number,
		size: number
	): Promise<CandleData[]> {
		const signals = await this._signals.loadWindow(
			symbol,
			at - Math.ceil(size * CALENDAR_DAYS_PER_BAR) * DAY_MS,
			at
		);
		const days = new Map<string, Map<string, number>>();
		const seenAt = new Map<string, number>();
		for (const signal of signals) {
			const day = _ownMarketDay(signal, symbol);
			if (!day) {
				continue;
			}
			const metrics = days.get(day) ?? new Map<string, number>();
			// Newest observation of a metric wins (a restated price).
			const observed = Date.parse(signal.observedAt);
			const key = `${day}:${signal.payload.metric}`;
			if (observed >= (seenAt.get(key) ?? 0)) {
				seenAt.set(key, observed);
				metrics.set(signal.payload.metric, signal.payload.value);
			}
			days.set(day, metrics);
		}
		const bars: CandleData[] = [];
		for (const day of [...days.keys()].sort()) {
			const bar = _bar(symbol, day, days.get(day) as Map<string, number>);
			if (!bar) {
				DAILY_BAR_ISSUES_TOTAL.inc({ symbol, issue: "incomplete_day" });
				continue;
			}
			const prev = bars[bars.length - 1];
			if (
				prev &&
				(bar.open / prev.close > SPLIT_JUMP_RATIO ||
					prev.close / bar.open > SPLIT_JUMP_RATIO)
			) {
				DAILY_BAR_ISSUES_TOTAL.inc({ symbol, issue: "split_suspect" });
				getLogger().warn("Daily price jump looks like a split: not adjusted", {
					context: { symbol, day, previousClose: prev.close, open: bar.open },
				});
			}
			bars.push(bar);
		}
		return bars.slice(-size);
	}
}

/** The day of an own `market` signal that carries a `period`; otherwise undefined. */
function _ownMarketDay(signal: Signal, assetId: string): string | undefined {
	return signal.dimension === "market" && signal.assetId === assetId
		? signal.payload.period?.start
		: undefined;
}

function _bar(
	symbol: TradingSymbol,
	day: string,
	metrics: Map<string, number>
): CandleData | undefined {
	if (FIELDS.some((field) => !metrics.has(field))) {
		return;
	}
	const adjusted = metrics.get("adjusted_close");
	const close = metrics.get("close") as number;
	const factor = adjusted !== undefined && close > 0 ? adjusted / close : 1;
	const price = (field: string): number =>
		(metrics.get(field) as number) * factor;
	const timestamp = Date.parse(day);
	return {
		source: "signals",
		market: "equity",
		symbol,
		interval: CandleInterval.D1,
		open: price("open"),
		high: price("high"),
		low: price("low"),
		close: price("close"),
		volume: metrics.get("volume"),
		timestamp,
		closeTimestamp: timestamp + DAY_MS - 1,
	} as unknown as CandleData;
}
