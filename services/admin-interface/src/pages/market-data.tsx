import InfoIcon from "@mui/icons-material/Info";
import StorageIcon from "@mui/icons-material/Storage";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Box,
	Chip,
	CircularProgress,
	Grid,
	MenuItem,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import { CandleInterval } from "@trading-model/common/config/event.types";
import type {
	Percentage,
	Price,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { useState } from "react";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

import { API_CLIENT } from "../api/api-client";
import { DataTable } from "../components/data-table";
import { StatsCard } from "../components/stats-card";
import { useApi } from "../hooks/use-api";
import type { Candle } from "../types/dtos";
import {
	computePriceChange,
	createCandleColumns,
} from "./helpers/market-data-utils";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function SymbolSelect({
	value,
	onChange,
}: {
	value: TradingSymbol;
	onChange: (value: TradingSymbol) => void;
}) {
	return (
		<TextField
			size="small"
			select
			value={value}
			onChange={(evt) => onChange(evt.target.value as TradingSymbol)}
			sx={{ minWidth: 120 }}
		>
			<MenuItem value="BTCUSDT">BTC / USD</MenuItem>
			<MenuItem value="ETHUSDT">ETH / USD</MenuItem>
			<MenuItem value="SOLUSDT">SOL / USD</MenuItem>
		</TextField>
	);
}

function IntervalSelect({
	value,
	onChange,
}: {
	value: CandleInterval;
	onChange: (value: CandleInterval) => void;
}) {
	return (
		<TextField
			size="small"
			select
			value={value}
			onChange={(evt) => onChange(evt.target.value as CandleInterval)}
			sx={{ minWidth: 100 }}
		>
			<MenuItem value={CandleInterval.MIN1}>1 Minute</MenuItem>
			<MenuItem value={CandleInterval.MIN5}>5 Minutes</MenuItem>
			<MenuItem value={CandleInterval.MIN15}>15 Minutes</MenuItem>
			<MenuItem value={CandleInterval.H1}>1 Hour</MenuItem>
			<MenuItem value={CandleInterval.H4}>4 Hours</MenuItem>
			<MenuItem value={CandleInterval.D1}>1 Day</MenuItem>
		</TextField>
	);
}

function AggregationSelect() {
	return (
		<TextField
			size="small"
			select
			defaultValue="aggregated"
			sx={{ minWidth: 140 }}
		>
			<MenuItem value="aggregated">Aggregated</MenuItem>
		</TextField>
	);
}

function MarketDataControls({
	symbol,
	onSymbolChange,
	interval,
	onIntervalChange,
}: {
	symbol: TradingSymbol;
	onSymbolChange: (value: TradingSymbol) => void;
	interval: CandleInterval;
	onIntervalChange: (value: CandleInterval) => void;
}) {
	return (
		<Box sx={{ display: "flex", gap: 2 }}>
			<SymbolSelect value={symbol} onChange={onSymbolChange} />
			<IntervalSelect value={interval} onChange={onIntervalChange} />
			<AggregationSelect />
		</Box>
	);
}

function LastPriceCard({
	lastPrice,
	change,
}: {
	lastPrice?: Price;
	change: Percentage;
}) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={
					change >= 0 ? (
						<TrendingUpIcon color="success" />
					) : (
						<TrendingDownIcon color="error" />
					)
				}
				value={lastPrice ? `$${lastPrice.toLocaleString()}` : "-"}
				label="DERNIER PRIX"
				delta={`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
				deltaColor={change >= 0 ? "success.main" : "error.main"}
			/>
		</Grid>
	);
}

function High24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard icon={<InfoIcon />} value={"-"} label="HAUT 24H" />
		</Grid>
	);
}

function Low24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<WarningAmberIcon color="error" />}
				value={"-"}
				label="BAS 24H"
			/>
		</Grid>
	);
}

function Volume24hCard() {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard icon={<StorageIcon />} value={"-"} label="VOLUME 24H" />
		</Grid>
	);
}

function MarketDataStats({
	lastPrice,
	change,
}: {
	lastPrice?: Price;
	change: Percentage;
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<LastPriceCard lastPrice={lastPrice} change={change} />
			<High24hCard />
			<Low24hCard />
			<Volume24hCard />
		</Grid>
	);
}

function PriceAreaChart({ data }: { data: { time: number; price: Price }[] }) {
	return (
		<ResponsiveContainer width="100%" height="100%">
			<AreaChart data={data}>
				<defs>
					<linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
						<stop offset="5%" stopColor="#1976d2" stopOpacity={0.3} />
						<stop offset="95%" stopColor="#1976d2" stopOpacity={0} />
					</linearGradient>
				</defs>
				<XAxis dataKey="time" />
				<YAxis domain={["auto", "auto"]} />
				<Tooltip />
				<Area
					type="monotone"
					dataKey="price"
					stroke="#1976d2"
					fill="url(#colorPrice)"
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}

function NoDataFallback() {
	return (
		<Typography variant="body2" color="text.secondary">
			No data available
		</Typography>
	);
}

function ChartContent({
	chartData,
}: {
	chartData?: { time: number; price: Price }[];
}) {
	return chartData && chartData.length > 0 ? (
		<PriceAreaChart data={chartData} />
	) : (
		<NoDataFallback />
	);
}

function PriceChart({
	chartData,
}: {
	chartData?: { time: number; price: Price }[];
}) {
	return (
		<Box sx={{ height: 300, mb: 3 }}>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Price Chart
			</Typography>
			<Box sx={{ height: 260 }}>
				<ChartContent chartData={chartData} />
			</Box>
		</Box>
	);
}

function MarketDataHeader() {
	return (
		<Box>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
				<Typography variant="h4" fontWeight={700}>
					Market Data
				</Typography>
				<Chip label="LIVE" size="small" color="success" />
			</Box>
			<Typography variant="body2" color="text.secondary">
				Real-time financial data streams and multi-source aggregation.
			</Typography>
		</Box>
	);
}

function MarketDataTabs({
	tab,
	onTabChange,
}: {
	tab: number;
	onTabChange: (newTab: number) => void;
}) {
	return (
		<Tabs
			value={tab}
			onChange={(_, newTab) => onTabChange(newTab)}
			sx={{ mb: 2 }}
		>
			<Tab label="Candles" />
			<Tab label="Transactions" />
			<Tab label="Order Book" />
			<Tab label="Tickers 24h" />
		</Tabs>
	);
}

function MarketDataToolbar({
	symbol,
	onSymbolChange,
	interval,
	onIntervalChange,
}: {
	symbol: TradingSymbol;
	onSymbolChange: (value: TradingSymbol) => void;
	interval: CandleInterval;
	onIntervalChange: (value: CandleInterval) => void;
}) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<MarketDataHeader />
			<MarketDataControls
				symbol={symbol}
				onSymbolChange={onSymbolChange}
				interval={interval}
				onIntervalChange={onIntervalChange}
			/>
		</Box>
	);
}

function CandleDataTable({
	candles,
}: {
	candles: Candle[] | null | undefined;
}) {
	return (
		<>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Historical Candle Data
			</Typography>
			<DataTable
				columns={createCandleColumns()}
				rows={candles ?? []}
				getId={(row) => String(row.timestamp)}
				total={candles?.length ?? 0}
			/>
		</>
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
