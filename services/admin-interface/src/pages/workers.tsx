import AddIcon from "@mui/icons-material/Add";
import BoltIcon from "@mui/icons-material/Bolt";
import DnsIcon from "@mui/icons-material/Dns";
import MemoryIcon from "@mui/icons-material/Memory";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageIcon from "@mui/icons-material/Storage";
import {
	Box,
	Button,
	CircularProgress,
	Grid,
	LinearProgress,
	Typography,
} from "@mui/material";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { InfoBox } from "../components/info-box";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import type { WorkerEntry } from "../types/dtos";

function LoadBar({ value, color }: { value: number; color?: string }) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
			<Box sx={{ flexGrow: 1 }}>
				<LinearProgress
					variant="determinate"
					value={Math.min(value, 100)}
					sx={{
						height: 8,
						borderRadius: 1,
						bgcolor: "#e0e0e0",
						"& .MuiLinearProgress-bar": {
							bgcolor:
								color ??
								(value > 80 ? "#d32f2f" : value > 60 ? "#ed6c02" : "#1976d2"),
						},
					}}
				/>
			</Box>
			<Typography variant="caption" sx={{ minWidth: 36 }}>
				{value}%
			</Typography>
		</Box>
	);
}

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function WorkerStats({
	data,
}: {
	data?: {
		stats: {
			activeWorkers: number;
			totalWorkers: number;
			avgCpu: number;
			totalJobsPerMin: number;
			clusterMemory: number;
		};
	};
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<MemoryIcon />}
					value={`${data?.stats.activeWorkers ?? 0} / ${data?.stats.totalWorkers ?? 0}`}
					label="WORKERS ACTIFS"
					delta="+2 instances provisioned"
					deltaColor="success.main"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<BoltIcon />}
					value={`${data?.stats.avgCpu ?? 0}%`}
					label="CHARGE MOYENNE CPU"
					delta="12% stable over 4h"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<DnsIcon />}
					value={`${data?.stats.totalJobsPerMin ?? 0}`}
					label="TOTAL JOBS/MIN"
					delta="Capacity: 2,500/min"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<StorageIcon />}
					value={`${data?.stats.clusterMemory ?? 0} GB`}
					label="MÉMOIRE CLUSTER"
					delta="64% pool utilization"
				/>
			</Grid>
		</Grid>
	);
}

function WorkerInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<InfoBox
				icon={<RefreshIcon />}
				title="What is 'Drain' mode?"
				description="Draining prepares a node for software update by letting running jobs finish gracefully."
				color="info.main"
			/>
			<InfoBox
				icon={<BoltIcon />}
				title="Auto-scaling"
				description="The system added 3 additional nodes 22 minutes ago due to a traffic spike on API Gateway."
				color="info.main"
			/>
		</Box>
	);
}

export function Workers() {
	const { data, loading, refetch } = useApi(() => API_CLIENT.getWorkers());

	const columns: Column<WorkerEntry>[] = [
		{ id: "id", label: "Worker ID", render: (row) => row.id },
		{
			id: "ip",
			label: "Address",
			render: (row) => (
				<Box>
					<Typography variant="body2">{row.ip}</Typography>
					<Typography variant="caption" color="text.secondary">
						{row.region}
					</Typography>
				</Box>
			),
		},
		{
			id: "cpu",
			label: "CPU / RAM",
			render: (row) => (
				<Box>
					<LoadBar value={row.cpu} />
					<LoadBar value={row.ram} />
				</Box>
			),
		},
		{
			id: "status",
			label: "Status",
			render: (row) => <StatusBadge status={row.status} />,
		},
		{ id: "heartbeat", label: "Heartbeat", render: (row) => row.heartbeat },
		{ id: "jobs", label: "Jobs", render: (row) => String(row.activeJobs) },
	];

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
				<Box>
					<Typography variant="h4" fontWeight={700}>
						Workers
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Distributed compute node lifecycle management.
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 1 }}>
					<Button
						variant="outlined"
						startIcon={<RefreshIcon />}
						onClick={refetch}
					>
						Refresh
					</Button>
					<Button variant="contained" startIcon={<AddIcon />}>
						New Node
					</Button>
				</Box>
			</Box>

			<WorkerStats data={data} />

			<DataTable
				columns={columns}
				rows={data?.workers ?? []}
				getId={(row) => row.id}
				total={data?.workers.length ?? 0}
			/>

			<WorkerInfoBoxes />
		</Box>
	);
}
