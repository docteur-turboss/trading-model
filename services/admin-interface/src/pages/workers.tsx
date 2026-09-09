import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
	Box,
	Button,
	CircularProgress,
	LinearProgress,
	Typography,
} from "@mui/material";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import type { WorkerEntry } from "../types/dtos";
import { getLoadColor } from "./helpers/workers-utils";
import { WorkerInfoBoxes } from "./workers-info";
import { WorkerStats } from "./workers-stats";

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
				<Typography variant="h4" sx={{ fontWeight: 700 }}>
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
