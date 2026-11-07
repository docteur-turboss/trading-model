import {
	Protocol,
	type ServiceInstance,
} from "@trading-model/contracts/service-registry-types";
import { brand } from "@trading-model/http/adapters/inbound/api-route/api-route";
import {
	DurationMs,
	IPAddress,
	Port,
	toEnvironment,
	toInstanceId,
	toRegion,
	toServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import type { AcceptsContract, Assert, YieldsContract } from "./contract-shape";

/**
 * A registered instance as discovery-server answers it (`GET /services/:name`,
 * `POST /register`). Parsing yields the `ServiceInstance` contract, brands
 * included: clients validate what discovery sends instead of casting it.
 */
export const ServiceInstanceWire = z.object({
	instanceId: z.string().min(1).transform(brand(toInstanceId)),
	serviceName: z.string().min(1).transform(brand(toServiceId)),
	host: z.string().min(1).transform(brand(IPAddress.of)),
	port: z.number().int().transform(brand(Port.of)),
	version: z.string().min(1).transform(brand(Version.of)),
	protocol: z.string().pipe(z.enum(Protocol)),
	ttl: z.number().int().transform(brand(DurationMs.of)),
	registeredAt: z.number().int().transform(brand(UnixTimestamp.of)),
	lastHeartbeat: z.number().int().transform(brand(UnixTimestamp.of)),
	env: z.string().transform(brand(toEnvironment)).optional(),
	region: z.string().transform(brand(toRegion)).optional(),
});

/** The instances of one service, `GET /services/:serviceName`. */
export const ServiceInstancesWire = z.array(ServiceInstanceWire);

/** `POST /register`: the stored instance and its token, sent only there. */
export const ServiceRegistrationWire = ServiceInstanceWire.extend({
	token: z.string().min(1),
});

/** `POST /token/rotate`. */
export const RotatedTokenWire = z.object({ token: z.string().min(1) });

export type ServiceInstanceWireChecks = [
	Assert<AcceptsContract<typeof ServiceInstanceWire, ServiceInstance>>,
	Assert<YieldsContract<typeof ServiceInstanceWire, ServiceInstance>>,
];
