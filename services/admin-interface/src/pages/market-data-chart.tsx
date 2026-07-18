import { Box, Typography } from "@mui/material";
import type { Price } from "@trading-model/common/domain/primitives";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

function NoDataFallback() {
	return (
		<Typography variant="body2" color="text.secondary">
			No data available
		</Typography>
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

export function PriceChart({
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
