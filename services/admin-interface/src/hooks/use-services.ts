import { API_CLIENT } from "../api/api-client";
import type { ServiceRegistry } from "../types/dtos";
import { useApi } from "./use-api";

/** Fetch the service registry from the API. */
export function useServices() {
	return useApi<ServiceRegistry>(() => API_CLIENT.getServices());
}
