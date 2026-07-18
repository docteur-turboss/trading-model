import BoltIcon from "@mui/icons-material/Bolt";
import DnsIcon from "@mui/icons-material/Dns";
import ShieldIcon from "@mui/icons-material/Shield";
import ActivityIcon from "@mui/icons-material/Timeline";
import { Grid } from "@mui/material";
import { StatsCard } from "../components/stats-card";

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

export function ServiceStatsRow({
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
			<ActiveServicesCard
				count={data?.services.length ?? 0}
				label={translate("activeServices")}
			/>
			<TotalInstancesCard
				total={totalInstances}
				label={translate("totalInstances")}
			/>
			<Errors5xxCard label={translate("errors5xx")} />
			<AvgLatencyCard label={translate("avgLatency")} />
		</Grid>
	);
}
