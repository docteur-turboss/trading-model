import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleData } from "@trading-model/contracts/market-data.types";
import {
	CandleInterval,
	MarketType,
	type SourceType,
} from "@trading-model/contracts/market-data.types";
import type { AssetType, Signal } from "@trading-model/contracts/wire/signals";
import {
	Price,
	type TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/primitives/primitives";
import type { SignalHistoryPort } from "./scraper-signal-history";

const DAY_MS = 86_400_000;

/** Calendar days read per bar asked: weekends and holidays leave about 5 bars in 7 days. */
const CALENDAR_DAYS_PER_BAR = 1.5;
/** A close-to-close move beyond this ratio (or its inverse) looks like a split, not a market move. */
const SPLIT_JUMP_RATIO = 1.8;
/** Market of a registry asset type; funds of real estate and commodities trade as ETFs. */
const MARKETS: Record<AssetType, MarketType> = {
	crypto: MarketType.Crypto,
	equity: MarketType.Equity,
	etf: MarketType.Etf,
	bond: MarketType.Bond,
	real_estate: MarketType.Etf,
	commodity_proxy: MarketType.Etf,
};
/** `signals` is no exchange of the SourceType enum: the bars come from the signal store. */
const SOURCE = "signals" as SourceType;
const FIELDS = ["open", "high", "low", "close", "volume"] as const;

/**
 * Daily bars of a registry asset rebuilt from its own `market` signals
 * (`open`, `high`, `low`, `close`, `volume` of one `period` day; ADR-0083),
 * in the shape of candles. A day missing a metric is dropped and counted; when
 * a day has an `adjusted_close`, the day's prices are scaled to it; a jump
 * that looks like a split is counted and logged, never corrected.
 */
export class SignalBarHistory {
	/** `onIssue` counts a dropped or suspect day (`incomplete_day`, `split_suspect`). */
	constructor(
		private readonly _signals: SignalHistoryPort,
		private readonly _assets: ReadonlyMap<TradingSymbol, AssetType>,
		private readonly _onIssue: (symbol: string, issue: string) => void = () =>
			undefined
	) {}

	/** Issues already counted: a day is counted once, not at every cycle that reads it. */
	private readonly _counted = new Set<string>();

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
			const bar = _bar(
				symbol,
				MARKETS[this._assets.get(symbol) ?? "equity"],
				day,
				days.get(day) as Map<string, number>
			);
			if (!bar) {
				this._count(symbol, day, "incomplete_day");
				continue;
			}
			const prev = bars[bars.length - 1];
			if (
				prev &&
				(bar.open / prev.close > SPLIT_JUMP_RATIO ||
					prev.close / bar.open > SPLIT_JUMP_RATIO) &&
				this._count(symbol, day, "split_suspect")
			) {
				getLogger().warn("Daily price jump looks like a split: not adjusted", {
					context: { symbol, day, previousClose: prev.close, open: bar.open },
				});
			}
			bars.push(bar);
		}
		return bars.slice(-size);
	}

	/** Counts an issue of a day once; false when it was already counted. */
	private _count(symbol: TradingSymbol, day: string, issue: string): boolean {
		const key = `${symbol}:${day}:${issue}`;
		if (this._counted.has(key)) {
			return false;
		}
		this._counted.add(key);
		this._onIssue(symbol, issue);
		return true;
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
	market: MarketType,
	day: string,
	metrics: Map<string, number>
): CandleData | undefined {
	if (FIELDS.some((field) => !metrics.has(field))) {
		return;
	}
	const adjusted = metrics.get("adjusted_close");
	const close = metrics.get("close") as number;
	const factor = adjusted !== undefined && close > 0 ? adjusted / close : 1;
	const price = (field: string): Price =>
		Price.of((metrics.get(field) as number) * factor);
	const timestamp = UnixTimestamp.of(Date.parse(day));
	return {
		source: SOURCE,
		market,
		symbol,
		interval: CandleInterval.D1,
		open: price("open"),
		high: price("high"),
		low: price("low"),
		close: price("close"),
		volume: Volume.of(metrics.get("volume") as number),
		timestamp,
		closeTimestamp: UnixTimestamp.of(timestamp + DAY_MS - 1),
	};
}
