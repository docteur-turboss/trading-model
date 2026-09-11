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
import { ServiceStatus } from "@trading-model/validation/adapters/inbound/admin/services.dto";

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
