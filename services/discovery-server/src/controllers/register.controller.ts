import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";
import type { IPAddress } from "@trading-model/common/domain/primitives";
import { Port, toServiceId, toInstanceId } from "@trading-model/common/domain/primitives";
import type { RequestHandler } from "express";
import { z } from "zod";

import type { ServiceRegistry } from "../core/service-registry";
import type { ServiceInstance } from "../core/types";

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

const REGISTER_SCHEMA = z.object({
	serviceName: z.string().min(1, "serviceName is required"),
	instanceId: z.string().min(1).optional(),
	ip: z.string().regex(IPV4_REGEX, "Invalid IP address"),
	port: z.number().int().min(1).max(65535, "Invalid port"),
	version: z.string().optional(),
});

interface RegisterController {
	register: RequestHandler;
	listServices: RequestHandler;
	getServiceInstances: RequestHandler;
	getInstance: RequestHandler;
}

function _parseRegisterBody(req: import("express").Request): z.infer<typeof REGISTER_SCHEMA> | null {
	const parsed = REGISTER_SCHEMA.safeParse(req.body);
	return parsed.success ? parsed.data : null;
}

function createRegisterHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const data = _parseRegisterBody(req);
		if (!data) {
			return sendResponse({ error: "Invalid request body", details: REGISTER_SCHEMA.safeParse(req.body).error!.flatten().fieldErrors }, 400);
		}
		if (!registry.verifyInstanceName(data.serviceName)) {
			return sendResponse({ error: "Invalid service name" }, 400);
		}
		const instance = _buildServiceInstance(data, registry);
		return sendResponse(registry.registerInstance(instance), 201);
	});
}

function _resolveInstanceId(
	data: z.infer<typeof REGISTER_SCHEMA>,
	registry: ServiceRegistry
): string {
	const { serviceName, instanceId, ip, port } = data;
	return instanceId ?? registry.generateInstanceId({ serviceName: toServiceId(serviceName), address: ip as IPAddress, port: Port.of(port) });
}

function _buildServiceInstance(
	data: z.infer<typeof REGISTER_SCHEMA>,
	registry: ServiceRegistry
): ServiceInstance {
	const { serviceName, ip, port, version } = data;
	return {
		instanceId: _resolveInstanceId(data, registry),
		serviceName: toServiceId(serviceName), ip: ip as IPAddress, port: Port.of(port),
		version: version ?? "1.0.0",
		ttl: 30_000, protocol: "mtls",
		registeredAt: Date.now(), lastHeartbeat: Date.now(),
	};
}

function createListServicesHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync(() => {
		return sendResponse(registry.listServiceNames(), 200);
	});
}

function createGetServiceInstancesHandler(
	registry: ServiceRegistry
): RequestHandler {
	return catchSync((req) => {
		const { serviceName } = req.params;

		if (!isNonEmptyString(serviceName)) {
			return sendResponse({ error: "serviceName is required" }, 400);
		}

		if (!registry.verifyInstanceName(serviceName)) {
			return sendResponse({ error: "Unknown service" }, 404);
		}

		return sendResponse(registry.getInstances(serviceName), 200);
	});
}

function createGetInstanceHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const { serviceName, instanceId } = req.params;

		if (!(isNonEmptyString(serviceName) && isNonEmptyString(instanceId))) {
			return sendResponse({ error: "Invalid route parameters" }, 400);
		}

		const instance = registry.getInstance({ serviceName: toServiceId(serviceName), instanceId: toInstanceId(instanceId) });

		if (!instance) {
			return sendResponse({ error: "Instance not found" }, 404);
		}

		return sendResponse(instance, 200);
	});
}

export function createRegisterController(
	registry: ServiceRegistry
): RegisterController {
	return {
		register: createRegisterHandler(registry),
		listServices: createListServicesHandler(registry),
		getServiceInstances: createGetServiceInstancesHandler(registry),
		getInstance: createGetInstanceHandler(registry),
	};
}
