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
import { useState } from "react";
import {
	Bar,
	BarChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { SeverityBadge } from "../components/severity-badge";
import { StatsCard } from "../components/stats-card";
import { useAuditEvents } from "../hooks/use-audit-events";
import type { AuditEvent, AuditFilter } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function AuditStats({ data }: { data: { total: number } | null | undefined }) {
	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<MonitorHeartIcon />}
					value={(data?.total ?? 0).toLocaleString()}
					label="TOTAL EVENTS (24H)"
					delta="+12.4% vs yesterday"
					deltaColor="success.main"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<WarningAmberIcon />}
					value="0.04%"
					label="ERROR RATE"
					delta="Stability: Optimal"
					deltaColor="success.main"
				/>
			</Box>
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
		</>
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
			<TextField
				size="small"
				placeholder="Search by Correlation ID, Payload or Message..."
				value={filter.correlationId ?? ""}
				onChange={(evt) =>
					onFilterChange({ ...filter, correlationId: evt.target.value })
				}
				sx={{ minWidth: 300 }}
			/>
			<TextField
				size="small"
				select
				value={filter.topic ?? ""}
				onChange={(evt) =>
					onFilterChange({
						...filter,
						topic: evt.target.value || undefined,
					})
				}
				sx={{ minWidth: 140 }}
			>
				<MenuItem value="">All Topics</MenuItem>
				<MenuItem value="AUTH">AUTH</MenuItem>
				<MenuItem value="ORDER">ORDER</MenuItem>
				<MenuItem value="PAYMENT">PAYMENT</MenuItem>
				<MenuItem value="INVENTORY">INVENTORY</MenuItem>
				<MenuItem value="NOTIF">NOTIF</MenuItem>
			</TextField>
			<Button variant="contained" size="small" onClick={onApply}>
				Apply
			</Button>
		</Box>
	);
}

export function AuditEvents() {
	const [filter, setFilter] = useState<AuditFilter>({});
	const { data, loading, refetch } = useAuditEvents(filter);

	const columns: Column<AuditEvent>[] = [
		{ id: "timestamp", label: "Timestamp", render: (row) => row.timestamp },
		{ id: "topic", label: "Topic", render: (row) => row.topic },
		{ id: "publisher", label: "Publisher", render: (row) => row.publisher },
		{ id: "cid", label: "Correlation ID", render: (row) => row.correlationId },
		{ id: "summary", label: "Summary", render: (row) => row.summary },
		{
			id: "severity",
			label: "Severity",
			render: (row) => <SeverityBadge severity={row.severity} />,
		},
	];

	const chartData = data?.volumeByTopic ?? [];

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
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
					onClick={refetch}
				>
					Refresh
				</Button>
			</Box>

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
