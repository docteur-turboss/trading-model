import { parseServiceName } from "@trading-model/common/config/services.types";
import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import type { ServiceRegistry } from "../../../domain/service-registry";
import type { DISCOVERY_API } from "./api-routes";
import { buildServiceInstance } from "./register-builder";

/** The caller's IPv4 address on the connection (IPv4-mapped IPv6 unwrapped). */
function _observedIPv4(req: import("express").Request): string | undefined {
	const address = req.socket?.remoteAddress?.replace(/^::ffff:/, "");
	return address && /^\d{1,3}(\.\d{1,3}){3}$/.test(address)
		? address
		: undefined;
}

/** `POST /register`, body parsed by the route (DISCOVERY_API.register). */
export function createRegisterController(registry: ServiceRegistry): {
	register: ApiRouteHandler<(typeof DISCOVERY_API)["register"]>;
} {
	return {
		register: async ({ body }, req) => {
			if (
				!registry.tokenManager.verifyInstanceName(
					parseServiceName(body.serviceName)
				)
			) {
				return sendResponse(
					{ error: "Invalid service name" },
					400 as HttpStatusCode
				);
			}
			const instance = buildServiceInstance(body, registry, _observedIPv4(req));
			return sendResponse(
				await registry.registerInstance(instance),
				201 as HttpStatusCode
			);
		},
	};
}
