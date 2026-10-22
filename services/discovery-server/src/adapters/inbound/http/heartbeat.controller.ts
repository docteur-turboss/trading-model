import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import type { ResponseObject } from "@trading-model/http/adapters/inbound/response-exception";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import type { InstanceId } from "@trading-model/primitives/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { Request, RequestHandler, Response } from "express";
import type { ServiceRegistry } from "../../../domain/service-registry";
import { incHeartbeatsTotal } from "../../../infrastructure/monitoring/metrics";
import {
	HEARTBEAT_SCHEMA,
	ROTATE_TOKEN_SCHEMA,
} from "../../../shared/heartbeat-validator";
import {
	validateInstanceToken,
	validationErrorResponse,
} from "../../../shared/helpers";

interface HeartbeatController {
	heartbeat: RequestHandler;
	rotateToken: RequestHandler;
}

export function createHeartbeatController(
	registry: ServiceRegistry
): HeartbeatController {
	return {
		heartbeat: _createHeartbeatHandler(registry),
		rotateToken: _createRotateTokenHandler(registry),
	};
}

function _parseHeartbeatBody(
	req: import("express").Request
): ServiceIdentity | null {
	const parsed = HEARTBEAT_SCHEMA.safeParse(req.body);
	if (!parsed.success) {
		return null;
	}
	return {
		...parsed.data,
		serviceName: toServiceId(parsed.data.serviceName),
		instanceId: toInstanceId(parsed.data.instanceId),
	};
}

async function _handleHeartbeat(
	req: Request,
	_res: Response,
	registry: ServiceRegistry
): Promise<ResponseObject | undefined> {
	const data = _parseHeartbeatBody(req);
	if (!data) {
		return validationErrorResponse(HEARTBEAT_SCHEMA, req.body);
	}
	validateInstanceToken(
		registry,
		req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
		data.instanceId
	);
	const ttl = await registry.instanceStore.updateHeartbeat({
		serviceName: data.serviceName,
		instanceId: data.instanceId,
	});
	if (!ttl) {
		return sendResponse({ error: "Instance not found" }, 404 as HttpStatusCode);
	}
	incHeartbeatsTotal(data.serviceName);
	return sendResponse({ ttl }, 200 as HttpStatusCode);
}

function _createHeartbeatHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req, res) => _handleHeartbeat(req, res, registry));
}

function _parseRotateBody(req: import("express").Request): string | null {
	const parsed = ROTATE_TOKEN_SCHEMA.safeParse(req.body);
	if (!parsed.success) {
		return null;
	}
	return parsed.data.instanceId;
}

function _handleRotateToken(
	req: Request,
	_res: Response,
	registry: ServiceRegistry
): ResponseObject | undefined {
	const instanceId = _parseRotateBody(req);
	if (!instanceId) {
		return validationErrorResponse(ROTATE_TOKEN_SCHEMA, req.body);
	}
	validateInstanceToken(
		registry,
		req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
		instanceId as InstanceId
	);
	const newToken = registry.updateToken(instanceId as InstanceId);
	return sendResponse({ token: newToken }, 200 as HttpStatusCode);
}

function _createRotateTokenHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req, res) => _handleRotateToken(req, res, registry));
}
