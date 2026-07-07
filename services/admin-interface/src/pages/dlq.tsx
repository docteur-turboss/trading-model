import AccessTimeIcon from "@mui/icons-material/AccessTime";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import GetAppIcon from "@mui/icons-material/GetApp";
import RefreshIcon from "@mui/icons-material/Refresh";
import StorageIcon from "@mui/icons-material/Storage";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Button, CircularProgress, Grid, Typography } from "@mui/material";

import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { InfoBox } from "../components/info-box";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useApi } from "../hooks/use-api";
import { useDlqSelection } from "./helpers/dlq-utils";
import type { DlqMessage, DlqMessageList } from "../types/dtos";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function PendingMessagesCard({ count }: { count: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<WarningAmberIcon />}
				value={String(count)}
				label="MESSAGES EN ATTENTE"
			/>
		</Grid>
	);
}

function RetryRateCard({ rate }: { rate: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<RefreshIcon />}
				value={`${rate}%`}
				label="TAUX DE RETRY"
			/>
		</Grid>
	);
}

function TotalSizeCard({ size }: { size: number }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<StorageIcon />}
				value={`${size} MB`}
				label="TAILLE TOTALE"
			/>
		</Grid>
	);
}

function LastIncidentCard({ incident }: { incident: string }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<AccessTimeIcon />}
				value={incident}
				label="DERNIER INCIDENT"
			/>
		</Grid>
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
			<PendingMessagesCard count={data?.stats.pending ?? 0} />
			<RetryRateCard rate={data?.stats.retryRate ?? 0} />
			<TotalSizeCard size={data?.stats.totalSize ?? 0} />
			<LastIncidentCard incident={data?.stats.lastIncident ?? "-"} />
		</Grid>
	);
}

function RetryPolicyBox() {
	return (
		<InfoBox
			icon={<RefreshIcon />}
			title="Retry Policy"
			description="The system attempts 5 retries with exponential backoff. After the 5th failure, the message is redirected to this DLQ for manual intervention."
			color="success.main"
		/>
	);
}

function FatalErrorsBox() {
	return (
		<InfoBox
			icon={<DeleteSweepIcon />}
			title="Fatal Errors"
			description="'Invalid JSON Schema' errors are never replayed automatically as they indicate a structural problem in the emitter."
			color="error.main"
		/>
	);
}

function RetentionBox() {
	return (
		<InfoBox
			icon={<StorageIcon />}
			title="Retention"
			description="DLQ messages are kept for 14 days before being automatically archived to cold storage (S3 Glacier)."
		/>
	);
}

function DlqInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<RetryPolicyBox />
			<FatalErrorsBox />
			<RetentionBox />
		</Box>
	);
}

function FailureReasonCell({ reason }: { reason: string }) {
	return (
		<Typography variant="body2" color="error.main">
			{reason}
		</Typography>
	);
}

function AttemptsBadge({ attempts }: { attempts: number }) {
	return (
		<StatusBadge
			status={attempts >= 5 ? "error" : "info"}
			label={String(attempts)}
		/>
	);
}

function PayloadPreview({ preview }: { preview: string }) {
	return (
		<Typography variant="caption" sx={{ fontFamily: "monospace" }}>
			{preview}
		</Typography>
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
			render: (row) => <FailureReasonCell reason={row.failureReason} />,
		},
		{
			id: "attempts",
			label: "Attempts",
			render: (row) => <AttemptsBadge attempts={row.attempts} />,
		},
		{
			id: "payload",
			label: "Payload",
			render: (row) => <PayloadPreview preview={row.payloadPreview} />,
		},
	];
}

function DlqPageHeader() {
	return (
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
	);
}

function DlqDataTable({
	data,
	selectedIds,
	onSelectAll,
	onSelectOne,
}: {
	data: DlqMessageList | null | undefined;
	selectedIds: Set<string>;
	onSelectAll: (checked: boolean) => void;
	onSelectOne: (id: string) => void;
}) {
	return (
		<DataTable
			columns={createDlqColumns()}
			rows={data?.messages ?? []}
			getId={(row) => row.messageId}
			total={data?.messages.length ?? 0}
			selectable
			selectedIds={selectedIds}
			onSelectAll={onSelectAll}
			onSelectOne={onSelectOne}
		/>
	);
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
			<DlqPageHeader />
			<DlqStats data={data} />
			<DlqDataTable
				data={data}
				selectedIds={selectedIds}
				onSelectAll={handleSelectAll}
				onSelectOne={handleSelectOne}
			/>
			<DlqInfoBoxes />
		</Box>
	);
}
