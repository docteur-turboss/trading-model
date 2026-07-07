import type { Column } from "../../components/data-table";

export interface ServiceRow {
	serviceName: string;
	instances: number;
	ipPort: string;
	version: string;
	heartbeat: string;
	status: string;
}

export function flattenServices(
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

export function filterServices(services: ServiceRow[], filter: string): ServiceRow[] {
	return filter
		? services.filter((svc) =>
				svc.serviceName.toLowerCase().includes(filter.toLowerCase())
			)
		: services;
}

export function createServiceColumns(
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
			render: (row) => row.status,
		},
	];
}
