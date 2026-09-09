import { Box, Button, Chip, Typography } from "@mui/material";
import { JobPriority } from "@trading-model/validation/adapters/inbound/admin";
import type { ReactNode } from "react";
import { DrawerPanel } from "../components/drawer-panel";
import type { JobTimelineEntry } from "../types/dtos";

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
	return <Chip size="small" label={label} color={color} variant="outlined" />;
}

export { PriorityChip };

function JobPayloadTab({ payload }: { payload: unknown }) {
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

function JobLogsTab({ logs }: { logs: string[] }) {
	return (
		<>
			{logs.map((log) => (
				<Typography
					key={log}
					variant="caption"
					sx={{ display: "block", fontFamily: "monospace" }}
				>
					{log}
				</Typography>
			))}
		</>
	);
}

function buildJobTabs(jobDetail: {
	timeline: JobTimelineEntry[];
	payload: unknown;
	logs: string[];
}): { label: string; content: ReactNode }[] {
	return [
		{
			label: "Timeline",
			content: <JobTimeline entries={jobDetail.timeline} />,
		},
		{
			label: "Payload",
			content: <JobPayloadTab payload={jobDetail.payload} />,
		},
		{
			label: "Logs",
			content: <JobLogsTab logs={jobDetail.logs} />,
		},
	];
}

export function JobDetailDrawer({
	selectedJobId,
	jobDetail,
	onClose,
}: {
	selectedJobId: string | null;
	jobDetail: {
		timeline: JobTimelineEntry[];
		payload: unknown;
		logs: string[];
	} | null;
	onClose: () => void;
}) {
	return (
		<DrawerPanel
			open={Boolean(selectedJobId)}
			title={`Job Details - ${selectedJobId ?? ""}`}
			subtitle={`ID: ${selectedJobId ?? ""}`}
			onClose={onClose}
			tabs={jobDetail ? buildJobTabs(jobDetail) : []}
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
	);
}
