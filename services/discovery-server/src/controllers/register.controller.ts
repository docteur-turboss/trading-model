import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";
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

function createRegisterHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const parsed = REGISTER_SCHEMA.safeParse(req.body);
		if (!parsed.success) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors,
				},
				400
			);
		}

		const { serviceName, instanceId, ip, port, version } = parsed.data;

		if (!registry.verifyInstanceName(serviceName)) {
			return sendResponse({ error: "Invalid service name" }, 400);
		}

		let safeInstanceId: string;

		if (instanceId === undefined) {
			safeInstanceId = registry.generateInstanceId(serviceName, ip, port);
		} else {
			safeInstanceId = instanceId;
		}

		const instance: ServiceInstance = {
			instanceId: safeInstanceId,
			serviceName,
			ip,
			port,
			version: version ?? "1.0.0",
			ttl: 30_000,
			protocol: "mtls",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		};

		const registered = registry.registerInstance(instance);

		return sendResponse(registered, 201);
	});
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

		const instance = registry.getInstance(serviceName, instanceId);

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
