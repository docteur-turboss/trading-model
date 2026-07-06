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

function _createHeartbeatHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const parsed = HEARTBEAT_SCHEMA.safeParse(req.body);
		if (!parsed.success) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors,
				},
				400
			);
		}

		const { serviceName, instanceId } = parsed.data;

		validateInstanceToken(
			registry,
			req.headers["x-instance-token"],
			instanceId
		);

		const ttl = registry.updateHeartbeat({ serviceName, instanceId });

		if (!ttl) {
			return sendResponse({ error: "Instance not found" }, 404);
		}

		return sendResponse({ ttl }, 200);
	});
}

function _createRotateTokenHandler(registry: ServiceRegistry): RequestHandler {
	return catchSync((req) => {
		const parsed = ROTATE_TOKEN_SCHEMA.safeParse(req.body);
		if (!parsed.success) {
			return sendResponse(
				{
					error: "Invalid request body",
					details: parsed.error.flatten().fieldErrors,
				},
				400
			);
		}

		const { instanceId } = parsed.data;

		validateInstanceToken(
			registry,
			req.headers["x-instance-token"],
			instanceId
		);

		const newToken = registry.updateToken(instanceId);

		return sendResponse({ token: newToken }, 200);
	});
}
