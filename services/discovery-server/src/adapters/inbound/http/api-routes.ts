import { Protocol } from "@trading-model/contracts/service-registry-types";
import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { z } from "zod";
import {
	HEARTBEAT_SCHEMA,
	ROTATE_TOKEN_SCHEMA,
} from "../../../shared/heartbeat-validator";
import { REGISTER_SCHEMA } from "../../../shared/register-validator";

/**
 * HTTP API of discovery-server (ADR-0021). The read routes are public
 * (through the gateway); registration and the lease routes are
 * service-to-service (address-manager of every service, over mTLS).
 */

const SERVICE = z.object({ serviceName: z.string().min(1) });

/** An instance as stored at registration (no token: it stays in Redis). */
const ServiceInstance = z.object({
	instanceId: z.string(),
	serviceName: z.string(),
	host: z.string(),
	port: z.number().int(),
	version: z.string(),
	protocol: z.enum(Protocol),
	/** Lease duration (ms) renewed by each heartbeat. */
	ttl: z.number().int(),
	/** Epoch milliseconds. */
	registeredAt: z.number().int(),
	lastHeartbeat: z.number().int(),
	env: z.string().optional(),
	region: z.string().optional(),
});

/** Rejections of the registration middlewares (IP allowlist, mTLS identity). */
const REGISTRATION_REFUSED = {
	401: ErrorResponse,
	403: ErrorResponse,
	429: ErrorResponse,
	503: ErrorResponse,
} as const;

/** Lease routes: the instance token is checked (401) and rate limited (429). */
const LEASE = {
	400: ErrorResponse,
	401: ErrorResponse,
	429: ErrorResponse,
} as const;

export const DISCOVERY_API = {
	register: defineRoute({
		method: "POST",
		path: "/register",
		summary:
			"Register an instance of the calling service; its host is the address the caller connected from",
		body: REGISTER_SCHEMA,
		responses: {
			/** The stored instance and its token, sent only here. */
			201: ServiceInstance.extend({ token: z.string() }),
			400: ErrorResponse,
			...REGISTRATION_REFUSED,
		},
	}),
	heartbeat: defineRoute({
		method: "POST",
		path: "/heartbeat",
		summary: "Renew the lease of an instance",
		security: ["InstanceToken"],
		body: HEARTBEAT_SCHEMA,
		responses: {
			/** Lease duration (ms) granted. */
			200: z.object({ ttl: z.number().int() }),
			...LEASE,
			404: ErrorResponse,
		},
	}),
	rotateToken: defineRoute({
		method: "POST",
		path: "/token/rotate",
		summary: "Replace the token of an instance",
		security: ["InstanceToken"],
		body: ROTATE_TOKEN_SCHEMA,
		responses: { 200: z.object({ token: z.string() }), ...LEASE },
	}),
	unregister: defineRoute({
		method: "POST",
		path: "/unregister",
		summary: "Remove the lease of an instance (graceful shutdown)",
		security: ["InstanceToken"],
		body: HEARTBEAT_SCHEMA,
		responses: { 204: null, ...LEASE },
	}),
	listServices: defineRoute({
		method: "GET",
		path: "/services",
		summary: "Names of the services with registered instances",
		responses: { 200: z.array(z.string()) },
	}),
	getServiceInstances: defineRoute({
		method: "GET",
		path: "/services/:serviceName",
		summary: "Live instances of a service (expired leases left out)",
		params: SERVICE,
		responses: {
			200: z.array(ServiceInstance),
			400: ErrorResponse,
			404: ErrorResponse,
		},
	}),
	getInstance: defineRoute({
		method: "GET",
		path: "/services/:serviceName/:instanceId",
		summary: "One live instance of a service",
		params: SERVICE.extend({ instanceId: z.string().min(1) }),
		responses: { 200: ServiceInstance, 400: ErrorResponse, 404: ErrorResponse },
	}),
} as const;
