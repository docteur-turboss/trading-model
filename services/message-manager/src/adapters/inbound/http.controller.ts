/**
 * Handlers of the broker routes (BROKER_API): the body is parsed by the route.
 */

import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import type { Dispatcher } from "../../application/services/dispatcher";
import type { BROKER_API } from "./api-routes";

type Api = typeof BROKER_API;

const NO_CONTENT = () => sendResponse(undefined, 204 as HttpStatusCode);

/** Forwards a subscription to the dispatcher. */
export const SUBSCRIPTION_TO_A_TOPIC =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["subscribe"]> =>
	async ({ body }) => {
		await dispatcher.subscribe(body);
		return NO_CONTENT();
	};

/** Forwards an unsubscription to the dispatcher. */
export const DELETE_A_SUBSCRIPTION =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["unsubscribe"]> =>
	async ({ body }) => {
		await dispatcher.unsubscribe(body);
		return NO_CONTENT();
	};

/** Forwards payload and metadata to the dispatcher, which stamps id and emission time. */
export const PUBLISH_A_MESSAGE =
	(dispatcher: Dispatcher): ApiRouteHandler<Api["publish"]> =>
	async ({ body }) => {
		await dispatcher.publish(
			body.payload,
			body.metadata as Omit<MessageMetadata, "emittedAt" | "messageId">
		);
		return NO_CONTENT();
	};
