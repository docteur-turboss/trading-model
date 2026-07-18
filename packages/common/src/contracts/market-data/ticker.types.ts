import type { Price, UnixTimestamp, Volume } from "../../domain/primitives";
import type { BaseMarketData } from "./base.types";
import type { OhlcvFields } from "./ohlcv.types";

export interface OhlcvTickerData
	extends Omit<OhlcvFields<Price, Volume>, "close"> {
	last: Price;
}

export interface TickerData extends BaseMarketData, OhlcvTickerData {
	closeTimestamp: UnixTimestamp;
}
