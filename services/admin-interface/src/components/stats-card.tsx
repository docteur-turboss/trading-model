import { Box, Card, CardContent, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface StatsCardProps {
	icon: ReactNode;
	value: string;
	label: string;
	delta?: string;
	deltaColor?: string;
}

function DeltaIndicator({
	delta,
	deltaColor,
}: {
	delta?: string;
	deltaColor?: string;
}) {
	if (!delta) {
		return null;
	}
	return (
		<Typography
			variant="caption"
			sx={{
				color: deltaColor ?? "text.secondary",
				display: "block",
				mt: 0.5,
			}}
		>
			{delta}
		</Typography>
	);
}

function MetricRow({
	icon,
	value,
	label,
	delta,
	deltaColor,
}: {
	icon: ReactNode;
	value: string;
	label: string;
	delta?: string;
	deltaColor?: string;
}) {
	return (
		<Box sx={{ display: "flex", alignItems: "flex-start", gap: 2, padding: 2 }}>
			<Box sx={{ color: "primary.main", mt: 0.5 }}>{icon}</Box>
			<Box>
				<Typography variant="h5" fontWeight={700}>
					{value}
				</Typography>
				<Typography
					variant="subtitle2"
					sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
				>
					{label}
				</Typography>
				<DeltaIndicator delta={delta} deltaColor={deltaColor} />
			</Box>
		</Box>
	);
}

function StatsCardBody({
	icon,
	value,
	label,
	delta,
	deltaColor,
}: {
	icon: ReactNode;
	value: string;
	label: string;
	delta?: string;
	deltaColor?: string;
}) {
	return (
		<CardContent sx={{ padding: 0 }}>
			<MetricRow
				icon={icon}
				value={value}
				label={label}
				delta={delta}
				deltaColor={deltaColor}
			/>
		</CardContent>
	);
}

/** Metric card displaying a value, label, and optional delta indicator. */
export function StatsCard({
	icon,
	value,
	label,
	delta,
	deltaColor,
}: StatsCardProps) {
	return (
		<Card sx={{ height: "100%" }}>
			<StatsCardBody
				icon={icon}
				value={value}
				label={label}
				delta={delta}
				deltaColor={deltaColor}
			/>
		</Card>
	);
}
