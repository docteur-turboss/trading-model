import type {
	ISODateTime,
	PositiveInt,
	ServiceId,
	Version,
} from "@trading-model/common/domain/primitives";
import {
	toISODateTime,
	toServiceId,
	toVersion,
} from "@trading-model/common/domain/primitives";
import { ServiceStatus } from "@trading-model/validation/contracts/admin/services.dto";
import type { Column } from "../../components/data-table";

export interface ServiceRow {
	serviceName: ServiceId;
	instances: PositiveInt;
	ipPort: string;
	version: Version;
	heartbeat: ISODateTime;
	status: ServiceStatus;
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
						status?: ServiceStatus;
				  }
				| undefined;
			return {
				serviceName: toServiceId(svc.serviceName),
				instances: svc.instances.length as PositiveInt,
				ipPort: primary ? `${primary.host}:${primary.port}` : "-",
				version: toVersion(primary?.version ?? "-"),
				heartbeat: primary?.heartbeat
					? toISODateTime(primary.heartbeat)
					: ("1970-01-01T00:00:00.000Z" as ISODateTime),
				status: primary?.status ?? ServiceStatus.Down,
			};
		}) ?? []
	);
}

export function filterServices(
	services: ServiceRow[],
	filter: string
): ServiceRow[] {
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
