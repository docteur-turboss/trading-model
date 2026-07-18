import type { UnixTimestamp } from "@trading-model/common/domain/primitives";
import {
	DurationMs,
	type InstanceId,
	IPAddress,
	Port,
	toInstanceId,
	toServiceId,
	toVersion,
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";
import type { z } from "zod";
import type { ServiceRegistry } from "../core/service-registry";
import type { ServiceInstance } from "../core/types";
import type { REGISTER_SCHEMA } from "./register-validator";

export function resolveInstanceId(
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

export function buildServiceInstance(
	data: z.infer<typeof REGISTER_SCHEMA>,
	registry: ServiceRegistry
): ServiceInstance {
	const { serviceName, ip, port, version } = data;
	return {
		instanceId: resolveInstanceId(data, registry),
		serviceName: toServiceId(serviceName),
		host: IPAddress.of(ip),
		port: Port.of(port),
		version: toVersion(version ?? "1.0.0"),
		ttl: DurationMs.of(30_000),
		protocol: Protocol.Mtls,
		registeredAt: Date.now() as UnixTimestamp,
		lastHeartbeat: Date.now() as UnixTimestamp,
	};
}
