import {
	Percentage,
	type Price,
} from "@trading-model/common/domain/primitives";
import type { Column } from "../../components/data-table";
import type { Candle } from "../../types/dtos";

export function computePriceChange(candles: Candle[] | null | undefined): {
	chartData?: { time: number; price: Price }[];
	lastPrice?: Price;
	change: Percentage;
} {
	const chartData = candles?.map((candle) => ({
		time: candle.timestamp as number,
		price: candle.close,
	}));
	const lastPrice = candles?.[candles.length - 1]?.close;
	const prevPrice = candles?.[0]?.close;
	const change = Percentage.of(
		lastPrice && prevPrice ? ((lastPrice - prevPrice) / prevPrice) * 100 : 0
	);
	return { chartData, lastPrice, change };
}

export function createCandleColumns(): Column<Candle>[] {
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
