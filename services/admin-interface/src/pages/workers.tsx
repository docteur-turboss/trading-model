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
import { getLoadColor } from "./helpers/workers-utils";

function LoadProgress({ value, color }: { value: number; color?: string }) {
	return (
		<Box sx={{ flexGrow: 1 }}>
			<LinearProgress
				variant="determinate"
				value={Math.min(value, 100)}
				sx={{
					height: 8,
					borderRadius: 1,
					bgcolor: "#e0e0e0",
					"& .MuiLinearProgress-bar": {
						bgcolor: color ?? getLoadColor(value),
					},
				}}
			/>
		</Box>
	);
}

function LoadPct({ value }: { value: number }) {
	return (
		<Typography variant="caption" sx={{ minWidth: 36 }}>
			{value}%
		</Typography>
	);
}

function LoadBar({ value, color }: { value: number; color?: string }) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
			<LoadProgress value={value} color={color} />
			<LoadPct value={value} />
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

function ActiveWorkersCard({
	active,
	total,
}: {
	active: number;
	total: number;
}) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<MemoryIcon />}
				value={`${active} / ${total}`}
				label="WORKERS ACTIFS"
				delta="+2 instances provisioned"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function AvgCpuCard({ cpu }: { cpu: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<BoltIcon />}
				value={`${cpu}%`}
				label="CHARGE MOYENNE CPU"
				delta="12% stable over 4h"
			/>
		</Grid>
	);
}

function TotalJobsPerMinCard({ count }: { count: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<DnsIcon />}
				value={String(count)}
				label="TOTAL JOBS/MIN"
				delta="Capacity: 2,500/min"
			/>
		</Grid>
	);
}

function ClusterMemoryCard({ memory }: { memory: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<StorageIcon />}
				value={`${memory} GB`}
				label="MÉMOIRE CLUSTER"
				delta="64% pool utilization"
			/>
		</Grid>
	);
}

function WorkerStats({
	data,
}: {
	data:
		| {
				stats: {
					activeWorkers: number;
					totalWorkers: number;
					avgCpu: number;
					totalJobsPerMin: number;
					clusterMemory: number;
				};
		  }
		| null
		| undefined;
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<ActiveWorkersCard
				active={data?.stats.activeWorkers ?? 0}
				total={data?.stats.totalWorkers ?? 0}
			/>
			<AvgCpuCard cpu={data?.stats.avgCpu ?? 0} />
			<TotalJobsPerMinCard count={data?.stats.totalJobsPerMin ?? 0} />
			<ClusterMemoryCard memory={data?.stats.clusterMemory ?? 0} />
		</Grid>
	);
}

function DrainModeBox() {
	return (
		<InfoBox
			icon={<RefreshIcon />}
			title="What is 'Drain' mode?"
			description="Draining prepares a node for software update by letting running jobs finish gracefully."
			color="info.main"
		/>
	);
}

function AutoScalingBox() {
	return (
		<InfoBox
			icon={<BoltIcon />}
			title="Auto-scaling"
			description="The system added 3 additional nodes 22 minutes ago due to a traffic spike on API Gateway."
			color="info.main"
		/>
	);
}

function WorkerInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<DrainModeBox />
			<AutoScalingBox />
		</Box>
	);
}

function AddressCell({ ip, region }: { ip: string; region: string }) {
	return (
		<Box>
			<Typography variant="body2">{ip}</Typography>
			<Typography variant="caption" color="text.secondary">
				{region}
			</Typography>
		</Box>
	);
}

function CpuRamCell({ cpu, ram }: { cpu: number; ram: number }) {
	return (
		<Box>
			<LoadBar value={cpu} />
			<LoadBar value={ram} />
		</Box>
	);
}

function WorkersPageHeader({ onRefresh }: { onRefresh: () => void }) {
	return (
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
					onClick={onRefresh}
				>
					Refresh
				</Button>
				<Button variant="contained" startIcon={<AddIcon />}>
					New Node
				</Button>
			</Box>
		</Box>
	);
}

function useWorkerColumns(): Column<WorkerEntry>[] {
	return [
		{ id: "id", label: "Worker ID", render: (row) => row.id },
		{
			id: "ip",
			label: "Address",
			render: (row) => <AddressCell ip={row.ip} region={row.region} />,
		},
		{
			id: "cpu",
			label: "CPU / RAM",
			render: (row) => <CpuRamCell cpu={row.cpu} ram={row.ram} />,
		},
		{
			id: "status",
			label: "Status",
			render: (row) => <StatusBadge status={row.status} />,
		},
		{ id: "heartbeat", label: "Heartbeat", render: (row) => row.heartbeat },
		{ id: "jobs", label: "Jobs", render: (row) => String(row.activeJobs) },
	];
}

function WorkersDataTable({
	data,
}: {
	data: { workers: WorkerEntry[] } | null | undefined;
}) {
	const columns = useWorkerColumns();
	return (
		<DataTable
			columns={columns}
			rows={data?.workers ?? []}
			getId={(row) => row.id}
			total={data?.workers.length ?? 0}
		/>
	);
}

export function Workers() {
	const { data, loading, refetch } = useApi(() => API_CLIENT.getWorkers());

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<WorkersPageHeader onRefresh={refetch} />
			<WorkerStats data={data} />
			<WorkersDataTable data={data} />
			<WorkerInfoBoxes />
		</Box>
	);
}
