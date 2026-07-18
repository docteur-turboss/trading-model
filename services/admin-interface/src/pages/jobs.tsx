import RefreshIcon from "@mui/icons-material/Refresh";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatusBadge } from "../components/status-badge";
import { useJobDetail, useJobs } from "../hooks/use-jobs";
import type { JobEntry, JobList } from "../types/dtos";
import { JobDetailDrawer, PriorityChip } from "./jobs-detail";
import { JobStats } from "./jobs-stats";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function WorkerCell({ worker }: { worker: string | null | undefined }) {
	return <>{worker ?? "Unassigned"}</>;
}

function createJobColumns(): Column<JobEntry>[] {
	return [
		{ id: "id", label: "Job ID", render: (row) => row.id },
		{ id: "type", label: "Type", render: (row) => row.type },
		{
			id: "priority",
			label: "Priority",
			render: (row) => <PriorityChip priority={row.priority} />,
		},
		{
			id: "status",
			label: "Status",
			render: (row) => <StatusBadge status={row.status} />,
		},
		{
			id: "worker",
			label: "Worker",
			render: (row) => <WorkerCell worker={row.worker} />,
		},
	];
}

function JobsPageHeader({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" fontWeight={700}>
					Job Management
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Real-time monitoring of the distributed job queue.
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

function JobsTable({
	data,
	selectedJobId,
	onSelectJob,
}: {
	data: JobList | null | undefined;
	selectedJobId: string | null;
	onSelectJob: (id: string) => void;
}) {
	return (
		<DataTable
			columns={createJobColumns()}
			rows={data?.jobs ?? []}
			getId={(row) => row.id}
			onSelectOne={onSelectJob}
			selectedIds={selectedJobId ? new Set([selectedJobId]) : new Set()}
			selectable
		/>
	);
}

export function Jobs() {
	const { data, loading, refetch } = useJobs();
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const { data: jobDetail } = useJobDetail(selectedJobId);

	if (loading) {
		return <PageLoading />;
	}

	const stats = data?.stats ?? { pending: 0, inProgress: 0, failed: 0 };

	return (
		<Box>
			<JobsPageHeader onRefresh={refetch} />
			<JobStats stats={stats} />
			<JobsTable
				data={data}
				selectedJobId={selectedJobId}
				onSelectJob={setSelectedJobId}
			/>
			<JobDetailDrawer
				selectedJobId={selectedJobId}
				jobDetail={jobDetail}
				onClose={() => setSelectedJobId(null)}
			/>
		</Box>
	);
}
