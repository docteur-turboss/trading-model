import type { AdminAuditFilter, PaginatedEvents } from "../types/dtos";
import { request, toQuery } from "./_request";

export const auditApi = {
	getAuditEvents: (params?: AdminAuditFilter) =>
		request<PaginatedEvents>(
			"GET",
			`/audit/events${toQuery(params as Record<string, unknown>)}`
		),
};
