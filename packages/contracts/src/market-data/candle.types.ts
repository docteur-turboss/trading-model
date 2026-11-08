import type {
	NonNegativeInt,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { BaseMarketData } from "./base.types";
import type { CandleInterval } from "./enums";
import type { OhlcvData } from "./ohlcv.types";

export interface CandleData extends BaseMarketData, OhlcvData {
	/** Number of trades in the candle: 0 for a candle nobody traded in. */
	trades?: NonNegativeInt;
	interval: CandleInterval;
	closeTimestamp: UnixTimestamp;
}
