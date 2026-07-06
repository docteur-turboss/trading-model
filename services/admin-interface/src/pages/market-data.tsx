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
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatsCard } from "../components/stats-card";
import { useApi } from "../hooks/use-api";
import type { Candle } from "../types/dtos";

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
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			size="small"
			select
			value={value}
			onChange={(evt) => onChange(evt.target.value)}
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
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			size="small"
			select
			value={value}
			onChange={(evt) => onChange(evt.target.value)}
			sx={{ minWidth: 100 }}
		>
			<MenuItem value="1m">1 Minute</MenuItem>
			<MenuItem value="5m">5 Minutes</MenuItem>
			<MenuItem value="15m">15 Minutes</MenuItem>
			<MenuItem value="1h">1 Hour</MenuItem>
			<MenuItem value="4h">4 Hours</MenuItem>
			<MenuItem value="1d">1 Day</MenuItem>
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
	symbol: string;
	onSymbolChange: (value: string) => void;
	interval: string;
	onIntervalChange: (value: string) => void;
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
	lastPrice?: number;
	change: number;
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
	lastPrice?: number;
	change: number;
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

function PriceAreaChart({ data }: { data: { time: number; price: number }[] }) {
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
	chartData?: { time: number; price: number }[];
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
	chartData?: { time: number; price: number }[];
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

function computePriceChange(candles: Candle[] | null | undefined): {
	chartData?: { time: number; price: number }[];
	lastPrice?: number;
	change: number;
} {
	const chartData = candles?.map((candle) => ({
		time: candle.timestamp,
		price: candle.close,
	}));
	const lastPrice = candles?.[candles.length - 1]?.close;
	const prevPrice = candles?.[0]?.close;
	const change =
		lastPrice && prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0;
	return { chartData, lastPrice, change };
}

function createCandleColumns(): Column<Candle>[] {
	return [
		{ id: "time", label: "Timestamp", render: (row) => row.timestamp },
		{
			id: "open",
			label: "Open",
			render: (row) => `$${row.open.toLocaleString()}`,
		},
		{
			id: "high",
			label: "High",
			render: (row) => `$${row.high.toLocaleString()}`,
		},
		{
			id: "low",
			label: "Low",
			render: (row) => `$${row.low.toLocaleString()}`,
		},
		{
			id: "close",
			label: "Close",
			render: (row) => `$${row.close.toLocaleString()}`,
		},
		{ id: "volume", label: "Volume", render: (row) => row.volume.toFixed(3) },
	];
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
	symbol: string;
	onSymbolChange: (value: string) => void;
	interval: string;
	onIntervalChange: (value: string) => void;
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
	const [symbol, setSymbol] = useState("BTCUSDT");
	const [interval, setInterval] = useState("1h");
	const [tab, setTab] = useState(0);
	const { data: candles, loading } = useApi(
		() => API_CLIENT.getCandles(symbol, interval),
		[symbol, interval]
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
				interval={interval}
				onIntervalChange={setInterval}
			/>

			<MarketDataStats lastPrice={lastPrice} change={change} />

			<MarketDataTabs tab={tab} onTabChange={setTab} />

			<PriceChart chartData={chartData} />

			<CandleDataTable candles={candles} />
		</Box>
	);
}
