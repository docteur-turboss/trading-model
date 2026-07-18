import type { PositiveInt, UnixTimestamp } from "../../domain/primitives";
import type { BaseMarketData } from "./base.types";
import type { CandleInterval } from "./enums";
import type { OhlcvData } from "./ohlcv.types";

export interface CandleData extends BaseMarketData, OhlcvData {
	trades?: PositiveInt;
	interval: CandleInterval;
	closeTimestamp: UnixTimestamp;
}
