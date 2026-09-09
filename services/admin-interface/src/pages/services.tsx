import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
	Box,
	Button,
	Card,
	CircularProgress,
	MenuItem,
	TextField,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatusBadge } from "../components/status-badge";
import { useServices } from "../hooks/use-services";
import type { ServiceRow } from "./helpers/services-utils";
import { filterServices, flattenServices } from "./helpers/services-utils";
import { ServiceStatsRow } from "./services-stats";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function ServiceStatusCell({ status }: { status: string }) {
	return <StatusBadge status={status} />;
}

function createServiceColumns(
	translate: (key: string) => string
): Column<ServiceRow>[] {
	return [
		{
			id: "name",
			label: translate("serviceName"),
			render: (row) => row.serviceName,
		},
		{
			id: "instances",
			label: translate("instances"),
			render: (row) => String(row.instances),
		},
		{ id: "ip", label: translate("ipPort"), render: (row) => row.ipPort },
		{
			id: "version",
			label: translate("version"),
			render: (row) => row.version,
		},
		{
			id: "heartbeat",
			label: translate("heartbeat"),
			render: (row) => row.heartbeat,
		},
		{
			id: "status",
			label: translate("status"),
			render: (row) => <ServiceStatusCell status={row.status} />,
		},
	];
}

function ServicesHeader({
	title,
	subtitle,
	onRefresh,
	refreshLabel,
	newServiceLabel,
}: {
	title: string;
	subtitle: string;
	onRefresh: () => void;
	refreshLabel: string;
	newServiceLabel: string;
}) {
	return (
		<Box sx={{ display: "flex", justifyContent: "space-between", mb: 3 }}>
			<Box>
				<Typography variant="h4" sx={{ fontWeight: 700 }}>
					{title}
				</Typography>
				<Typography variant="body2" color="text.secondary">
					{subtitle}
				</Typography>
			</Box>
			<Box sx={{ display: "flex", gap: 1 }}>
				<Button
					variant="outlined"
					startIcon={<RefreshIcon />}
					onClick={onRefresh}
				>
					{refreshLabel}
				</Button>
				<Button variant="contained" startIcon={<AddIcon />}>
					{newServiceLabel}
				</Button>
			</Box>
		</Box>
	);
}

function NetworkTopologyCard({ label }: { label: string }) {
	return (
		<>
			<Typography variant="h6" sx={{ mb: 1 }}>
				{label}
			</Typography>
			<Card variant="outlined" sx={{ mb: 3, padding: 2, minHeight: 100 }}>
				<Typography variant="body2" color="text.secondary">
					Network topology visualization
				</Typography>
			</Card>
		</>
	);
}

export function Services() {
	const { t } = useTranslation("services");
	const { data, loading, refetch } = useServices();
	const [filter, setFilter] = useState("");
	const flatServices = flattenServices(data);
	const filtered = filterServices(flatServices, filter);

	if (loading) {
		return <PageLoading />;
	}

	return (
		<Box>
			<ServicesHeader
				title={t("title")}
				subtitle={t("subtitle")}
				onRefresh={refetch}
				refreshLabel={t("refresh")}
				newServiceLabel={t("newService")}
			/>

			<ServiceStatsRow data={data} flatServices={flatServices} translate={t} />

			<NetworkTopologyCard label={t("networkTopology")} />

			<ServiceFilter filter={filter} onFilterChange={setFilter} translate={t} />

			<DataTable
				columns={createServiceColumns(t)}
				rows={filtered}
				getId={(row) => row.serviceName}
				total={filtered.length}
			/>
		</Box>
	);
}

function ServiceFilter({
	filter,
	onFilterChange,
	translate,
}: {
	filter: string;
	onFilterChange: (value: string) => void;
	translate: (key: string) => string;
}) {
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
			<TextField
				size="small"
				placeholder={translate("filterPlaceholder")}
				value={filter}
				onChange={(evt) => onFilterChange(evt.target.value)}
				sx={{ minWidth: 240 }}
			/>
			<TextField size="small" select defaultValue="" sx={{ minWidth: 140 }}>
				<MenuItem value="">{translate("allStatuses")}</MenuItem>
				<MenuItem value="healthy">{translate("healthy")}</MenuItem>
				<MenuItem value="degraded">{translate("degraded")}</MenuItem>
				<MenuItem value="down">{translate("down")}</MenuItem>
			</TextField>
		</Box>
	);
}
