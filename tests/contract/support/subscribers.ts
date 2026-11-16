import {
	type ApiRoute,
	parseRequest,
} from "@trading-model/http/api-route/api-route";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { AUDIT_API } from "../../../services/audit-logger/src/adapters/inbound/http/api-routes";
import { createMessageHandler } from "../../../services/audit-logger/src/adapters/inbound/subscription/audit-subscriber";
import type { AuditEventDocument } from "../../../services/audit-logger/src/adapters/outbound/persistence/audit-repository";
import { auditedTopics } from "../../../services/audit-logger/src/config/audited-topics";

/** Outcome of one delivery: the HTTP answer and what the handler saw. */
export interface Reception {
	status: number;
	error?: unknown;
}

/**
 * Delivers the body the way the subscriber's server does (mountRoute): the
 * route's schema first (400 on failure), then the handler.
 */
async function throughRoute<Route extends ApiRoute>(
	route: Route,
	handler: ApiRouteHandler<Route>,
	body: unknown
): Promise<Reception> {
	const parsed = parseRequest(route, { body });
	if (!parsed.success) {
		return { status: 400, error: parsed.error };
	}
	try {
		const response = await handler(parsed.input, {} as never);
		return { status: response.status };
	} catch (error) {
		return { status: (error as { status?: number }).status ?? 500, error };
	}
}

/** audit-logger as subscribed: its `/message` handler and an in-memory store. */
export function createAuditSubscriber(): {
	topics: string[];
	documents: AuditEventDocument[];
	receive: (body: unknown) => Promise<Reception>;
} {
	const documents: AuditEventDocument[] = [];
	const repository = {
		insert: async (document: AuditEventDocument) => {
			documents.push(document);
		},
	};
	const handler = createMessageHandler(repository as never, 30);
	return {
		topics: auditedTopics(),
		documents,
		receive: (body) => throughRoute(AUDIT_API.receive, handler, body),
	};
}
