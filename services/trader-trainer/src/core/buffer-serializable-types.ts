import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";
import type { NormalizationStats } from "./normalization-stats";

export interface SymbolStateSerializable {
	candles: CandleData[];
	trades: TradeData[];
	orderBook: OrderBookData | null;
	bookTicker: BookTickerData | null;
	ticker24h: TickerData | null;
	closeNorm: ReturnType<NormalizationStats["toJSON"]>;
	volumeNorm: ReturnType<NormalizationStats["toJSON"]>;
	openNorm: ReturnType<NormalizationStats["toJSON"]>;
	highNorm: ReturnType<NormalizationStats["toJSON"]>;
	lowNorm: ReturnType<NormalizationStats["toJSON"]>;
	tradePriceNorm: ReturnType<NormalizationStats["toJSON"]>;
	tradeQtyNorm: ReturnType<NormalizationStats["toJSON"]>;
	bidNorm: ReturnType<NormalizationStats["toJSON"]>;
	askNorm: ReturnType<NormalizationStats["toJSON"]>;
	spreadNorm: ReturnType<NormalizationStats["toJSON"]>;
	tickerVolumeNorm: ReturnType<NormalizationStats["toJSON"]>;
}
