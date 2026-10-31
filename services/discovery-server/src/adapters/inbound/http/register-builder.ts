import { Protocol } from "@trading-model/contracts/service-registry-types";
import type { UnixTimestamp } from "@trading-model/primitives/primitives";
import {
	DurationMs,
	type InstanceId,
	IPAddress,
	Port,
	toInstanceId,
	toServiceId,
	toVersion,
} from "@trading-model/primitives/primitives";
import type { z } from "zod";
import type { ServiceRegistry } from "../../../domain/service-registry";
import type { REGISTER_SCHEMA } from "../../../shared/register-validator";
import type { ServiceInstance } from "../../../shared/types";

function resolveInstanceId(
	data: z.infer<typeof REGISTER_SCHEMA>,
	registry: ServiceRegistry
): InstanceId {
	const { serviceName, instanceId, ip, port } = data;
	return toInstanceId(
		instanceId ??
			registry.tokenManager.generateInstanceId({
				serviceName: toServiceId(serviceName),
				host: IPAddress.of(ip),
				port: Port.of(port),
			})
	);
}

/**
 * @param observedIp - the caller's address as seen by discovery. Preferred over
 *   the declared `ip`: a multi-homed instance declares its first interface,
 *   which may sit on a network its callers cannot reach.
 */
export function buildServiceInstance(
	data: z.infer<typeof REGISTER_SCHEMA>,
	registry: ServiceRegistry,
	observedIp?: string
): ServiceInstance {
	const { serviceName, ip, port, version } = data;
	return {
		instanceId: resolveInstanceId(data, registry),
		serviceName: toServiceId(serviceName),
		host: IPAddress.of(observedIp ?? ip),
		port: Port.of(port),
		version: toVersion(version ?? "1.0.0"),
		ttl: DurationMs.of(30_000),
		protocol: Protocol.Mtls,
		registeredAt: Date.now() as UnixTimestamp,
		lastHeartbeat: Date.now() as UnixTimestamp,
	};
}
