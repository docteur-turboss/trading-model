import { Box, Chip, MenuItem, TextField, Typography } from "@mui/material";
import { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

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
			<MenuItem value={CandleInterval.Min1}>1 Minute</MenuItem>
			<MenuItem value={CandleInterval.Min5}>5 Minutes</MenuItem>
			<MenuItem value={CandleInterval.Min15}>15 Minutes</MenuItem>
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

export function MarketDataToolbar({
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
