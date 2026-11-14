import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import {
	ALL_SERVICE_NAMES,
	type ServiceInstanceName,
} from "@trading-model/primitives/service-instance-name";
import { isAliveInstance } from "../../../domain/expiration";
import type { ServiceRegistry } from "../../../domain/service-registry";
import type { DISCOVERY_API } from "./api-routes";

type Api = typeof DISCOVERY_API;

/**
 * A service the registry may hold. An unknown name is a 404: before the
 * registry entries, `parseServiceName` threw on it and the route answered 500.
 */
function knownService(name: string): ServiceInstanceName | undefined {
	const service = name as ServiceInstanceName;
	return ALL_SERVICE_NAMES.has(service) ? service : undefined;
}

const UNKNOWN_SERVICE = () =>
	sendResponse({ error: "Unknown service" }, HTTP_STATUS.NOT_FOUND);

/** Handlers of the public read routes (DISCOVERY_API). */
export function createRegistryQueries(registry: ServiceRegistry): {
	listServices: ApiRouteHandler<Api["listServices"]>;
	getServiceInstances: ApiRouteHandler<Api["getServiceInstances"]>;
	getInstance: ApiRouteHandler<Api["getInstance"]>;
} {
	return {
		listServices: async () =>
			sendResponse(
				await registry.instanceStore.listServiceNames(),
				HTTP_STATUS.OK
			),

		getServiceInstances: async ({ params }) => {
			const service = knownService(params.serviceName);
			if (!service) {
				return UNKNOWN_SERVICE();
			}
			const instances = await registry.instanceStore.getInstances(service);
			// The stale-instance cleaner runs every few minutes: never hand out an
			// expired lease meanwhile, its address may already belong to another container.
			return sendResponse(instances.filter(isAliveInstance), HTTP_STATUS.OK);
		},

		getInstance: async ({ params }) => {
			const service = knownService(params.serviceName);
			if (!service) {
				return UNKNOWN_SERVICE();
			}
			const instance = await registry.instanceStore.getInstance({
				serviceName: toServiceId(service),
				instanceId: toInstanceId(params.instanceId),
			});
			// The store is keyed by instance id only: an instance of another
			// service, or an expired lease, is not this service's instance.
			if (
				!instance ||
				String(instance.serviceName) !== service ||
				!isAliveInstance(instance)
			) {
				return sendResponse(
					{ error: "Instance not found" },
					HTTP_STATUS.NOT_FOUND
				);
			}
			return sendResponse(instance, HTTP_STATUS.OK);
		},
	};
}
