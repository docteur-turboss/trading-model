import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { ServiceRegistry } from "../core/service-registry";
import { validateInstanceToken } from "./helpers";

const HEARTBEAT_SCHEMA = z.object({
	serviceName: z.string().min(1, "serviceName is required"),
	instanceId: z.string().min(1, "instanceId is required"),
});

const ROTATE_TOKEN_SCHEMA = z.object({
	instanceId: z.string().min(1, "instanceId is required"),
});

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

function _createHeartbeatHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const data = _parseHeartbeatBody(req);
		if (!data) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: HEARTBEAT_SCHEMA.safeParse(req.body).error!.flatten()
						.fieldErrors,
				},
				400
			);
		}
		validateInstanceToken(
			registry,
			req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
			data.instanceId
		);
		const ttl = registry.updateHeartbeat({
			serviceName: data.serviceName,
			instanceId: data.instanceId,
		});
		if (!ttl) {
			return sendResponse({ error: "Instance not found" }, 404);
		}
		return sendResponse({ ttl }, 200);
	});
}

function _parseRotateBody(req: import("express").Request): string | null {
	const parsed = ROTATE_TOKEN_SCHEMA.safeParse(req.body);
	if (!parsed.success) {
		return null;
	}
	return parsed.data.instanceId;
}

function _createRotateTokenHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const instanceId = _parseRotateBody(req);
		if (!instanceId) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: ROTATE_TOKEN_SCHEMA.safeParse(req.body).error!.flatten()
						.fieldErrors,
				},
				400
			);
		}
		validateInstanceToken(
			registry,
			req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
			instanceId
		);
		const newToken = registry.updateToken(instanceId);
		return sendResponse({ token: newToken }, 200);
	});
}
