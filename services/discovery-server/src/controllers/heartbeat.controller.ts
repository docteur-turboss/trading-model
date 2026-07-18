import type { InstanceId } from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import type { ResponseObject } from "@trading-model/common/middleware/response-exception";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { Request, RequestHandler, Response } from "express";
import type { ServiceRegistry } from "../core/service-registry";
import { HEARTBEAT_SCHEMA, ROTATE_TOKEN_SCHEMA } from "./heartbeat-validator";
import { validateInstanceToken } from "./helpers";

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

function _handleHeartbeat(
	req: Request,
	_res: Response,
	registry: ServiceRegistry
): ResponseObject | undefined {
	const data = _parseHeartbeatBody(req);
	if (!data) {
		return sendResponse(
			{
				error: "Invalid request body",
				details: HEARTBEAT_SCHEMA.safeParse(req.body).error!.flatten()
					.fieldErrors,
			},
			400 as HttpStatusCode
		);
	}
	validateInstanceToken(
		registry,
		req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
		data.instanceId
	);
	const ttl = registry.instanceStore.updateHeartbeat({
		serviceName: data.serviceName,
		instanceId: data.instanceId,
	});
	if (!ttl) {
		return sendResponse({ error: "Instance not found" }, 404 as HttpStatusCode);
	}
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
		return sendResponse(
			{
				error: "Invalid request body",
				details: ROTATE_TOKEN_SCHEMA.safeParse(req.body).error!.flatten()
					.fieldErrors,
			},
			400 as HttpStatusCode
		);
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
