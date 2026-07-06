import { API_CLIENT } from "../api/api-client";
import type { AdminAuditFilter, PaginatedEvents } from "../types/dtos";
import { useApi } from "./use-api";

/** Fetch paginated audit events with optional filters. */
export function useAuditEvents(params?: AdminAuditFilter) {
	return useApi<PaginatedEvents>(
		() => API_CLIENT.getAuditEvents(params),
		[JSON.stringify(params)]
	);
}
