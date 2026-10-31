import type { EventMap } from "@trading-model/contracts/event-map";
import {
	type ApiRoute,
	parseRequest,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { BROKER_CALLBACK_API } from "../../../packages/broker-message/src/adapters/inbound/api-routes";
import { MESSAGE_CONTROLLER } from "../../../packages/broker-message/src/adapters/inbound/messages.controller";
import { EVENT_MANAGER } from "../../../packages/broker-message/src/application/services/event-manager-client";
import { AUDIT_API } from "../../../services/audit-logger/src/adapters/inbound/http/api-routes";
import { createMessageHandler } from "../../../services/audit-logger/src/adapters/inbound/subscription/audit-subscriber";
import type { AuditEventDocument } from "../../../services/audit-logger/src/adapters/outbound/persistence/audit-repository";
import { auditedTopics } from "../../../services/audit-logger/src/config/audited-topics";
import {
	DataEventHandler,
	type SubscribedMarketEvent,
} from "../../../services/trader-trainer/src/adapters/inbound/events/event-handlers";
import { MarketDataBuffer } from "../../../services/trader-trainer/src/domain/market-data-buffer";

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

/**
 * trader-trainer as subscribed: the broker-message callback controller every
 * subscriber mounts, then the trainer's own handler feeding a real buffer.
 */
export function createTrainerSubscriber(): {
	topics: SubscribedMarketEvent[];
	buffer: MarketDataBuffer;
	receive: (body: unknown) => Promise<Reception>;
	dispose: () => void;
} {
	const buffer = new MarketDataBuffer();
	const handler = new DataEventHandler(buffer);
	const topics = handler.getSubscribedIntents();
	const cleanups = topics.map((topic) =>
		EVENT_MANAGER.on(topic as keyof EventMap, (data) =>
			handler.handleEvent(topic, data)
		)
	);
	return {
		topics,
		buffer,
		receive: (body) =>
			throughRoute(BROKER_CALLBACK_API.receive, MESSAGE_CONTROLLER, body),
		dispose: () => {
			for (const cleanup of cleanups) {
				cleanup();
			}
		},
	};
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
