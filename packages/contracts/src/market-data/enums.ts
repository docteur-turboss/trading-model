export enum MarketType {
	Crypto = "crypto",
	Equity = "equity",
	Bond = "bond",
	Etf = "etf",
	Fx = "fx",
	Future = "future",
}

export namespace MarketType {
	export const values = (): MarketType[] =>
		Object.values(MarketType).filter(
			(value): value is MarketType => typeof value === "string"
		);
}

export enum SourceType {
	Bloomberg = "bloomberg",
	Binance = "binance",
	Nyse = "nyse",
}

export namespace SourceType {
	export const values = (): SourceType[] =>
		Object.values(SourceType).filter(
			(value): value is SourceType => typeof value === "string"
		);
}

export enum CandleInterval {
	S1 = "1s",
	Min1 = "1m",
	Min3 = "3m",
	Min5 = "5m",
	Min15 = "15m",
	Min30 = "30m",
	H1 = "1h",
	H2 = "2h",
	H4 = "4h",
	H6 = "6h",
	H8 = "8h",
	H12 = "12h",
	D1 = "1d",
	D3 = "3d",
	W1 = "1w",
	Month1 = "1M",
}

export namespace CandleInterval {
	export const values = (): CandleInterval[] =>
		Object.values(CandleInterval).filter(
			(value): value is CandleInterval => typeof value === "string"
		);

	const UNIT_MS = {
		s: 1000,
		m: 60_000,
		h: 3_600_000,
		d: 86_400_000,
		w: 604_800_000,
		M: 2_592_000_000,
	};

	/** Length of a bar in ms (a month = 30 d). */
	export const toMs = (interval: CandleInterval): number => {
		const [, count, unit] = /^(\d+)([smhdwM])$/.exec(interval) ?? [];
		return Number(count) * UNIT_MS[unit as keyof typeof UNIT_MS];
	};
}
