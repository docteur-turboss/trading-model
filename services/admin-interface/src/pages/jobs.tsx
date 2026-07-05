import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { DrawerPanel } from "../components/drawer-panel";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useJobDetail, useJobs } from "../hooks/use-jobs";
import type { JobEntry } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
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
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<ScheduleIcon />}
					value={String(stats.pending)}
					label="PENDING"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<SyncIcon />}
					value={String(stats.inProgress)}
					label="IN PROGRESS"
				/>
			</Box>
			<Box sx={{ flex: 1 }}>
				<StatsCard
					icon={<ErrorOutlineIcon />}
					value={String(stats.failed)}
					label="FAILED (1H)"
					deltaColor="error.main"
				/>
			</Box>
		</Box>
	);
}

interface TimelineEntry {
	event: string;
	timestamp: string;
	description: string;
	active: boolean;
}

function JobTimeline({ entries }: { entries: TimelineEntry[] }) {
	return (
		<Box>
			{entries.map((entry, index) => (
				<Box
					key={`${entry.event}-${entry.timestamp}`}
					sx={{
						display: "flex",
						gap: 2,
						pb: index < entries.length - 1 ? 2 : 0,
					}}
				>
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							alignItems: "center",
						}}
					>
						<Box
							sx={{
								width: 12,
								height: 12,
								borderRadius: "50%",
								bgcolor: entry.active ? "primary.main" : "grey.400",
								flexShrink: 0,
							}}
						/>
						{index < entries.length - 1 && (
							<Box
								sx={{
									width: 2,
									flexGrow: 1,
									bgcolor: "divider",
									minHeight: 20,
								}}
							/>
						)}
					</Box>
					<Box>
						<Typography variant="subtitle2">{entry.event}</Typography>
						<Typography variant="caption" color="text.secondary">
							{entry.timestamp}
						</Typography>
						<Typography variant="body2">{entry.description}</Typography>
					</Box>
				</Box>
			))}
		</Box>
	);
}

export function Jobs() {
	const { data, loading, refetch } = useJobs();
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const { data: jobDetail } = useJobDetail(selectedJobId);

	const columns: Column<JobEntry>[] = [
		{ id: "id", label: "Job ID", render: (row) => row.id },
		{ id: "type", label: "Type", render: (row) => row.type },
		{
			id: "priority",
			label: "Priority",
			render: (row) => (
				<Chip
					size="small"
					label={row.priority}
					color={
						row.priority === "CRITICAL"
							? "error"
							: row.priority === "HIGH"
								? "warning"
								: "default"
					}
					variant="outlined"
				/>
			),
		},
		{
			id: "status",
			label: "Status",
			render: (row) => <StatusBadge status={row.status} />,
		},
		{
			id: "worker",
			label: "Worker",
			render: (row) => row.worker ?? "Unassigned",
		},
	];

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
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
					onClick={refetch}
				>
					Refresh
				</Button>
			</Box>

			<JobStats stats={data!.stats} />

			<DataTable
				columns={columns}
				rows={data?.jobs ?? []}
				getId={(row) => row.id}
				onSelectOne={(id) => setSelectedJobId(id)}
				selectedIds={selectedJobId ? new Set([selectedJobId]) : new Set()}
				selectable
			/>

			<DrawerPanel
				open={Boolean(selectedJobId)}
				title={`Job Details - ${selectedJobId ?? ""}`}
				subtitle={`ID: ${selectedJobId ?? ""}`}
				onClose={() => setSelectedJobId(null)}
				tabs={
					jobDetail
						? [
								{
									label: "Timeline",
									content: <JobTimeline entries={jobDetail.timeline} />,
								},
								{
									label: "Payload",
									content: (
										<Typography
											variant="body2"
											component="pre"
											sx={{ fontFamily: "monospace", fontSize: "0.75rem" }}
										>
											{JSON.stringify(jobDetail.payload, null, 2)}
										</Typography>
									),
								},
								{
									label: "Logs",
									content: jobDetail.logs.map((log) => (
										<Typography
											key={log}
											variant="caption"
											display="block"
											sx={{ fontFamily: "monospace" }}
										>
											{log}
										</Typography>
									)),
								},
							]
						: []
				}
				actions={
					<>
						<Button variant="contained" color="primary">
							Restart Job
						</Button>
						<Button variant="contained" color="error">
							Cancel Job
						</Button>
					</>
				}
			/>
		</Box>
	);
}
