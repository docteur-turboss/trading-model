import { parseServiceName } from "@trading-model/common/config/services.types";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { isNonEmptyString } from "@trading-model/validation/shared/validation/primitives";
import type { RequestHandler } from "express";
import type { ServiceRegistry } from "../domain/service-registry";
import { validationErrorResponse } from "../shared/helpers";
import {
	parseRegisterBody,
	REGISTER_SCHEMA,
} from "../shared/register-validator";
import { buildServiceInstance } from "./register-builder";

interface RegisterController {
	register: RequestHandler;
	listServices: RequestHandler;
	getServiceInstances: RequestHandler;
	getInstance: RequestHandler;
}

function _buildValidationError(
	req: import("express").Request
): ReturnType<typeof sendResponse> {
	return validationErrorResponse(REGISTER_SCHEMA, req.body);
}

function createRegisterHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const data = parseRegisterBody(req);
		if (!data) {
			return _buildValidationError(req);
		}
		if (
			!registry.tokenManager.verifyInstanceName(
				parseServiceName(data.serviceName)
			)
		) {
			return sendResponse(
				{ error: "Invalid service name" },
				400 as HttpStatusCode
			);
		}
		const instance = buildServiceInstance(data, registry);
		return sendResponse(
			registry.registerInstance(instance),
			201 as HttpStatusCode
		);
	});
}

function createListServicesHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync(() => {
		return sendResponse(
			registry.instanceStore.listServiceNames(),
			200 as HttpStatusCode
		);
	});
}

function _validateServiceNameParam(
	req: import("express").Request
): string | null {
	const { serviceName } = req.params;
	if (!isNonEmptyString(serviceName)) {
		return null;
	}
	return serviceName;
}

function createGetServiceInstancesHandler(
	registry: ServiceRegistry
): RequestHandler {
	return catchSync((req) => {
		const serviceName = _validateServiceNameParam(req);
		if (!serviceName) {
			return sendResponse(
				{ error: "serviceName is required" },
				400 as HttpStatusCode
			);
		}
		if (
			!registry.tokenManager.verifyInstanceName(parseServiceName(serviceName))
		) {
			return sendResponse({ error: "Unknown service" }, 404 as HttpStatusCode);
		}
		return sendResponse(
			registry.instanceStore.getInstances(parseServiceName(serviceName)),
			200 as HttpStatusCode
		);
	});
}

function _validateRouteParams(
	req: import("express").Request
): ServiceIdentity | null {
	const { serviceName, instanceId } = req.params;
	if (!(isNonEmptyString(serviceName) && isNonEmptyString(instanceId))) {
		return null;
	}
	return {
		serviceName: toServiceId(serviceName),
		instanceId: toInstanceId(instanceId),
	};
}

function createGetInstanceHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const params = _validateRouteParams(req);
		if (!params) {
			return sendResponse(
				{ error: "Invalid route parameters" },
				400 as HttpStatusCode
			);
		}
		const instance = registry.instanceStore.getInstance(params);
		if (!instance) {
			return sendResponse(
				{ error: "Instance not found" },
				404 as HttpStatusCode
			);
		}
		return sendResponse(instance, 200 as HttpStatusCode);
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
