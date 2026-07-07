import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/common/validation/primitives";
import type { RequestHandler } from "express";
import type { ServiceRegistry } from "../core/service-registry";
import { buildServiceInstance } from "./register-builder";
import { parseRegisterBody, REGISTER_SCHEMA } from "./register-validator";

interface RegisterController {
	register: RequestHandler;
	listServices: RequestHandler;
	getServiceInstances: RequestHandler;
	getInstance: RequestHandler;
}

function createRegisterHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const data = parseRegisterBody(req);
		if (!data) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: REGISTER_SCHEMA.safeParse(req.body).error!.flatten()
						.fieldErrors,
				},
				400
			);
		}
		if (!registry.verifyInstanceName(data.serviceName)) {
			return sendResponse({ error: "Invalid service name" }, 400);
		}
		const instance = buildServiceInstance(data, registry);
		return sendResponse(registry.registerInstance(instance), 201);
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
		const instance = registry.getInstance({
			serviceName: toServiceId(serviceName),
			instanceId: toInstanceId(instanceId),
		});
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
