import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { JobPriority } from "@trading-model/common/contracts/admin";
import { useState } from "react";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { DrawerPanel } from "../components/drawer-panel";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useJobDetail, useJobs } from "../hooks/use-jobs";
import type { JobEntry, JobList, JobTimelineEntry } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function PendingJobsCard({ count }: { count: number }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<ScheduleIcon />}
				value={String(count)}
				label="PENDING"
			/>
		</Box>
	);
}

function InProgressJobsCard({ count }: { count: number }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<SyncIcon />}
				value={String(count)}
				label="IN PROGRESS"
			/>
		</Box>
	);
}

function FailedJobsCard({ count }: { count: number }) {
	return (
		<Box sx={{ flex: 1 }}>
			<StatsCard
				icon={<ErrorOutlineIcon />}
				value={String(count)}
				label="FAILED (1H)"
				deltaColor="error.main"
			/>
		</Box>
	);
}

function JobStats({
	stats,
}: {
	stats: { pending: number; inProgress: number; failed: number };
}) {
	return (
		<Box sx={{ display: "flex", gap: 2, mb: 3 }}>
			<PendingJobsCard count={stats.pending} />
			<InProgressJobsCard count={stats.inProgress} />
			<FailedJobsCard count={stats.failed} />
		</Box>
	);
}

function TimelineDot({ active }: { active?: boolean }) {
	return (
		<Box
			sx={{
				width: 12,
				height: 12,
				borderRadius: "50%",
				bgcolor: active ? "primary.main" : "grey.400",
				flexShrink: 0,
			}}
		/>
	);
}

function TimelineConnector() {
	return (
		<Box
			sx={{
				width: 2,
				flexGrow: 1,
				bgcolor: "divider",
				minHeight: 20,
			}}
		/>
	);
}

function TimelineContent({ entry }: { entry: JobTimelineEntry }) {
	return (
		<Box>
			<Typography variant="subtitle2">{entry.event}</Typography>
			<Typography variant="caption" color="text.secondary">
				{entry.timestamp}
			</Typography>
			<Typography variant="body2">{entry.description}</Typography>
		</Box>
	);
}

function TimelineEntry({
	entry,
	isLast,
}: {
	entry: JobTimelineEntry;
	isLast: boolean;
}) {
	return (
		<Box sx={{ display: "flex", gap: 2, pb: isLast ? 0 : 2 }}>
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
				}}
			>
				<TimelineDot active={entry.active} />
				{!isLast && <TimelineConnector />}
			</Box>
			<TimelineContent entry={entry} />
		</Box>
	);
}

function JobTimeline({ entries }: { entries: JobTimelineEntry[] }) {
	return (
		<Box>
			{entries.map((entry, index) => (
				<TimelineEntry
					key={`${entry.event}-${entry.timestamp}`}
					entry={entry}
					isLast={index === entries.length - 1}
				/>
			))}
		</Box>
	);
}

function PriorityChip({ priority }: { priority: JobPriority }) {
	const label =
		priority === JobPriority.HIGHEST
			? "Critical"
			: priority === JobPriority.HIGH
				? "High"
				: priority === JobPriority.MEDIUM
					? "Medium"
					: priority === JobPriority.LOW
						? "Low"
						: "Lowest";
	const color =
		priority === JobPriority.HIGHEST
			? "error"
			: priority === JobPriority.HIGH
				? "warning"
				: "default";
	return (
		<Chip size="small" label={label} color={color} variant="outlined" />
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

function JobDetailPayload({ payload }: { payload: unknown }) {
	return (
		<Typography
			variant="body2"
			component="pre"
			sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
		>
			{JSON.stringify(payload, null, 2)}
		</Typography>
	);
}

function JobDetailLogs({ logs }: { logs: string[] }) {
	return logs.map((log) => (
		<Typography
			key={log}
			variant="caption"
			display="block"
			sx={{ fontFamily: "monospace" }}
		>
			{log}
		</Typography>
	));
}

function JobDrawerActions() {
	return (
		<>
			<Button variant="contained" color="primary">
				Restart Job
			</Button>
			<Button variant="contained" color="error">
				Cancel Job
			</Button>
		</>
	);
}

function JobDrawerTabs(
	jobDetail: NonNullable<ReturnType<typeof useJobDetail>["data"]>
) {
	return [
		{
			label: "Timeline",
			content: <JobTimeline entries={jobDetail.timeline} />,
		},
		{
			label: "Payload",
			content: <JobDetailPayload payload={jobDetail.payload} />,
		},
		{
			label: "Logs",
			content: <JobDetailLogs logs={jobDetail.logs} />,
		},
	];
}

function JobDetailDrawer({
	selectedJobId,
	jobDetail,
	onClose,
}: {
	selectedJobId: string | null;
	jobDetail: NonNullable<ReturnType<typeof useJobDetail>["data"]> | null;
	onClose: () => void;
}) {
	return (
		<DrawerPanel
			open={Boolean(selectedJobId)}
			title={`Job Details - ${selectedJobId ?? ""}`}
			subtitle={`ID: ${selectedJobId ?? ""}`}
			onClose={onClose}
			tabs={jobDetail ? JobDrawerTabs(jobDetail) : []}
			actions={<JobDrawerActions />}
		/>
	);
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
