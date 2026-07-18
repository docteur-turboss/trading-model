import { Box, CircularProgress } from "@mui/material";
import { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import { useState } from "react";

import { API_CLIENT } from "../api/api-client";
import { useApi } from "../hooks/use-api";
import { computePriceChange } from "./helpers/market-data-utils";
import { PriceChart } from "./market-data-chart";
import { MarketDataToolbar } from "./market-data-controls";
import { MarketDataStats } from "./market-data-stats";
import { CandleDataTable } from "./market-data-table";
import { MarketDataTabs } from "./market-data-tabs";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

export function MarketData() {
	const [symbol, setSymbol] = useState<TradingSymbol>(
		"BTCUSDT" as TradingSymbol
	);
	const [candleInterval, setCandleInterval] = useState<CandleInterval>(
		CandleInterval.H1
	);
	const [tab, setTab] = useState(0);
	const { data: candles, loading } = useApi(
		() => API_CLIENT.getCandles({ symbol, interval: candleInterval }),
		[symbol, candleInterval]
	);
	const { chartData, lastPrice, change } = computePriceChange(candles);

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<MarketDataToolbar
				symbol={symbol}
				onSymbolChange={setSymbol}
				interval={candleInterval}
				onIntervalChange={setCandleInterval}
			/>

			<MarketDataStats lastPrice={lastPrice} change={change} />

			<MarketDataTabs tab={tab} onTabChange={setTab} />

			<PriceChart chartData={chartData} />

			<CandleDataTable candles={candles} />
		</Box>
	);
}
