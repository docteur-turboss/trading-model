import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import LockIcon from "@mui/icons-material/Lock";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import { Box, Button, Chip, CircularProgress, Typography } from "@mui/material";
import { ConfigSource } from "@trading-model/validation/adapters/inbound/admin";
import { API_CLIENT } from "../api/api-client";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { InfoBox } from "../components/info-box";
import { useApi } from "../hooks/use-api";
import type { ConfigEntry } from "../types/dtos";

function getSourceColor(
	source: ConfigSource
): "secondary" | "default" | "info" | "warning" {
	switch (source) {
		case ConfigSource.Vault:
			return "secondary";
		case ConfigSource.ConfigMap:
			return "default";
		case ConfigSource.EnvVar:
			return "info";
		case ConfigSource.Local:
			return "warning";
		default:
			return "default";
	}
}

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function SecretSecurityBox() {
	return (
		<InfoBox
			icon={<LockIcon />}
			title="Secret Security"
			description="Vault-sourced secrets are injected at startup and never stored in plaintext on the pod filesystem."
			color="info.main"
		/>
	);
}

function ConfigMapPropagationBox() {
	return (
		<InfoBox
			icon={<CheckCircleIcon color="success" />}
			title="ConfigMap Propagation"
			description="ConfigMap changes may take up to 60 seconds to propagate to all active instances."
			color="success.main"
		/>
	);
}

function AuditLogBox() {
	return (
		<InfoBox
			icon={<SyncIcon />}
			title="Audit Log"
			description="All secret reveal actions are logged in the audit registry with user ID and timestamp."
		/>
	);
}

function ConfigInfoBoxes() {
	return (
		<Box sx={{ display: "flex", gap: 2, mt: 3 }}>
			<SecretSecurityBox />
			<ConfigMapPropagationBox />
			<AuditLogBox />
		</Box>
	);
}

function ConfigPageHeader({ onRefresh }: { onRefresh: () => void }) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" fontWeight={700}>
					Configuration Variables
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Manage secrets and environment variables for your microservices.
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
					New Variable
				</Button>
			</Box>
		</Box>
	);
}

function _renderKeyColumn(row: ConfigEntry) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
			{row.masked && (
				<LockIcon fontSize="small" color="action" sx={{ fontSize: 14 }} />
			)}
			{row.key}
		</Box>
	);
}

function _renderValueColumn(row: ConfigEntry) {
	return row.masked ? (
		<Typography variant="body2" color="text.disabled">
			{"•".repeat(20)}
		</Typography>
	) : (
		row.value
	);
}

function _renderSourceColumn(row: ConfigEntry) {
	return (
		<Chip
			size="small"
			label={row.source}
			color={getSourceColor(row.source)}
			variant="outlined"
		/>
	);
}

function useConfigColumns(): Column<ConfigEntry>[] {
	return [
		{ id: "key", label: "Config Key", render: _renderKeyColumn },
		{ id: "value", label: "Value", render: _renderValueColumn },
		{ id: "source", label: "Source", render: _renderSourceColumn },
		{ id: "service", label: "Service", render: (row) => row.service },
		{ id: "updated", label: "Updated", render: (row) => row.updatedAt },
	];
}

export function Config() {
	const { data, loading, refetch } = useApi(() => API_CLIENT.getConfig());
	const columns = useConfigColumns();

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<ConfigPageHeader onRefresh={refetch} />

			<DataTable
				columns={columns}
				rows={data ?? []}
				getId={(row) => `${row.service}-${row.key}`}
				total={data?.length ?? 0}
			/>

			<ConfigInfoBoxes />
		</Box>
	);
}
