import AddIcon from "@mui/icons-material/Add";
import BoltIcon from "@mui/icons-material/Bolt";
import DnsIcon from "@mui/icons-material/Dns";
import RefreshIcon from "@mui/icons-material/Refresh";
import ShieldIcon from "@mui/icons-material/Shield";
import ActivityIcon from "@mui/icons-material/Timeline";
import {
	Box,
	Button,
	Card,
	CircularProgress,
	Grid,
	MenuItem,
	TextField,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Column } from "../components/data-table";
import { DataTable } from "../components/data-table";
import { StatsCard } from "../components/stats-card";
import { StatusBadge } from "../components/status-badge";
import { useServices } from "../hooks/use-services";

function PageLoading() {
	return (
		<Box sx={{ display: "flex", justifyContent: "center", mt: 4 }}>
			<CircularProgress />
		</Box>
	);
}

function ActiveServicesCard({
	count,
	label,
}: {
	count: number;
	label: string;
}) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<DnsIcon />}
				value={`${count} / ${count}`}
				label={label}
				delta="+2.5% vs last hour"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function TotalInstancesCard({
	total,
	label,
}: {
	total: number;
	label: string;
}) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<ActivityIcon />}
				value={String(total)}
				label={label}
				delta="+12 vs last hour"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function Errors5xxCard({ label }: { label: string }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<ShieldIcon />}
				value="0.04%"
				label={label}
				delta="-0.01% vs last hour"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function AvgLatencyCard({ label }: { label: string }) {
	return (
		<Grid size={{ xs: 3 }}>
			<StatsCard
				icon={<BoltIcon />}
				value="42ms"
				label={label}
				delta="-4ms vs last hour"
				deltaColor="success.main"
			/>
		</Grid>
	);
}

function ServiceStatRow({ children }: { children: React.ReactNode }) {
	return <Grid size={{ xs: 3 }}>{children}</Grid>;
}

function ServiceStats({
	data,
	flatServices,
	translate,
}: {
	data:
		| { services: { serviceName: string; instances: unknown[] }[] }
		| null
		| undefined;
	flatServices: { instances: number }[];
	translate: (key: string) => string;
}) {
	const totalInstances = flatServices.reduce(
		(acc, svc) => acc + svc.instances,
		0
	);
	return (
		<Grid container spacing={2} sx={{ mb: 3 }}>
			<ServiceStatRow>
				<ActiveServicesCard
					count={data?.services.length ?? 0}
					label={translate("activeServices")}
				/>
			</ServiceStatRow>
			<ServiceStatRow>
				<TotalInstancesCard
					total={totalInstances}
					label={translate("totalInstances")}
				/>
			</ServiceStatRow>
			<ServiceStatRow>
				<Errors5xxCard label={translate("errors5xx")} />
			</ServiceStatRow>
			<ServiceStatRow>
				<AvgLatencyCard label={translate("avgLatency")} />
			</ServiceStatRow>
		</Grid>
	);
}

function ServiceSearchField({
	placeholder,
	value,
	onChange,
}: {
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<TextField
			size="small"
			placeholder={placeholder}
			value={value}
			onChange={(evt) => onChange(evt.target.value)}
			sx={{ minWidth: 240 }}
		/>
	);
}

function StatusFilterSelect({
	translate,
}: {
	translate: (key: string) => string;
}) {
	return (
		<TextField size="small" select defaultValue="" sx={{ minWidth: 140 }}>
			<MenuItem value="">{translate("allStatuses")}</MenuItem>
			<MenuItem value="healthy">{translate("healthy")}</MenuItem>
			<MenuItem value="degraded">{translate("degraded")}</MenuItem>
			<MenuItem value="down">{translate("down")}</MenuItem>
		</TextField>
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
			<ServiceSearchField
				placeholder={translate("filterPlaceholder")}
				value={filter}
				onChange={onFilterChange}
			/>
			<StatusFilterSelect translate={translate} />
		</Box>
	);
}

interface ServiceRow {
	serviceName: string;
	instances: number;
	ipPort: string;
	version: string;
	heartbeat: string;
	status: string;
}

function flattenServices(
	data:
		| { services: { serviceName: string; instances: unknown[] }[] }
		| null
		| undefined
): ServiceRow[] {
	return (
		data?.services.map((svc) => {
			const primary = svc.instances[0] as
				| {
						host: string;
						port: number;
						version?: string;
						heartbeat?: string;
						status?: string;
				  }
				| undefined;
			return {
				serviceName: svc.serviceName,
				instances: svc.instances.length,
				ipPort: primary ? `${primary.host}:${primary.port}` : "-",
				version: primary?.version ?? "-",
				heartbeat: primary?.heartbeat ?? "-",
				status: primary?.status ?? "down",
			};
		}) ?? []
	);
}

function filterServices(services: ServiceRow[], filter: string): ServiceRow[] {
	return filter
		? services.filter((svc) =>
				svc.serviceName.toLowerCase().includes(filter.toLowerCase())
			)
		: services;
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

function ServicesHeaderTitle({
	title,
	subtitle,
}: {
	title: string;
	subtitle: string;
}) {
	return (
		<Box>
			<Typography variant="h4" fontWeight={700}>
				{title}
			</Typography>
			<Typography variant="body2" color="text.secondary">
				{subtitle}
			</Typography>
		</Box>
	);
}

function ServicesHeaderActions({
	onRefresh,
	refreshLabel,
	newServiceLabel,
}: {
	onRefresh: () => void;
	refreshLabel: string;
	newServiceLabel: string;
}) {
	return (
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
	);
}

function ServicesPageHeader({
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
			<ServicesHeaderTitle title={title} subtitle={subtitle} />
			<ServicesHeaderActions
				onRefresh={onRefresh}
				refreshLabel={refreshLabel}
				newServiceLabel={newServiceLabel}
			/>
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
			<ServicesPageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				onRefresh={refetch}
				refreshLabel={t("refresh")}
				newServiceLabel={t("newService")}
			/>

			<ServiceStats data={data} flatServices={flatServices} translate={t} />

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
