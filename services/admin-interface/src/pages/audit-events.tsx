import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import {
	Box,
	Button,
	CircularProgress,
	MenuItem,
	TextField,
	Typography,
} from "@mui/material";
import {
	toCorrelationId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import { useState } from "react";
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { DataTable } from "../components/data-table";
import { SeverityBadge } from "../components/severity-badge";
import { StatsCard } from "../components/stats-card";
import type { Column } from "../components/data-table";
import { useAuditEvents } from "../hooks/use-audit-events";
import type { AuditEvent, AuditFilter } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function TotalEventsCard({ total }: { total: number }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<MonitorHeartIcon />}
				value={total.toLocaleString()}
				label="TOTAL EVENTS (24H)"
				delta="+12.4% vs yesterday"
				deltaColor="success.main"
			/>
		</Box>
	);
}

function ErrorRateCard() {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<WarningAmberIcon />}
				value="0.04%"
				label="ERROR RATE"
				delta="Stability: Optimal"
				deltaColor="success.main"
			/>
		</Box>
	);
}

function AuditStats({ data }: { data: { total: number } | null | undefined }) {
	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<TotalEventsCard total={data?.total ?? 0} />
			<ErrorRateCard />
		</Box>
	);
}

function ChartArea({ data }: { data: { topic: string; count: number }[] }) {
	return (
		<Box sx={{ height: 200, mb: 3 }}>
			<ResponsiveContainer width="100%" height="100%">
				<BarChart data={data}>
					<XAxis dataKey="topic" />
					<YAxis />
					<Tooltip />
					<Bar dataKey="count" fill="#1976d2" />
				</BarChart>
			</ResponsiveContainer>
		</Box>
	);
}

function VolumeByTopicChart({
	data,
}: {
	data: { topic: string; count: number }[];
}) {
	return (
		<>
			<Typography variant="subtitle2" sx={{ mb: 1 }}>
				Volume by Topic
			</Typography>
			<ChartArea data={data} />
		</>
	);
}

function EventSearchField({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			size="small"
			placeholder="Search by Correlation ID, Payload or Message..."
			value={value}
			onChange={(evt) => onChange(evt.target.value)}
			sx={{ minWidth: 300 }}
		/>
	);
}

function TopicSelect({
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
			onChange={(evt) => onChange(evt.target.value || "")}
			sx={{ minWidth: 140 }}
		>
			<MenuItem value="">All Topics</MenuItem>
			<MenuItem value="AUTH">AUTH</MenuItem>
			<MenuItem value="ORDER">ORDER</MenuItem>
			<MenuItem value="PAYMENT">PAYMENT</MenuItem>
			<MenuItem value="INVENTORY">INVENTORY</MenuItem>
			<MenuItem value="NOTIF">NOTIF</MenuItem>
		</TextField>
	);
}

function ApplyFilterButton({ onClick }: { onClick: () => void }) {
	return (
		<Button variant="contained" size="small" onClick={onClick}>
			Apply
		</Button>
	);
}

function AuditFilterBar({
	filter,
	onFilterChange,
	onApply,
}: {
	filter: AuditFilter;
	onFilterChange: (filter: AuditFilter) => void;
	onApply: () => void;
}) {
	return (
		<Box sx={{ display: "flex", gap: 2, alignItems: "center", mb: 2 }}>
			<EventSearchField
				value={filter.correlationId ?? ""}
				onChange={(value) =>
					onFilterChange({ ...filter, correlationId: toCorrelationId(value) })
				}
			/>
			<TopicSelect
				value={filter.topic ?? ""}
				onChange={(value) =>
					onFilterChange({
						...filter,
						topic: value ? toTopic(value) : undefined,
					})
				}
			/>
			<ApplyFilterButton onClick={onApply} />
		</Box>
	);
}

function AuditPageHeader({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" fontWeight={700}>
					Audit Events
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Distributed observability and real-time log streams.
				</Typography>
			</Box>
			<Button
				variant="outlined"
				startIcon={<RefreshIcon />}
				onClick={onRefresh}
			>
				Refresh
			</Button>
		</Box>
	);
}

import { createAuditColumns } from "./helpers/audit-utils";

function useAuditColumns(): Column<AuditEvent>[] {
	return createAuditColumns().map((col) =>
		col.id === "severity"
			? { ...col, render: (row: AuditEvent) => <SeverityBadge severity={row.severity} /> }
			: col
	) as Column<AuditEvent>[];
}

export function AuditEvents() {
	const [filter, setFilter] = useState<AuditFilter>({});
	const { data, loading, refetch } = useAuditEvents(filter);
	const columns = useAuditColumns();
	const chartData = data?.volumeByTopic ?? [];

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<AuditPageHeader onRefresh={refetch} />

			<AuditStats data={data} />

			<VolumeByTopicChart data={chartData} />

			<AuditFilterBar
				filter={filter}
				onFilterChange={setFilter}
				onApply={() => refetch()}
			/>

			<DataTable
				columns={columns}
				rows={data?.events ?? []}
				getId={(row) => `${row.timestamp}-${row.correlationId}`}
				total={data?.total ?? 0}
			/>
		</Box>
	);
}
