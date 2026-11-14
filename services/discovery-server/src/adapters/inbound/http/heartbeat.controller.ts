import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { Request } from "express";
import type { ServiceRegistry } from "../../../domain/service-registry";
import { incHeartbeatsTotal } from "../../../infrastructure/monitoring/metrics";
import { validateInstanceToken } from "../../../shared/helpers";
import type { DISCOVERY_API } from "./api-routes";

type Api = typeof DISCOVERY_API;

function identity(body: {
	serviceName: string;
	instanceId: string;
}): ServiceIdentity {
	return {
		serviceName: toServiceId(body.serviceName),
		instanceId: toInstanceId(body.instanceId),
	};
}

/** Throws 401 unless the request carries the instance's token. */
function checkToken(
	registry: ServiceRegistry,
	req: Request,
	instanceId: string
): Promise<void> {
	return validateInstanceToken(
		registry,
		req.headers[HTTP_HEADERS.X_INSTANCE_TOKEN],
		toInstanceId(instanceId)
	);
}

/** Handlers of the lease routes (DISCOVERY_API), body parsed by the route. */
export function createHeartbeatController(registry: ServiceRegistry): {
	heartbeat: ApiRouteHandler<Api["heartbeat"]>;
	rotateToken: ApiRouteHandler<Api["rotateToken"]>;
	unregister: ApiRouteHandler<Api["unregister"]>;
} {
	return {
		heartbeat: async ({ body }, req) => {
			const id = identity(body);
			await checkToken(registry, req, body.instanceId);
			const ttl = await registry.instanceStore.updateHeartbeat(id);
			if (!ttl) {
				return sendResponse(
					{ error: "Instance not found" },
					HTTP_STATUS.NOT_FOUND
				);
			}
			incHeartbeatsTotal(id.serviceName);
			return sendResponse({ ttl }, HTTP_STATUS.OK);
		},

		rotateToken: async ({ body }, req) => {
			await checkToken(registry, req, body.instanceId);
			const token = await registry.updateToken(toInstanceId(body.instanceId));
			return sendResponse({ token }, HTTP_STATUS.OK);
		},

		/** Graceful shutdown: an instance removes its own lease (authenticated by its token). */
		unregister: async ({ body }, req) => {
			await checkToken(registry, req, body.instanceId);
			await registry.removeInstance(identity(body));
			return sendResponse(undefined, HTTP_STATUS.NO_CONTENT);
		},
	};
}
