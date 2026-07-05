import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import GetAppIcon from "@mui/icons-material/GetApp";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Button, CircularProgress, Grid, Typography } from "@mui/material";
import { useState } from "react";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { InfoBox } from "../components/info-box";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import type { DlqMessage } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function DlqStats({
	data,
}: {
	data:
		| {
				stats: {
					pending: number;
					retryRate: number;
					totalSize: number;
					lastIncident: string;
				};
		  }
		| null
		| undefined;
}) {
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<WarningAmberIcon />}
					value={String(data?.stats.pending ?? 0)}
					label="MESSAGES EN ATTENTE"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<RefreshIcon />}
					value={`${data?.stats.retryRate ?? 0}%`}
					label="TAUX DE RETRY"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<StorageIcon />}
					value={`${data?.stats.totalSize ?? 0} MB`}
					label="TAILLE TOTALE"
				/>
			</Grid>
			<Grid size={{ xs: 3 }}>
				<StatsCard
					icon={<AccessTimeIcon />}
					value={data?.stats.lastIncident ?? "-"}
					label="DERNIER INCIDENT"
				/>
			</Grid>
		</Grid>
	);
}

function DlqInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<InfoBox
				icon={<RefreshIcon />}
				title="Retry Policy"
				description="The system attempts 5 retries with exponential backoff. After the 5th failure, the message is redirected to this DLQ for manual intervention."
				color="success.main"
			/>
			<InfoBox
				icon={<DeleteSweepIcon />}
				title="Fatal Errors"
				description="'Invalid JSON Schema' errors are never replayed automatically as they indicate a structural problem in the emitter."
				color="error.main"
			/>
			<InfoBox
				icon={<StorageIcon />}
				title="Retention"
				description="DLQ messages are kept for 14 days before being automatically archived to cold storage (S3 Glacier)."
			/>
		</Box>
	);
}

function createDlqColumns(): Column<DlqMessage>[] {
	return [
		{ id: "timestamp", label: "Timestamp", render: (row) => row.timestamp },
		{ id: "topic", label: "Topic", render: (row) => row.topic },
		{ id: "msgId", label: "Message ID", render: (row) => row.messageId },
		{
			id: "reason",
			label: "Failure Reason",
			render: (row) => (
				<Typography variant="body2" color="error.main">
					{row.failureReason}
				</Typography>
			),
		},
		{
			id: "attempts",
			label: "Attempts",
			render: (row) => (
				<StatusBadge
					status={row.attempts >= 5 ? "error" : "info"}
					label={String(row.attempts)}
				/>
			),
		},
		{
			id: "payload",
			label: "Payload",
			render: (row) => (
				<Typography variant="caption" sx={{ fontFamily: "monospace" }}>
					{row.payloadPreview}
				</Typography>
			),
		},
	];
}

function useDlqSelection(
	data: { messages: { messageId: string }[] } | null | undefined
) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const handleSelectAll = (checked: boolean) => {
		setSelectedIds(
			checked
				? new Set((data?.messages ?? []).map((msg) => msg.messageId))
				: new Set()
		);
	};

	const handleSelectOne = (id: string) => {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
		} else {
			next.add(id);
		}
		setSelectedIds(next);
	};

	return { selectedIds, handleSelectAll, handleSelectOne };
}

export function Dlq() {
	const { data, loading } = useApi(() => API_CLIENT.getDlqMessages());
	const { selectedIds, handleSelectAll, handleSelectOne } =
		useDlqSelection(data);

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
				<Box>
					<Typography variant="h4" fontWeight={700}>
						Broker DLQ
					</Typography>
					<Typography variant="body2" color="text.secondary">
						Failed message management on the Message Broker.
					</Typography>
				</Box>
				<Box sx={{ display: "flex", gap: 1 }}>
					<Button variant="outlined" startIcon={<GetAppIcon />}>
						Export CSV
					</Button>
					<Button
						variant="contained"
						color="error"
						startIcon={<DeleteSweepIcon />}
					>
						Purge DLQ
					</Button>
				</Box>
			</Box>

			<DlqStats data={data} />

			<DataTable
				columns={createDlqColumns()}
				rows={data?.messages ?? []}
				getId={(row) => row.messageId}
				total={data?.messages.length ?? 0}
				selectable
				selectedIds={selectedIds}
				onSelectAll={handleSelectAll}
				onSelectOne={handleSelectOne}
			/>

			<DlqInfoBoxes />
		</Box>
	);
}
