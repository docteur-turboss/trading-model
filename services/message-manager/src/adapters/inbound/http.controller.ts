import { HTTP_STATUS } from "@trading-model/contracts/http-status";
/**
 * Handlers of the broker routes (BROKER_API): the body is parsed by the route.
 */

import { isExpectedPublisher } from "@trading-model/contracts/event-routes";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/contracts/message-types";
import { AclService } from "@trading-model/http/acl-service";
import type { ApiRouteHandler } from "@trading-model/http/api-route/mount-route";
import { mtlsDenialsTotal } from "@trading-model/http/outbound-metrics";
import {
	ResponseException,
	sendResponse,
} from "@trading-model/http/response-exception";
import type { Request } from "express";
import type { Dispatcher } from "../../application/services/dispatcher";
import type { BROKER_API } from "./api-routes";

type Api = typeof BROKER_API;

const ACL = new AclService();

/** 403 unless the SVID caller is the service the body claims to be (issue #1620). */
function assertCallerIs(req: Request, claimed: string): void {
	if (ACL.resolveCallerName(req) !== claimed) {
		mtlsDenialsTotal.inc({ reason: "identity_mismatch" });
		throw ResponseException({
			error: "Forbidden",
			reason: `caller is not "${claimed}"`,
		}).forbidden();
	}
}

const NO_CONTENT = () => sendResponse(undefined, HTTP_STATUS.NO_CONTENT);

/** Journals a dead letter for the one service it failed for, keeping its `messageId`: 204 once durable. */
export const REPLAY_A_MESSAGE =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["republish"]> =>
	async ({ body }) => {
		await dispatcher.republish(body.message as Message, body.service);
		return NO_CONTENT();
	};

/** Forwards a subscription to the dispatcher. */
export const SUBSCRIPTION_TO_A_TOPIC =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["subscribe"]> =>
	async ({ body }, req) => {
		assertCallerIs(req, body.serviceIdentity.serviceName);
		await dispatcher.subscribe(body);
		return NO_CONTENT();
	};

/** Forwards an unsubscription to the dispatcher: 403 for an instance of another service. */
export const DELETE_A_SUBSCRIPTION =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["unsubscribe"]> =>
	async ({ body }, req) => {
		if (!(await dispatcher.unsubscribe(body, ACL.resolveCallerName(req)))) {
			mtlsDenialsTotal.inc({ reason: "identity_mismatch" });
			throw ResponseException({
				error: "Forbidden",
				reason: "instance belongs to another service",
			}).forbidden();
		}
		return NO_CONTENT();
	};

/** Hands payload and metadata to the dispatcher, which stamps id and emission time and journals the message: 202 once it is durable. */
export const PUBLISH_A_MESSAGE =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["publish"]> =>
	async ({ body }, req) => {
		const { topic, publisher } = body.metadata;
		assertCallerIs(req, publisher.serviceName);
		if (!isExpectedPublisher(topic, publisher.serviceName)) {
			mtlsDenialsTotal.inc({ reason: "publisher_not_allowed" });
			throw ResponseException({
				error: "Forbidden",
				reason: `"${publisher.serviceName}" may not publish "${topic}"`,
			}).forbidden();
		}
		const messageId = await dispatcher.publish(
			body.payload,
			body.metadata as Omit<MessageMetadata, "emittedAt" | "messageId">
		);
		return sendResponse({ messageId }, HTTP_STATUS.ACCEPTED);
	};
